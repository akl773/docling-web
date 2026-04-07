from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.schemas import ConversionSettings


class FakeConversionService:
    def convert_document(self, source_path: Path, settings: ConversionSettings) -> Any:
        content = source_path.read_bytes()
        if b"FAIL" in content:
            raise ValueError("Intentional conversion failure")
        return {
            "title": source_path.stem,
            "content": content.decode("latin-1", errors="ignore"),
        }

    def save_markdown(
        self,
        document: Any,
        output_path: Path,
        assets_dir: Path,
        settings: ConversionSettings,
    ) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        assets_dir.mkdir(parents=True, exist_ok=True)
        if settings.image_handling == "referenced":
            (assets_dir / "figure.png").write_bytes(b"png")
            markdown = f"# {document['title']}\n\n![Figure](assets/figure.png)\n"
        else:
            markdown = f"# {document['title']}\n\nConverted content\n"
        output_path.write_text(markdown, encoding="utf-8")


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    data_dir = tmp_path / "data"
    frontend_dist = tmp_path / "frontend-dist"
    frontend_dist.mkdir(parents=True, exist_ok=True)
    (frontend_dist / "index.html").write_text(
        "<html><body>frontend</body></html>", encoding="utf-8"
    )
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        data_dir=data_dir,
        frontend_dist_dir=frontend_dist,
        worker_poll_interval=0.05,
        max_concurrent_jobs=1,
    )
    test_app = create_app(settings=settings, conversion_service=FakeConversionService())
    with TestClient(test_app) as test_client:
        yield test_client
