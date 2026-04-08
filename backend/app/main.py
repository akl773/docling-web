from __future__ import annotations

import json
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.config import Settings
from app.database import build_engine, build_session_factory, session_scope
from app.models import Base
from app.repositories import (
    create_batch_with_jobs,
    get_batch,
    get_job,
    list_batches,
    list_jobs,
)
from app.schemas import (
    BatchRead,
    ConversionSettings,
    HealthRead,
    JobRead,
    PartialConversionSettings,
)
from app.services.bundler import BatchBundleBuilder
from app.services.docling_adapter import ConversionService, DoclingConversionService
from app.services.worker import WorkerCoordinator
from app.storage import StorageManager


logger = logging.getLogger(__name__)


def create_app(
    settings: Settings | None = None,
    conversion_service: ConversionService | None = None,
) -> FastAPI:
    app_settings = settings or Settings()
    engine = build_engine(app_settings.database_url)
    session_factory = build_session_factory(engine)
    storage = StorageManager(app_settings.data_dir)
    bundler = BatchBundleBuilder(storage)
    converter = conversion_service or DoclingConversionService(app_settings)
    worker = WorkerCoordinator(
        session_factory=session_factory,
        storage=storage,
        converter=converter,
        bundler=bundler,
        max_concurrent_jobs=app_settings.max_concurrent_jobs,
        poll_interval=app_settings.worker_poll_interval,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        storage.ensure_layout()
        Base.metadata.create_all(bind=engine)
        logger.info(
            "Starting app pid=%s max_concurrent_jobs=%s uvicorn_workers=%s",
            os.getpid(),
            app_settings.max_concurrent_jobs,
            app_settings.uvicorn_workers,
        )
        worker.start()
        try:
            yield
        finally:
            worker.stop()

    app = FastAPI(title=app_settings.app_title, lifespan=lifespan)
    app.state.settings = app_settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.storage = storage
    app.state.bundler = bundler
    app.state.worker = worker

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.exception(
                "Request failed pid=%s tid=%s method=%s path=%s duration_ms=%.1f",
                os.getpid(),
                threading.get_ident(),
                request.method,
                request.url.path,
                elapsed_ms,
            )
            raise

        elapsed_ms = (time.perf_counter() - started) * 1000
        if elapsed_ms >= 1000:
            logger.warning(
                "Slow request pid=%s tid=%s method=%s path=%s status=%s duration_ms=%.1f",
                os.getpid(),
                threading.get_ident(),
                request.method,
                request.url.path,
                response.status_code,
                elapsed_ms,
            )
        return response

    @app.get("/api/health", response_model=HealthRead)
    def health() -> HealthRead:
        return HealthRead(status="ok")

    @app.post("/api/batches", response_model=BatchRead)
    async def create_batch(
        files: Annotated[list[UploadFile], File(...)],
        settings_json: Annotated[str, Form(alias="settings")] = "{}",
        overrides_json: Annotated[str, Form(alias="overrides")] = "{}",
    ) -> BatchRead:
        if not files:
            raise HTTPException(status_code=400, detail="At least one PDF is required")
        for file in files:
            if not (file.filename or "").lower().endswith(".pdf"):
                raise HTTPException(
                    status_code=400, detail="Only PDF uploads are supported"
                )

        default_settings = parse_settings(settings_json)
        overrides = parse_overrides(overrides_json)
        with session_scope(session_factory) as session:
            batch = create_batch_with_jobs(
                session, storage, files, default_settings, overrides
            )
            return BatchRead.model_validate(batch)

    @app.get("/api/batches", response_model=list[BatchRead])
    def batches() -> list[BatchRead]:
        with session_scope(session_factory) as session:
            return [BatchRead.model_validate(batch) for batch in list_batches(session)]

    @app.get("/api/batches/{batch_id}", response_model=BatchRead)
    def batch_detail(batch_id: str) -> BatchRead:
        with session_scope(session_factory) as session:
            batch = get_batch(session, batch_id)
            if batch is None:
                raise HTTPException(status_code=404, detail="Batch not found")
            return BatchRead.model_validate(batch)

    @app.get("/api/jobs", response_model=list[JobRead])
    def jobs(status: str | None = Query(default=None)) -> list[JobRead]:
        with session_scope(session_factory) as session:
            return [
                JobRead.model_validate(job) for job in list_jobs(session, status=status)
            ]

    @app.get("/api/jobs/{job_id}", response_model=JobRead)
    def job_detail(job_id: str) -> JobRead:
        with session_scope(session_factory) as session:
            job = get_job(session, job_id)
            if job is None:
                raise HTTPException(status_code=404, detail="Job not found")
            return JobRead.model_validate(job)

    @app.get("/api/jobs/{job_id}/source")
    def job_source(job_id: str) -> FileResponse:
        with session_scope(session_factory) as session:
            job = get_job(session, job_id)
            if job is None:
                raise HTTPException(status_code=404, detail="Job not found")
            source_path = storage.resolve(job.stored_pdf_path)
            if not source_path.exists():
                raise HTTPException(status_code=404, detail="Source PDF not found")
            return FileResponse(
                source_path,
                media_type="application/pdf",
                filename=job.original_filename,
                content_disposition_type="inline",
            )

    @app.get("/api/jobs/{job_id}/markdown")
    def job_markdown(job_id: str) -> PlainTextResponse:
        with session_scope(session_factory) as session:
            job = get_job(session, job_id)
            if job is None:
                raise HTTPException(status_code=404, detail="Job not found")
            markdown_path = storage.resolve(job.markdown_path)
            if not markdown_path.exists():
                raise HTTPException(status_code=404, detail="Markdown output not found")
            return PlainTextResponse(markdown_path.read_text(encoding="utf-8"))

    @app.get("/api/jobs/{job_id}/download")
    def job_download(job_id: str) -> FileResponse:
        with session_scope(session_factory) as session:
            job = get_job(session, job_id)
            if job is None:
                raise HTTPException(status_code=404, detail="Job not found")
            markdown_path = storage.resolve(job.markdown_path)
            if not markdown_path.exists():
                raise HTTPException(status_code=404, detail="Markdown output not found")
            filename = f"{Path(job.original_filename).stem}.md"
            return FileResponse(
                markdown_path,
                media_type="text/markdown",
                filename=filename,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

    @app.get("/api/batches/{batch_id}/download")
    def batch_download(batch_id: str) -> FileResponse:
        with session_scope(session_factory) as session:
            batch = get_batch(session, batch_id)
            if batch is None:
                raise HTTPException(status_code=404, detail="Batch not found")
            bundle_path = bundler.build_for_batch(session, batch_id)
            if bundle_path is None or not bundle_path.exists():
                raise HTTPException(
                    status_code=409,
                    detail="No completed outputs available for download",
                )
            filename = f"batch-{batch_id}.zip"
            return FileResponse(
                bundle_path,
                media_type="application/zip",
                filename=filename,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

    register_frontend(app, app_settings.frontend_dist_dir)
    return app


def register_frontend(app: FastAPI, frontend_dist_dir: Path) -> None:
    if not frontend_dist_dir.exists():
        return

    app.mount("/static", StaticFiles(directory=frontend_dist_dir), name="static")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str, request: Request) -> Any:
        reserved = ("api", "docs", "redoc", "openapi.json", "static")
        if any(request.url.path.lstrip("/").startswith(prefix) for prefix in reserved):
            raise HTTPException(status_code=404, detail="Not found")

        candidate = frontend_dist_dir / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)

        index_path = frontend_dist_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not built")


def parse_settings(raw_json: str) -> ConversionSettings:
    payload = json.loads(raw_json or "{}")
    return ConversionSettings.model_validate(payload)


def parse_overrides(raw_json: str) -> dict[str, PartialConversionSettings]:
    payload = json.loads(raw_json or "{}")
    return {
        key: PartialConversionSettings.model_validate(value)
        for key, value in payload.items()
    }


app = create_app()
