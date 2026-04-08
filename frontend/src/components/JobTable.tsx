import { useMemo, useState, useEffect } from 'react'
import type { Batch, Job, JobStatus } from '../lib/api'
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
  onSelectBatch?: (batchId: string) => void
  selectedBatchFilter?: string | null
  onClearBatchFilter?: () => void
}

type BatchGroup = {
  batchId: string
  batch: Batch
  jobs: Job[]
  isSingleFile: boolean
  statusBreakdown: Record<JobStatus, number>
  aggregateProgress: number
  latestCreatedAt: string
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`batch-chevron${expanded ? ' expanded' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function SingleJobRow({
  job,
  isSelected,
  onSelectJob,
}: {
  job: Job
  isSelected: boolean
  onSelectJob: (jobId: string) => void
}) {
  return (
    <button
      className={`job-row${isSelected ? ' selected' : ''}`}
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
      </div>
    </button>
  )
}

function BatchGroupHeader({
  group,
  expanded,
  onToggle,
}: {
  group: BatchGroup
  expanded: boolean
  onToggle: () => void
}) {
  const visibleCount = group.jobs.length
  const totalCount = group.batch.file_count
  const fileLabel =
    visibleCount < totalCount
      ? `${visibleCount} of ${totalCount} files`
      : `${totalCount} files`

  const statusEntries = (Object.entries(group.statusBreakdown) as [JobStatus, number][]).filter(
    ([, count]) => count > 0,
  )

  return (
    <div className="batch-group-header" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}>
      <div className="batch-group-header-top">
        <div className="batch-group-header-left">
          <ChevronIcon expanded={expanded} />
          <div>
            <strong>Batch {group.batchId.slice(0, 8)}</strong>
            <p>{fileLabel} &middot; {new Date(group.latestCreatedAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="batch-status-summary">
          {statusEntries.map(([status, count]) => (
            <span key={status} className={`pill mini ${status}`}>
              {count} {status}
            </span>
          ))}
        </div>
      </div>
      <div className="progress-bar">
        <span style={{ width: `${group.aggregateProgress}%` }} />
      </div>
      <div className="job-meta">
        <span>{Math.round(group.aggregateProgress)}%</span>
        <a
          href={batchDownloadUrl(group.batch.id)}
          onClick={(e) => e.stopPropagation()}
        >
          Download batch zip
        </a>
      </div>
    </div>
  )
}

function BatchGroupJobRow({
  job,
  isSelected,
  onSelectJob,
}: {
  job: Job
  isSelected: boolean
  onSelectJob: (jobId: string) => void
}) {
  return (
    <button
      className={`job-row batch-child${isSelected ? ' selected' : ''}`}
      onClick={() => onSelectJob(job.id)}
      type="button"
      role="listitem"
    >
      <div className="job-row-main">
        <div>
          <strong>{job.original_filename}</strong>
        </div>
        <span className={`pill ${job.status}`}>{job.status}</span>
      </div>
      <div className="progress-bar">
        <span style={{ width: `${job.progress}%` }} />
      </div>
      <div className="job-meta">
        <span>{job.progress}%</span>
      </div>
    </button>
  )
}

// Flat job row used when grouping is disabled (overview, batch filter active)
function FlatJobRow({
  job,
  batch,
  isSelected,
  onSelectJob,
  onSelectBatch,
  selectedBatchFilter,
}: {
  job: Job
  batch: Batch | undefined
  isSelected: boolean
  onSelectJob: (jobId: string) => void
  onSelectBatch?: (batchId: string) => void
  selectedBatchFilter?: string | null
}) {
  return (
    <button
      className={`job-row${isSelected ? ' selected' : ''}`}
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
        {batch && batch.file_count > 1 && onSelectBatch && !selectedBatchFilter ? (
          <button
            type="button"
            className="batch-badge"
            onClick={(event) => {
              event.stopPropagation()
              onSelectBatch(job.batch_id)
            }}
          >
            {batch.file_count} files
          </button>
        ) : null}
        {batch ? (
          <a href={batchDownloadUrl(batch.id)} onClick={(event) => event.stopPropagation()}>
            Download batch zip
          </a>
        ) : null}
      </div>
    </button>
  )
}

export function JobTable({ title, description, jobs, batchesById, selectedJobId, onSelectJob, isLoading, onSelectBatch, selectedBatchFilter, onClearBatchFilter }: JobTableProps) {
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())

  const enableGrouping = !!onSelectBatch && !selectedBatchFilter

  const groups = useMemo<BatchGroup[]>(() => {
    if (!enableGrouping) return []

    const map = new Map<string, Job[]>()
    for (const job of jobs) {
      const list = map.get(job.batch_id)
      if (list) list.push(job)
      else map.set(job.batch_id, [job])
    }

    const result: BatchGroup[] = []
    for (const [batchId, batchJobs] of map) {
      const batch = batchesById[batchId]
      if (!batch) continue

      const statusBreakdown: Record<JobStatus, number> = { queued: 0, processing: 0, done: 0, failed: 0 }
      let totalProgress = 0
      let latestCreatedAt = batchJobs[0].created_at
      for (const j of batchJobs) {
        statusBreakdown[j.status]++
        totalProgress += j.progress
        if (j.created_at > latestCreatedAt) latestCreatedAt = j.created_at
      }

      result.push({
        batchId,
        batch,
        jobs: batchJobs,
        isSingleFile: batch.file_count === 1,
        statusBreakdown,
        aggregateProgress: batchJobs.length > 0 ? totalProgress / batchJobs.length : 0,
        latestCreatedAt,
      })
    }

    result.sort((a, b) => {
      const aActive = a.statusBreakdown.processing > 0 ? 2 : a.statusBreakdown.queued > 0 ? 1 : 0
      const bActive = b.statusBreakdown.processing > 0 ? 2 : b.statusBreakdown.queued > 0 ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      return a.latestCreatedAt > b.latestCreatedAt ? -1 : 1
    })
    return result
  }, [jobs, batchesById, enableGrouping])

  // Auto-expand the batch containing the selected job (only when selection changes)
  useEffect(() => {
    if (!enableGrouping || !selectedJobId) return
    const job = jobs.find((j) => j.id === selectedJobId)
    if (!job) return
    const batch = batchesById[job.batch_id]
    if (batch && batch.file_count > 1) {
      setExpandedBatches((prev) => {
        if (prev.has(job.batch_id)) return prev
        const next = new Set(prev)
        next.add(job.batch_id)
        return next
      })
    }
  }, [selectedJobId, enableGrouping, jobs, batchesById])

  function toggleBatch(batchId: string) {
    setExpandedBatches((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  return (
    <section className="view-section">
      <div className="section-header">
        <div>
          {selectedBatchFilter ? (
            <>
              <p className="eyebrow">
                <button type="button" className="breadcrumb-link" onClick={onClearBatchFilter}>
                  {title}
                </button>
                {' \u203A '}
                Batch {selectedBatchFilter.slice(0, 8)}
              </p>
              <h2>{jobs.length} file{jobs.length === 1 ? '' : 's'} in batch</h2>
            </>
          ) : (
            <>
              <p className="eyebrow">{title}</p>
              <h2>{description}</h2>
            </>
          )}
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
        ) : enableGrouping ? (
          groups.map((group) =>
            group.isSingleFile ? (
              <SingleJobRow
                key={group.batchId}
                job={group.jobs[0]}
                isSelected={selectedJobId === group.jobs[0].id}
                onSelectJob={onSelectJob}
              />
            ) : (
              <div className="batch-group" key={group.batchId}>
                <BatchGroupHeader
                  group={group}
                  expanded={expandedBatches.has(group.batchId)}
                  onToggle={() => toggleBatch(group.batchId)}
                />
                {expandedBatches.has(group.batchId) ? (
                  <div className="batch-group-jobs">
                    {group.jobs.map((job) => (
                      <BatchGroupJobRow
                        key={job.id}
                        job={job}
                        isSelected={selectedJobId === job.id}
                        onSelectJob={onSelectJob}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ),
          )
        ) : (
          jobs.map((job) => (
            <FlatJobRow
              key={job.id}
              job={job}
              batch={batchesById[job.batch_id]}
              isSelected={selectedJobId === job.id}
              onSelectJob={onSelectJob}
              onSelectBatch={onSelectBatch}
              selectedBatchFilter={selectedBatchFilter}
            />
          ))
        )}
      </div>
    </section>
  )
}
