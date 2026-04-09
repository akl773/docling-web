from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from .models import BatchModel, BatchStatus, JobModel, JobStatus
from .schemas import ConversionSettings, PartialConversionSettings
from .storage import StorageManager


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_identifier() -> str:
    return uuid4().hex


def slugify_filename(filename: str) -> str:
    stem = Path(filename).stem.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return slug[:64] or "document"


def merge_settings(
    defaults: ConversionSettings, override: PartialConversionSettings | None
) -> ConversionSettings:
    merged = defaults.model_dump()
    if override is not None:
        merged.update(override.model_dump(exclude_none=True))
    return ConversionSettings.model_validate(merged)


def derive_batch_status(job_statuses: list[str]) -> str:
    if not job_statuses:
        return BatchStatus.QUEUED.value
    terminal = {JobStatus.DONE.value, JobStatus.FAILED.value, JobStatus.CANCELLED.value}
    if all(status == JobStatus.DONE.value for status in job_statuses):
        return BatchStatus.DONE.value
    if all(status == JobStatus.FAILED.value for status in job_statuses):
        return BatchStatus.FAILED.value
    if all(status == JobStatus.CANCELLED.value for status in job_statuses):
        return BatchStatus.CANCELLED.value
    if any(status == JobStatus.PROCESSING.value for status in job_statuses):
        return BatchStatus.PROCESSING.value
    if any(status == JobStatus.QUEUED.value for status in job_statuses):
        return BatchStatus.QUEUED.value
    if all(status in terminal for status in job_statuses):
        return BatchStatus.PARTIAL.value
    return BatchStatus.QUEUED.value


def refresh_batch_status(session: Session, batch_id: str) -> None:
    batch = session.get(BatchModel, batch_id)
    if batch is None:
        return
    statuses = [job.status for job in batch.jobs]
    batch.status = derive_batch_status(statuses)


def create_batch_with_jobs(
    session: Session,
    storage: StorageManager,
    files: list,
    default_settings: ConversionSettings,
    overrides: dict[str, PartialConversionSettings],
) -> BatchModel:
    batch = BatchModel(
        id=make_identifier(),
        default_settings_json=default_settings.model_dump(),
        status=BatchStatus.QUEUED.value,
        file_count=len(files),
    )
    session.add(batch)
    session.flush()

    for file in files:
        job_id = make_identifier()
        job_paths = storage.job_paths(job_id)
        settings = merge_settings(default_settings, overrides.get(file.filename or ""))
        storage.save_upload(file.file, job_id)
        job = JobModel(
            id=job_id,
            batch_id=batch.id,
            original_filename=file.filename or f"{job_id}.pdf",
            stored_pdf_path=job_paths.stored_pdf_path,
            markdown_path=job_paths.markdown_path,
            assets_dir_path=job_paths.assets_dir_path,
            zip_entry_name=f"{slugify_filename(file.filename or job_id)}-{job_id[:8]}",
            status=JobStatus.QUEUED.value,
            progress=10,
            settings_json=settings.model_dump(),
        )
        session.add(job)

    session.flush()
    batch.status = derive_batch_status([job.status for job in batch.jobs])
    session.refresh(batch)
    return get_batch(session, batch.id)


def list_batches(session: Session, limit: int = 100) -> list[BatchModel]:
    statement = (
        select(BatchModel)
        .options(selectinload(BatchModel.jobs))
        .order_by(BatchModel.created_at.desc())
        .limit(limit)
    )
    return list(session.scalars(statement).unique())


def get_batch(session: Session, batch_id: str) -> BatchModel | None:
    statement = (
        select(BatchModel)
        .options(selectinload(BatchModel.jobs))
        .where(BatchModel.id == batch_id)
    )
    return session.scalars(statement).unique().one_or_none()


def list_jobs(
    session: Session, status: str | None = None, limit: int = 200
) -> list[JobModel]:
    statement = select(JobModel).order_by(JobModel.created_at.desc()).limit(limit)
    if status is not None:
        statement = statement.where(JobModel.status == status)
    return list(session.scalars(statement))


def get_job(session: Session, job_id: str) -> JobModel | None:
    return session.get(JobModel, job_id)


def recover_processing_jobs(session: Session) -> int:
    statement = select(JobModel).where(JobModel.status == JobStatus.PROCESSING.value)
    jobs = list(session.scalars(statement))
    recovered_batch_ids: set[str] = set()
    for job in jobs:
        job.status = JobStatus.QUEUED.value
        job.progress = 10
        job.started_at = None
        recovered_batch_ids.add(job.batch_id)
    for batch_id in recovered_batch_ids:
        refresh_batch_status(session, batch_id)
    return len(jobs)


def claim_next_job(session: Session) -> str | None:
    subq = (
        select(JobModel.id)
        .where(JobModel.status == JobStatus.QUEUED.value)
        .order_by(JobModel.created_at.asc())
        .limit(1)
        .scalar_subquery()
    )
    stmt = (
        update(JobModel)
        .where(JobModel.id == subq)
        .values(
            status=JobStatus.PROCESSING.value,
            progress=25,
            started_at=utcnow(),
        )
        .returning(JobModel.id, JobModel.batch_id)
    )
    row = session.execute(stmt).first()
    if row is None:
        return None
    refresh_batch_status(session, row.batch_id)
    return row.id


def set_job_progress(session: Session, job_id: str, progress: int) -> None:
    job = session.get(JobModel, job_id)
    if job is None:
        return
    job.progress = progress


def mark_job_done(session: Session, job_id: str) -> JobModel | None:
    job = session.get(JobModel, job_id)
    if job is None:
        return None
    job.status = JobStatus.DONE.value
    job.progress = 100
    job.error_message = None
    job.finished_at = utcnow()
    refresh_batch_status(session, job.batch_id)
    return job


def mark_job_failed(
    session: Session, job_id: str, error_message: str
) -> JobModel | None:
    job = session.get(JobModel, job_id)
    if job is None:
        return None
    job.status = JobStatus.FAILED.value
    job.error_message = error_message
    job.finished_at = utcnow()
    refresh_batch_status(session, job.batch_id)
    return job


def delete_all_batches(session: Session) -> int:
    batches = list(session.scalars(select(BatchModel)))
    count = len(batches)
    for batch in batches:
        session.delete(batch)
    session.flush()
    return count


def cancel_job(session: Session, job_id: str) -> JobModel | None:
    job = session.get(JobModel, job_id)
    if job is None:
        return None
    job.status = JobStatus.CANCELLED.value
    job.finished_at = utcnow()
    job.error_message = "Cancelled by user"
    refresh_batch_status(session, job.batch_id)
    return job


def retry_failed_job(session: Session, job_id: str) -> JobModel | None:
    job = session.get(JobModel, job_id)
    if job is None:
        return None
    job.status = JobStatus.QUEUED.value
    job.progress = 10
    job.error_message = None
    job.started_at = None
    job.finished_at = None
    refresh_batch_status(session, job.batch_id)
    return job
