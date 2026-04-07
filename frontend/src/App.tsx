import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { JobDetail } from './components/JobDetail'
import { JobTable } from './components/JobTable'
import { UploadPanel } from './components/UploadPanel'
import {
  createBatch,
  fetchBatches,
  fetchJob,
  fetchMarkdown,
  type Batch,
  type FileOverrideState,
  type Job,
  type ConversionSettings,
} from './lib/api'
import { SkeletonStats, SkeletonJobList, SkeletonDetail } from './components/Skeletons'

function flattenJobs(batches: Batch[]): Job[] {
  return batches.flatMap((batch) => batch.jobs.map((job) => ({ ...job, batch_id: batch.id })))
}

type AppView = 'overview' | 'new-batch' | 'active-jobs' | 'history'

export default function App() {
  const queryClient = useQueryClient()
  const [currentView, setCurrentView] = useState<AppView>('overview')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string>('')

  const batchesQuery = useQuery({
    queryKey: ['batches'],
    queryFn: fetchBatches,
    refetchInterval: 1500,
  })

  const batches = batchesQuery.data ?? []
  const jobs = useMemo(
    () => flattenJobs(batches).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)),
    [batches],
  )
  const selectedJobFromList = jobs.find((job) => job.id === selectedJobId) ?? null

  const selectedJobQuery = useQuery({
    queryKey: ['job', selectedJobId],
    queryFn: () => fetchJob(selectedJobId!),
    enabled: selectedJobId !== null,
    refetchInterval: selectedJobFromList && ['queued', 'processing'].includes(selectedJobFromList.status) ? 1500 : false,
  })

  const selectedJob = selectedJobQuery.data ?? selectedJobFromList
  const selectedBatch = batches.find((batch) => batch.id === selectedJob?.batch_id) ?? null

  const markdownQuery = useQuery({
    queryKey: ['markdown', selectedJob?.id],
    queryFn: () => fetchMarkdown(selectedJob!.id),
    enabled: selectedJob?.status === 'done',
  })

  const uploadMutation = useMutation({
    mutationFn: (payload: {
      files: File[]
      settings: ConversionSettings
      overrides: Record<string, FileOverrideState>
    }) => createBatch(payload),
    onSuccess: async (batch) => {
      setFeedback(`Queued ${batch.file_count} file${batch.file_count === 1 ? '' : 's'} in batch ${batch.id.slice(0, 8)}.`)
      setSelectedJobId(batch.jobs[0]?.id ?? null)
      await queryClient.invalidateQueries({ queryKey: ['batches'] })
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : 'Upload failed')
    },
  })

  const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'processing')
  const historyJobs = jobs.filter((job) => job.status === 'done' || job.status === 'failed')
  const recentJobs = jobs.slice(0, 8)
  const batchesById = Object.fromEntries(batches.map((batch) => [batch.id, batch]))

  const doneCount = jobs.filter((job) => job.status === 'done').length
  const failedCount = jobs.filter((job) => job.status === 'failed').length
  const processingCount = jobs.filter((job) => job.status === 'processing').length
  const queuedCount = jobs.filter((job) => job.status === 'queued').length

  useEffect(() => {
    if (currentView === 'active-jobs') {
      if (!selectedJobId || !activeJobs.some((job) => job.id === selectedJobId)) {
        setSelectedJobId(activeJobs[0]?.id ?? null)
      }
      return
    }

    if (currentView === 'history') {
      if (!selectedJobId || !historyJobs.some((job) => job.id === selectedJobId)) {
        setSelectedJobId(historyJobs[0]?.id ?? null)
      }
      return
    }

    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(recentJobs[0]?.id ?? null)
    }
  }, [activeJobs, currentView, historyJobs, jobs, recentJobs, selectedJobId])

  const navItems: Array<{ id: AppView; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'new-batch', label: 'New Batch' },
    { id: 'active-jobs', label: 'Active Jobs', count: activeJobs.length },
    { id: 'history', label: 'History', count: historyJobs.length },
  ]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Docling Web</p>
          <h1>Document Conversion Console</h1>
        </div>
        <div className="status-bar" aria-label="Queue status">
          <span className="status-chip">
            <span className="status-dot queued" />
            Queued <span className="count">{queuedCount}</span>
          </span>
          <span className="status-chip">
            <span className="status-dot processing" />
            Processing <span className="count">{processingCount}</span>
          </span>
          <span className="status-chip">
            <span className="status-dot done" />
            Done <span className="count">{doneCount}</span>
          </span>
          <span className="status-chip">
            <span className="status-dot failed" />
            Failed <span className="count">{failedCount}</span>
          </span>
        </div>
        {feedback ? <p className="notice-banner">{feedback}</p> : null}
      </header>

      <div className="app-frame">
        <aside className="side-nav" aria-label="Application views">
          <nav>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item${currentView === item.id ? ' active' : ''}`}
                onClick={() => setCurrentView(item.id)}
              >
                <span className="label">{item.label}</span>
                {item.count !== undefined ? <span className="count">{item.count}</span> : null}
              </button>
            ))}
          </nav>
        </aside>

        <main className="view-main">
          {currentView === 'overview' ? (
            batchesQuery.isLoading ? (
              <section className="view-section stack-md">
                <SkeletonStats />
                <SkeletonJobList />
              </section>
            ) : (
              <section className="view-section stack-md">
                <div className="stats-grid" aria-label="Overview metrics">
                  <div className="stat-row">
                    <span>Total Jobs</span>
                    <strong>{jobs.length}</strong>
                  </div>
                  <div className="stat-row">
                    <span>Queued / Processing</span>
                    <strong>
                      {queuedCount} / {processingCount}
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>Done / Failed</span>
                    <strong>
                      {doneCount} / {failedCount}
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>Batches</span>
                    <strong>{batches.length}</strong>
                  </div>
                </div>
                <JobTable
                  title="Recent Jobs"
                  description="Most recent queue activity"
                  jobs={recentJobs}
                  batchesById={batchesById}
                  selectedJobId={selectedJobId}
                  onSelectJob={setSelectedJobId}
                  isLoading={batchesQuery.isLoading}
                />
              </section>
            )
          ) : null}

          {currentView === 'new-batch' ? (
            <UploadPanel onSubmit={uploadMutation.mutateAsync} isSubmitting={uploadMutation.isPending} />
          ) : null}

          {currentView === 'active-jobs' ? (
            batchesQuery.isLoading ? (
              <section className="split-view">
                <SkeletonJobList />
                <SkeletonDetail />
              </section>
            ) : (
              <section className="split-view">
                <JobTable
                  title="Active Jobs"
                  description="Queued and processing"
                  jobs={activeJobs}
                  batchesById={batchesById}
                  selectedJobId={selectedJobId}
                  onSelectJob={setSelectedJobId}
                  isLoading={batchesQuery.isLoading}
                />
                <JobDetail
                  job={selectedJob ?? null}
                  batch={selectedBatch}
                  markdown={markdownQuery.data ?? ''}
                  isMarkdownLoading={markdownQuery.isLoading}
                  isLoading={selectedJobQuery.isLoading}
                />
              </section>
            )
          ) : null}

          {currentView === 'history' ? (
            batchesQuery.isLoading ? (
              <section className="split-view">
                <SkeletonJobList />
                <SkeletonDetail />
              </section>
            ) : (
              <section className="split-view">
                <JobTable
                  title="History"
                  description="Completed and failed"
                  jobs={historyJobs}
                  batchesById={batchesById}
                  selectedJobId={selectedJobId}
                  onSelectJob={setSelectedJobId}
                  isLoading={batchesQuery.isLoading}
                />
                <JobDetail
                  job={selectedJob ?? null}
                  batch={selectedBatch}
                  markdown={markdownQuery.data ?? ''}
                  isMarkdownLoading={markdownQuery.isLoading}
                  isLoading={selectedJobQuery.isLoading}
                />
              </section>
            )
          ) : null}

          {batchesQuery.isLoading ? null : batchesQuery.isError ? <p className="footer-note">{String(batchesQuery.error)}</p> : null}
        </main>
      </div>
    </div>
  )
}
