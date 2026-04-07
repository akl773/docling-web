import type { Batch, Job } from '../lib/api'
import { batchDownloadUrl } from '../lib/api'

type JobTableProps = {
  title: string
  description: string
  jobs: Job[]
  batchesById: Record<string, Batch>
  selectedJobId: string | null
  onSelectJob: (jobId: string) => void
}

function statusTone(status: Job['status']) {
  switch (status) {
    case 'done':
      return 'pill success'
    case 'failed':
      return 'pill danger'
    case 'processing':
      return 'pill warning'
    default:
      return 'pill muted'
  }
}

export function JobTable({ title, description, jobs, batchesById, selectedJobId, onSelectJob }: JobTableProps) {
  return (
    <section className="panel stack-md">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{description}</h2>
        </div>
      </div>

      <div className="stack-sm">
        {jobs.length === 0 ? <p className="muted">No jobs to display.</p> : null}
        {jobs.map((job) => {
          const batch = batchesById[job.batch_id]
          return (
            <button
              className={`job-card${selectedJobId === job.id ? ' selected' : ''}`}
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              type="button"
            >
              <div className="job-card-header">
                <div>
                  <strong>{job.original_filename}</strong>
                  <p>{new Date(job.created_at).toLocaleString()}</p>
                </div>
                <span className={statusTone(job.status)}>{job.status}</span>
              </div>
              <div className="progress-bar">
                <span style={{ width: `${job.progress}%` }} />
              </div>
              <div className="job-meta">
                <span>{job.progress}%</span>
                <span>Batch {job.batch_id.slice(0, 8)}</span>
                {batch ? (
                  <a href={batchDownloadUrl(batch.id)} onClick={(event) => event.stopPropagation()}>
                    Download batch zip
                  </a>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
