import type { Batch, Job } from '../lib/api'
import { batchDownloadUrl } from '../lib/api'
import { SkeletonJobRow } from './Skeletons'

type JobTableProps = {
  title: string
  description: string
  jobs: Job[]
  batchesById: Record<string, Batch>
  selectedJobId: string | null
  onSelectJob: (jobId: string) => void
  isLoading?: boolean
}

export function JobTable({ title, description, jobs, batchesById, selectedJobId, onSelectJob, isLoading }: JobTableProps) {
  return (
    <section className="view-section">
      <div className="section-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{description}</h2>
        </div>
      </div>

      <div className="job-list" role="list">
        {isLoading ? (
          <>
            <SkeletonJobRow />
            <SkeletonJobRow />
            <SkeletonJobRow />
            <SkeletonJobRow />
            <SkeletonJobRow />
          </>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            <p>No jobs to display.</p>
          </div>
        ) : (
          jobs.map((job) => {
            const batch = batchesById[job.batch_id]
            return (
              <button
                className={`job-row${selectedJobId === job.id ? ' selected' : ''}`}
                key={job.id}
                onClick={() => onSelectJob(job.id)}
                type="button"
                role="listitem"
              >
                <div className="job-row-main">
                  <div>
                    <strong>{job.original_filename}</strong>
                    <p>{new Date(job.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`pill ${job.status}`}>{job.status}</span>
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
          })
        )}
      </div>
    </section>
  )
}
