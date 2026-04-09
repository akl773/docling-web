from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO


@dataclass(frozen=True)
class JobPaths:
    stored_pdf_path: str
    markdown_path: str
    assets_dir_path: str


class StorageManager:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir

    def ensure_layout(self) -> None:
        for path in (
            self.data_dir,
            self.uploads_dir,
            self.results_dir,
            self.bundles_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def results_dir(self) -> Path:
        return self.data_dir / "results"

    @property
    def bundles_dir(self) -> Path:
        return self.data_dir / "bundles"

    def job_paths(self, job_id: str) -> JobPaths:
        source = self.uploads_dir / job_id / "source.pdf"
        markdown = self.results_dir / job_id / "output.md"
        assets = self.results_dir / job_id / "assets"
        return JobPaths(
            stored_pdf_path=self.relative_to_data(source),
            markdown_path=self.relative_to_data(markdown),
            assets_dir_path=self.relative_to_data(assets),
        )

    def bundle_path(self, batch_id: str) -> Path:
        return self.bundles_dir / f"{batch_id}.zip"

    def relative_to_data(self, path: Path) -> str:
        return path.relative_to(self.data_dir).as_posix()

    def resolve(self, relative_path: str) -> Path:
        return self.data_dir / relative_path

    def save_upload(self, stream: BinaryIO, job_id: str) -> str:
        destination = self.resolve(self.job_paths(job_id).stored_pdf_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as output:
            shutil.copyfileobj(stream, output)
        return self.relative_to_data(destination)

    def purge_all(self) -> None:
        for directory in (self.uploads_dir, self.results_dir, self.bundles_dir):
            if directory.exists():
                shutil.rmtree(directory)
            directory.mkdir(parents=True, exist_ok=True)

    def prepare_results_dir(self, job_id: str) -> tuple[Path, Path]:
        result_dir = self.results_dir / job_id
        if result_dir.exists():
            shutil.rmtree(result_dir)
        assets_dir = result_dir / "assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        return result_dir / "output.md", assets_dir
