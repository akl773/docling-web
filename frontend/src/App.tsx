import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { JobDetail } from './components/JobDetail'
import { JobTable } from './components/JobTable'
import { ThemeToggle } from './components/ThemeToggle'
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
import { useTheme } from './lib/useTheme'
import { SkeletonStats, SkeletonJobList, SkeletonDetail } from './components/Skeletons'

function flattenJobs(batches: Batch[]): Job[] {
  return batches.flatMap((batch) => batch.jobs.map((job) => ({ ...job, batch_id: batch.id })))
}

type AppView = 'overview' | 'new-batch' | 'active-jobs' | 'history'

const VALID_VIEWS: AppView[] = ['overview', 'new-batch', 'active-jobs', 'history']

function getViewFromHash(): AppView {
  const hash = window.location.hash.replace('#', '')
  return VALID_VIEWS.includes(hash as AppView) ? (hash as AppView) : 'overview'
}

export default function App() {
  const queryClient = useQueryClient()
  const [currentView, setCurrentView] = useState<AppView>(getViewFromHash)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string>('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [theme, toggleTheme] = useTheme()

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

  const displayedActiveJobs = selectedBatchFilter
    ? activeJobs.filter((job) => job.batch_id === selectedBatchFilter)
    : activeJobs
  const displayedHistoryJobs = selectedBatchFilter
    ? historyJobs.filter((job) => job.batch_id === selectedBatchFilter)
    : historyJobs
  const batchesById = Object.fromEntries(batches.map((batch) => [batch.id, batch]))

  const doneCount = jobs.filter((job) => job.status === 'done').length
  const failedCount = jobs.filter((job) => job.status === 'failed').length
  const processingCount = jobs.filter((job) => job.status === 'processing').length
  const queuedCount = jobs.filter((job) => job.status === 'queued').length

  function navigateToView(view: AppView) {
    window.location.hash = view
    setCurrentView(view)
    setSelectedBatchFilter(null)
  }

  useEffect(() => {
    if (selectedBatchFilter) {
      const batchJobs = jobs.filter((j) => j.batch_id === selectedBatchFilter)
      if (batchJobs.length > 0 && (!selectedJobId || !batchJobs.some((j) => j.id === selectedJobId))) {
        setSelectedJobId(batchJobs[0].id)
      }
    }
  }, [selectedBatchFilter, jobs, selectedJobId])

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

  useEffect(() => {
    function onHashChange() {
      const view = getViewFromHash()
      setCurrentView(view)
      setSelectedBatchFilter(null)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    setSidebarCollapsed(currentView === 'active-jobs' || currentView === 'history')
  }, [currentView])

  const navGroups: Array<{
    label: string
    items: Array<{ id: AppView; label: string; count?: number; icon: ReactNode }>
  }> = [
    {
      label: 'Navigate',
      items: [
        {
          id: 'overview',
          label: 'Overview',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          ),
        },
        {
          id: 'new-batch',
          label: 'New Batch',
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          ),
        },
      ],
    },
    {
      label: 'Monitor',
      items: [
        {
          id: 'active-jobs',
          label: 'Active Jobs',
          count: activeJobs.length,
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          ),
        },
        {
          id: 'history',
          label: 'History',
          count: historyJobs.length,
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ),
        },
      ],
    },
  ]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-main">
          <img src="/favicon.png" alt="Docling Logo" className="app-logo" />
          <div>
            <p className="eyebrow">Docling Web</p>
            <h1>Document Conversion Console</h1>
          </div>
        </div>
        <div className="status-bar" aria-label="Queue status">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
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

      <div className={`app-frame${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <aside className="side-nav" aria-label="Application views">
          {navGroups.map((group) => (
            <nav key={group.label} className="nav-group" aria-label={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item${currentView === item.id ? ' active' : ''}`}
                  onClick={() => navigateToView(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="label">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.count !== undefined ? <span className="count">{item.count}</span> : null}
                </button>
              ))}
            </nav>
          ))}
          <button
            type="button"
            className="nav-item sidebar-toggle"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="label">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {sidebarCollapsed
                  ? <polyline points="9 18 15 12 9 6" />
                  : <polyline points="15 18 9 12 15 6" />
                }
              </svg>
              {!sidebarCollapsed && <span>Collapse</span>}
            </span>
          </button>
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
                  jobs={displayedActiveJobs}
                  batchesById={batchesById}
                  selectedJobId={selectedJobId}
                  onSelectJob={setSelectedJobId}
                  isLoading={batchesQuery.isLoading}
                  onSelectBatch={setSelectedBatchFilter}
                  selectedBatchFilter={selectedBatchFilter}
                  onClearBatchFilter={() => setSelectedBatchFilter(null)}
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
                  jobs={displayedHistoryJobs}
                  batchesById={batchesById}
                  selectedJobId={selectedJobId}
                  onSelectJob={setSelectedJobId}
                  isLoading={batchesQuery.isLoading}
                  onSelectBatch={setSelectedBatchFilter}
                  selectedBatchFilter={selectedBatchFilter}
                  onClearBatchFilter={() => setSelectedBatchFilter(null)}
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
