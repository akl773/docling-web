import { useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'

import type { ConversionSettings, FileOverrideState, ImageHandling, TableMode } from '../lib/api'

type UploadPanelProps = {
  onSubmit: (payload: {
    files: File[]
    settings: ConversionSettings
    overrides: Record<string, FileOverrideState>
  }) => Promise<unknown>
  isSubmitting: boolean
}

const defaultSettings: ConversionSettings = {
  ocr_enabled: true,
  table_mode: 'fast',
  image_handling: 'none',
}

type OverrideSelection = {
  ocr_enabled: 'default' | 'true' | 'false'
  table_mode: 'default' | TableMode
  image_handling: 'default' | ImageHandling
}

function buildDefaultSelection(): OverrideSelection {
  return {
    ocr_enabled: 'default',
    table_mode: 'default',
    image_handling: 'default',
  }
}

export function UploadPanel({ onSubmit, isSubmitting }: UploadPanelProps) {
  const [files, setFiles] = useState<File[]>([])
  const [settings, setSettings] = useState<ConversionSettings>(defaultSettings)
  const [overrides, setOverrides] = useState<Record<string, OverrideSelection>>({})

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: (acceptedFiles) => {
      setFiles((current) => {
        const merged = [...current]
        for (const file of acceptedFiles) {
          if (!merged.some((item) => item.name === file.name && item.size === file.size)) {
            merged.push(file)
          }
        }
        return merged
      })
      setOverrides((current) => {
        const next = { ...current }
        for (const file of acceptedFiles) {
          next[file.name] = next[file.name] ?? buildDefaultSelection()
        }
        return next
      })
    },
  })

  const fileRows = useMemo(() => files.map((file) => ({ file, override: overrides[file.name] ?? buildDefaultSelection() })), [files, overrides])

  async function handleSubmit() {
    if (files.length === 0 || isSubmitting) {
      return
    }

    const payloadOverrides: Record<string, FileOverrideState> = {}
    for (const file of files) {
      const override = overrides[file.name] ?? buildDefaultSelection()
      const next: FileOverrideState = {}
      if (override.ocr_enabled !== 'default') {
        next.ocr_enabled = override.ocr_enabled === 'true'
      }
      if (override.table_mode !== 'default') {
        next.table_mode = override.table_mode
      }
      if (override.image_handling !== 'default') {
        next.image_handling = override.image_handling
      }
      if (Object.keys(next).length > 0) {
        payloadOverrides[file.name] = next
      }
    }

    await onSubmit({ files, settings, overrides: payloadOverrides })
    setFiles([])
    setOverrides({})
  }

  function removeFile(name: string) {
    setFiles((current) => current.filter((file) => file.name !== name))
    setOverrides((current) => {
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  function updateOverride(name: string, patch: Partial<OverrideSelection>) {
    setOverrides((current) => ({
      ...current,
      [name]: {
        ...(current[name] ?? buildDefaultSelection()),
        ...patch,
      },
    }))
  }

  return (
    <section className="view-section">
      <div>
        <p className="eyebrow">New Batch</p>
        <h2>Queue PDFs with shared and per-file settings</h2>
      </div>

      <div {...getRootProps({ className: `dropzone${isDragActive ? ' dropzone-active' : ''}` })}>
        <input {...getInputProps()} />
        <p>{isDragActive ? 'Drop PDFs to queue them' : 'Drag PDFs here or click to pick files'}</p>
        <span>Batch uploads, persisted history, and restart-safe processing.</span>
      </div>

      <div className="form-band">
        <div className="field-row">
          <label>
            <span>OCR</span>
            <select
              value={settings.ocr_enabled ? 'on' : 'off'}
              onChange={(event) => setSettings((current) => ({ ...current, ocr_enabled: event.target.value === 'on' }))}
            >
              <option value="on">Enabled</option>
              <option value="off">Disabled</option>
            </select>
          </label>
          <label>
            <span>Tables</span>
            <select
              value={settings.table_mode}
              onChange={(event) => setSettings((current) => ({ ...current, table_mode: event.target.value as TableMode }))}
            >
              <option value="off">Off</option>
              <option value="fast">Fast</option>
              <option value="accurate">Accurate</option>
            </select>
          </label>
          <label>
            <span>Images</span>
            <select
              value={settings.image_handling}
              onChange={(event) => setSettings((current) => ({ ...current, image_handling: event.target.value as ImageHandling }))}
            >
              <option value="none">None</option>
              <option value="referenced">Referenced</option>
              <option value="embedded">Embedded</option>
            </select>
          </label>
        </div>
      </div>

      {fileRows.length > 0 && (
        <div className="file-list">
          {fileRows.map(({ file, override }) => (
            <div className="file-row" key={`${file.name}-${file.size}`}>
              <div>
                <strong>{file.name}</strong>
                <p>{Math.ceil(file.size / 1024)} KB</p>
              </div>
              <div className="override-grid">
                <select value={override.ocr_enabled} onChange={(event) => updateOverride(file.name, { ocr_enabled: event.target.value as OverrideSelection['ocr_enabled'] })}>
                  <option value="default">OCR: Default</option>
                  <option value="true">OCR: On</option>
                  <option value="false">OCR: Off</option>
                </select>
                <select value={override.table_mode} onChange={(event) => updateOverride(file.name, { table_mode: event.target.value as OverrideSelection['table_mode'] })}>
                  <option value="default">Tables: Default</option>
                  <option value="off">Tables: Off</option>
                  <option value="fast">Tables: Fast</option>
                  <option value="accurate">Tables: Accurate</option>
                </select>
                <select value={override.image_handling} onChange={(event) => updateOverride(file.name, { image_handling: event.target.value as OverrideSelection['image_handling'] })}>
                  <option value="default">Images: Default</option>
                  <option value="none">Images: None</option>
                  <option value="referenced">Images: Referenced</option>
                  <option value="embedded">Images: Embedded</option>
                </select>
              </div>
              <button className="ghost-button" type="button" onClick={() => removeFile(file.name)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="primary-button" disabled={files.length === 0 || isSubmitting} onClick={() => void handleSubmit()} type="button">
        {isSubmitting ? 'Queueing...' : `Queue ${files.length || ''} PDF${files.length === 1 ? '' : 's'}`}
      </button>
    </section>
  )
}
