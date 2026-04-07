from __future__ import annotations

import io
import time
import zipfile


def wait_for_job(
    client, job_id: str, expected_terminal: set[str] | None = None
) -> dict:
    deadline = time.time() + 5
    terminal = expected_terminal or {"done", "failed"}
    while time.time() < deadline:
        payload = client.get(f"/api/jobs/{job_id}")
        payload.raise_for_status()
        job = payload.json()
        if job["status"] in terminal:
            return job
        time.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not reach terminal status")


def test_upload_and_retrieve_markdown(client) -> None:
    response = client.post(
        "/api/batches",
        files=[("files", ("sample.pdf", b"%PDF-1.4 sample", "application/pdf"))],
        data={
            "settings": '{"ocr_enabled": true, "table_mode": "fast", "image_handling": "none"}'
        },
    )
    response.raise_for_status()
    batch = response.json()
    assert batch["file_count"] == 1

    job_id = batch["jobs"][0]["id"]
    job = wait_for_job(client, job_id)
    assert job["status"] == "done"
    assert job["progress"] == 100

    markdown = client.get(f"/api/jobs/{job_id}/markdown")
    markdown.raise_for_status()
    assert "Converted content" in markdown.text


def test_failed_job_does_not_block_batch(client) -> None:
    response = client.post(
        "/api/batches",
        files=[
            ("files", ("good.pdf", b"%PDF-1.4 success", "application/pdf")),
            ("files", ("bad.pdf", b"%PDF-1.4 FAIL", "application/pdf")),
        ],
        data={
            "settings": '{"ocr_enabled": true, "table_mode": "fast", "image_handling": "none"}'
        },
    )
    response.raise_for_status()
    batch = response.json()
    jobs = [wait_for_job(client, item["id"]) for item in batch["jobs"]]

    statuses = sorted(job["status"] for job in jobs)
    assert statuses == ["done", "failed"]

    refreshed_batch = client.get(f"/api/batches/{batch['id']}")
    refreshed_batch.raise_for_status()
    assert refreshed_batch.json()["status"] == "partial"


def test_batch_download_contains_outputs_and_assets(client) -> None:
    response = client.post(
        "/api/batches",
        files=[("files", ("assets.pdf", b"%PDF-1.4 assets", "application/pdf"))],
        data={
            "settings": '{"ocr_enabled": true, "table_mode": "fast", "image_handling": "referenced"}'
        },
    )
    response.raise_for_status()
    batch = response.json()
    job_id = batch["jobs"][0]["id"]
    wait_for_job(client, job_id)

    download = client.get(f"/api/batches/{batch['id']}/download")
    download.raise_for_status()

    archive = zipfile.ZipFile(io.BytesIO(download.content))
    names = sorted(archive.namelist())
    assert any(name.endswith("/output.md") for name in names)
    assert any(name.endswith("/assets/figure.png") for name in names)
