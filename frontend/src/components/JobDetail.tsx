import { useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

import type { Batch, Job } from '../lib/api'
import { batchDownloadUrl, jobDownloadUrl, jobSourceUrl } from '../lib/api'
import { SkeletonDetail } from './Skeletons'

function urlTransform(url: string, key: string): string {
  if (key === 'src' && url.startsWith('data:image/')) {
    return url
  }
  return defaultUrlTransform(url)
}

type JobDetailProps = {
  job: Job | null
  batch: Batch | null
  markdown: string
  isMarkdownLoading: boolean
  isLoading?: boolean
  onRetry?: () => Promise<unknown> | void
  isRetrying?: boolean
  onCancel?: () => Promise<unknown> | void
  isCancelling?: boolean
}

export function JobDetail({ job, batch, markdown, isMarkdownLoading, isLoading, onRetry, isRetrying = false, onCancel, isCancelling = false }: JobDetailProps) {
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
          {(job.status === 'queued' || job.status === 'processing') && onCancel ? (
            <button className="action-pill danger" disabled={isCancelling} onClick={() => void onCancel()} type="button" title="Cancel job">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              <span>{isCancelling ? 'Cancelling...' : 'Cancel'}</span>
            </button>
          ) : null}
          {(job.status === 'failed' || job.status === 'cancelled') && onRetry ? (
            <button className="action-pill" disabled={isRetrying} onClick={() => void onRetry()} type="button" title="Retry job">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" /><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" /></svg>
              <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
            </button>
          ) : null}
          <a className="action-pill" href={jobDownloadUrl(job.id)} title="Download markdown">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Markdown</span>
          </a>
          {batch ? (
            <a className="action-pill" href={batchDownloadUrl(batch.id)} title="Download batch zip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Batch zip</span>
            </a>
          ) : null}
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
          <div className="preview-pane-header">
            <div className="preview-pane-title">Markdown</div>
            <button
              className="copy-icon-button"
              disabled={!markdown}
              onClick={() => void copyMarkdown()}
              type="button"
              title="Copy markdown"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
          {isMarkdownLoading ? <p className="muted">Loading generated markdown...</p> : null}
          {!isMarkdownLoading && !markdown && job.status !== 'done' ? (
            <p className="muted">
              {job.status === 'cancelled' ? 'Job was cancelled before conversion completed.' : 'Markdown will appear when conversion completes.'}
            </p>
          ) : null}
          {!isMarkdownLoading && markdown ? (
            <div className="markdown-shell">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                urlTransform={urlTransform}
              >
                {markdown}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
