import ReactMarkdown from 'react-markdown'

import type { Batch, Job } from '../lib/api'
import { batchDownloadUrl, jobDownloadUrl, jobSourceUrl } from '../lib/api'

type JobDetailProps = {
  job: Job | null
  batch: Batch | null
  markdown: string
  isMarkdownLoading: boolean
}

export function JobDetail({ job, batch, markdown, isMarkdownLoading }: JobDetailProps) {
  async function copyMarkdown() {
    if (!markdown) {
      return
    }
    await navigator.clipboard.writeText(markdown)
  }

  if (!job) {
    return (
      <section className="panel empty-state">
        <p className="eyebrow">Preview</p>
        <h2>Select a job to inspect the original PDF and generated Markdown.</h2>
      </section>
    )
  }

  return (
    <section className="panel detail-panel stack-md">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Job Detail</p>
          <h2>{job.original_filename}</h2>
        </div>
        <div className="action-row">
          <a className="ghost-link" href={jobDownloadUrl(job.id)}>
            Download markdown
          </a>
          {batch ? (
            <a className="ghost-link" href={batchDownloadUrl(batch.id)}>
              Download batch zip
            </a>
          ) : null}
          <button className="ghost-button" disabled={!markdown} onClick={() => void copyMarkdown()} type="button">
            Copy markdown
          </button>
        </div>
      </div>

      <div className="detail-meta">
        <span className="pill muted">{job.status}</span>
        <span>{job.progress}%</span>
        <span>OCR {job.settings_json.ocr_enabled ? 'on' : 'off'}</span>
        <span>Tables {job.settings_json.table_mode}</span>
        <span>Images {job.settings_json.image_handling}</span>
      </div>

      {job.error_message ? <p className="error-banner">{job.error_message}</p> : null}

      <div className="preview-grid">
        <div className="preview-card stack-sm">
          <div className="preview-title">Original PDF</div>
          <iframe src={jobSourceUrl(job.id)} title={`PDF preview for ${job.original_filename}`} />
        </div>
        <div className="preview-card stack-sm">
          <div className="preview-title">Markdown</div>
          {isMarkdownLoading ? <p className="muted">Loading generated markdown...</p> : null}
          {!isMarkdownLoading && !markdown && job.status !== 'done' ? <p className="muted">Markdown will appear when conversion completes.</p> : null}
          {!isMarkdownLoading && markdown ? (
            <div className="markdown-shell">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
