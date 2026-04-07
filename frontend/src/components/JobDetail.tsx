import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

import type { Batch, Job } from '../lib/api'
import { batchDownloadUrl, jobDownloadUrl, jobSourceUrl } from '../lib/api'
import { SkeletonDetail } from './Skeletons'

type JobDetailProps = {
  job: Job | null
  batch: Batch | null
  markdown: string
  isMarkdownLoading: boolean
  isLoading?: boolean
}

export function JobDetail({ job, batch, markdown, isMarkdownLoading, isLoading }: JobDetailProps) {
  const [previewTab, setPreviewTab] = useState<'pdf' | 'markdown'>('pdf')

  async function copyMarkdown() {
    if (!markdown) {
      return
    }
    await navigator.clipboard.writeText(markdown)
  }

  if (isLoading) {
    return <SkeletonDetail />
  }

  if (!job) {
    return (
      <section className="view-section empty-state">
        <h2>Select a job to inspect the original PDF and generated Markdown.</h2>
      </section>
    )
  }

  return (
    <section className="view-section detail-panel">
      <div className="detail-header">
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
        <span className={`pill ${job.status}`}>{job.status}</span>
        <span>{job.progress}%</span>
        <span>OCR {job.settings_json.ocr_enabled ? 'on' : 'off'}</span>
        <span>Tables {job.settings_json.table_mode}</span>
        <span>Images {job.settings_json.image_handling}</span>
      </div>

      {job.error_message ? <p className="error-banner">{job.error_message}</p> : null}

      <div className="preview-tabs" role="tablist" aria-label="Preview tabs">
        <button
          type="button"
          role="tab"
          aria-selected={previewTab === 'pdf'}
          className={`tab-button${previewTab === 'pdf' ? ' active' : ''}`}
          onClick={() => setPreviewTab('pdf')}
        >
          PDF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={previewTab === 'markdown'}
          className={`tab-button${previewTab === 'markdown' ? ' active' : ''}`}
          onClick={() => setPreviewTab('markdown')}
        >
          Markdown
        </button>
      </div>

      <div className="preview-grid">
        <div className={`preview-pane${previewTab !== 'pdf' ? ' pane-hidden-mobile' : ''}`}>
          <div className="preview-pane-title">Original PDF</div>
          <iframe src={jobSourceUrl(job.id)} title={`PDF preview for ${job.original_filename}`} />
        </div>
        <div className={`preview-pane${previewTab !== 'markdown' ? ' pane-hidden-mobile' : ''}`}>
          <div className="preview-pane-title">Markdown</div>
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
