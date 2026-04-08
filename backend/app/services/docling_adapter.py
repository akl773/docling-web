from __future__ import annotations

# pyright: reportMissingImports=false

import shutil
from pathlib import Path
from typing import Any, Protocol

from app.config import Settings
from app.schemas import ConversionSettings


class ConversionService(Protocol):
    def convert_document(
        self, source_path: Path, settings: ConversionSettings
    ) -> Any: ...

    def save_markdown(
        self,
        document: Any,
        output_path: Path,
        assets_dir: Path,
        settings: ConversionSettings,
    ) -> None: ...


class DoclingConversionService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def convert_document(self, source_path: Path, settings: ConversionSettings) -> Any:
        from docling.datamodel.accelerator_options import (
            AcceleratorDevice,
            AcceleratorOptions,
        )
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import (
            PdfPipelineOptions,
            TableFormerMode,
            TableStructureOptions,
        )
        from docling.document_converter import DocumentConverter, PdfFormatOption

        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = settings.ocr_enabled
        pipeline_options.do_table_structure = settings.table_mode != "off"
        pipeline_options.generate_page_images = False
        pipeline_options.generate_picture_images = settings.image_handling != "none"
        pipeline_options.accelerator_options = AcceleratorOptions(
            num_threads=self.settings.omp_num_threads,
            device=AcceleratorDevice.AUTO,
        )

        if settings.table_mode != "off":
            mode = (
                TableFormerMode.FAST
                if settings.table_mode == "fast"
                else TableFormerMode.ACCURATE
            )
            pipeline_options.table_structure_options = TableStructureOptions(mode=mode)

        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
            }
        )
        result = converter.convert(source_path)
        return result.document

    def save_markdown(
        self,
        document: Any,
        output_path: Path,
        assets_dir: Path,
        settings: ConversionSettings,
    ) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        assets_dir.mkdir(parents=True, exist_ok=True)

        if settings.image_handling == "none":
            output_path.write_text(document.export_to_markdown(), encoding="utf-8")
            return

        from docling_core.types.doc import ImageRefMode

        image_mode = (
            ImageRefMode.EMBEDDED
            if settings.image_handling == "embedded"
            else ImageRefMode.REFERENCED
        )
        document.save_as_markdown(str(output_path), image_mode=image_mode)

        if settings.image_handling == "referenced":
            self._relocate_referenced_assets(output_path, assets_dir)

    def _relocate_referenced_assets(self, output_path: Path, assets_dir: Path) -> None:
        reference_map: dict[str, str] = {}

        for path in output_path.parent.rglob("*"):
            if path == output_path or path == assets_dir or assets_dir in path.parents:
                continue
            if path.is_dir():
                continue
            old_rel = path.relative_to(output_path.parent).as_posix()
            destination = assets_dir / old_rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), destination)
            reference_map[old_rel] = destination.relative_to(
                output_path.parent
            ).as_posix()

        if not reference_map:
            return

        markdown = output_path.read_text(encoding="utf-8")
        for old_rel, new_rel in reference_map.items():
            markdown = markdown.replace(f"]({old_rel})", f"]({new_rel})")
            markdown = markdown.replace(f'src="{old_rel}"', f'src="{new_rel}"')
        output_path.write_text(markdown, encoding="utf-8")


def run_docling_conversion_job(
    source_path: str,
    output_path: str,
    assets_dir: str,
    conversion_settings: dict[str, Any],
    app_settings: dict[str, Any],
) -> None:
    service = DoclingConversionService(Settings.model_validate(app_settings))
    settings = ConversionSettings.model_validate(conversion_settings)
    document = service.convert_document(Path(source_path), settings)
    service.save_markdown(document, Path(output_path), Path(assets_dir), settings)
