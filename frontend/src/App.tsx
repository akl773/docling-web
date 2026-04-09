import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { JobDetail } from './components/JobDetail'
import { JobTable } from './components/JobTable'
import { ThemeToggle } from './components/ThemeToggle'
import { UploadPanel } from './components/UploadPanel'
import {
  allBatchesDownloadUrl,
  cancelJob,
  createBatch,
  deleteAllBatches,
  fetchBatches,
  fetchJob,
  fetchMarkdown,
  retryJob,
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
const MIN_LIST_PANEL_WIDTH = 260
const MAX_LIST_PANEL_WIDTH = 600
const RESIZE_HANDLE_WIDTH = 6
const MIN_DETAIL_PANEL_WIDTH = 360

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
  const [panelWidth, setPanelWidth] = useState(340)
  const isResizing = useRef(false)
  const activePointerId = useRef<number | null>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const splitViewRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  const finishResize = useCallback(() => {
    isResizing.current = false
    activePointerId.current = null
    handleRef.current?.classList.remove('active')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const getPanelBounds = useCallback(() => {
    const container = splitViewRef.current

    if (!container) {
      return { min: MIN_LIST_PANEL_WIDTH, max: MAX_LIST_PANEL_WIDTH }
    }

    const containerWidth = container.getBoundingClientRect().width
    const maxWidth = Math.max(
      MIN_LIST_PANEL_WIDTH,
      Math.min(MAX_LIST_PANEL_WIDTH, containerWidth - RESIZE_HANDLE_WIDTH - MIN_DETAIL_PANEL_WIDTH),
    )

    return { min: MIN_LIST_PANEL_WIDTH, max: maxWidth }
  }, [])

  const clampPanelWidth = useCallback(
    (width: number) => {
      const { min, max } = getPanelBounds()
      return Math.min(max, Math.max(min, width))
    },
    [getPanelBounds],
  )

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return
    }

    e.preventDefault()
    activePointerId.current = e.pointerId
    isResizing.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    handleRef.current?.classList.add('active')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing.current || activePointerId.current !== e.pointerId) {
      return
    }

    const container = splitViewRef.current
    if (!container) {
      return
    }

    const rect = container.getBoundingClientRect()
    setPanelWidth(clampPanelWidth(e.clientX - rect.left))
  }, [clampPanelWidth])

  const onResizeEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerId.current !== e.pointerId) {
        return
      }

      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }

      finishResize()
    },
    [finishResize],
  )

  useEffect(() => finishResize, [finishResize])

  useEffect(() => {
    function syncPanelWidth() {
      setPanelWidth((current) => clampPanelWidth(current))
    }

    syncPanelWidth()
    window.addEventListener('resize', syncPanelWidth)
    return () => window.removeEventListener('resize', syncPanelWidth)
  }, [clampPanelWidth, currentView])

  const splitStyle = useMemo(
    () => ({ gridTemplateColumns: `${panelWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(0, 1fr)` }),
    [panelWidth],
  )

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

  function navigateToView(view: AppView) {
    window.location.hash = view
    setCurrentView(view)
    setSelectedBatchFilter(null)
  }

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

  const retryMutation = useMutation({
    mutationFn: retryJob,
    onSuccess: async (job) => {
      setFeedback(`Requeued ${job.original_filename}.`)
      queryClient.setQueryData(['job', job.id], job)
      setSelectedJobId(job.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['batches'] }),
        queryClient.invalidateQueries({ queryKey: ['job', job.id] }),
      ])
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : 'Retry failed')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: cancelJob,
    onSuccess: async (job) => {
      setFeedback(`Cancelled ${job.original_filename}.`)
      queryClient.setQueryData(['job', job.id], job)
      setSelectedJobId(job.id)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['batches'] }),
        queryClient.invalidateQueries({ queryKey: ['job', job.id] }),
      ])
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : 'Cancel failed')
    },
  })

  const deleteAllMutation = useMutation({
    mutationFn: deleteAllBatches,
    onSuccess: async (result) => {
      setFeedback(`Deleted ${result.deleted} batch${result.deleted === 1 ? '' : 'es'} and all associated data.`)
      setSelectedJobId(null)
      await queryClient.invalidateQueries({ queryKey: ['batches'] })
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : 'Delete failed')
    },
  })

  const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'processing')
  const historyJobs = jobs.filter((job) => job.status === 'done' || job.status === 'failed' || job.status === 'cancelled')
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
  const cancelledCount = jobs.filter((job) => job.status === 'cancelled').length

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
    const header = headerRef.current
    if (!header) {
      return
    }

    const root = document.documentElement
    const syncHeaderHeight = () => {
      root.style.setProperty('--app-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`)
    }

    syncHeaderHeight()

    const observer = new ResizeObserver(syncHeaderHeight)
    observer.observe(header)
    window.addEventListener('resize', syncHeaderHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncHeaderHeight)
      root.style.removeProperty('--app-header-height')
    }
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
      <header className="app-header" ref={headerRef}>
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
          <span className="status-chip">
            <span className="status-dot cancelled" />
            Cancelled <span className="count">{cancelledCount}</span>
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
                {batches.length > 0 && (
                  <div className="bulk-actions">
                    {doneCount > 0 && (
                      <a className="btn btn-secondary" href={allBatchesDownloadUrl()} download>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download all batches
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={deleteAllMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete all ${batches.length} batch${batches.length === 1 ? '' : 'es'} and their data? This cannot be undone.`)) {
                          deleteAllMutation.mutate()
                        }
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      {deleteAllMutation.isPending ? 'Deleting...' : 'Delete all batches'}
                    </button>
                  </div>
                )}
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
              <section className="split-view" ref={splitViewRef} style={splitStyle}>
                <SkeletonJobList />
                <div
                  className="resize-handle"
                  ref={handleRef}
                  onLostPointerCapture={finishResize}
                  onPointerCancel={onResizeEnd}
                  onPointerDown={onResizeStart}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeEnd}
                />
                <SkeletonDetail />
              </section>
            ) : (
              <section className="split-view" ref={splitViewRef} style={splitStyle}>
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
                <div
                  className="resize-handle"
                  ref={handleRef}
                  onLostPointerCapture={finishResize}
                  onPointerCancel={onResizeEnd}
                  onPointerDown={onResizeStart}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeEnd}
                />
                <JobDetail
                  job={selectedJob ?? null}
                  batch={selectedBatch}
                  markdown={markdownQuery.data ?? ''}
                  isMarkdownLoading={markdownQuery.isLoading}
                  isLoading={selectedJobQuery.isLoading}
                  onRetry={selectedJob && (selectedJob.status === 'failed' || selectedJob.status === 'cancelled') ? () => retryMutation.mutateAsync(selectedJob.id) : undefined}
                  isRetrying={retryMutation.isPending && retryMutation.variables === selectedJob?.id}
                  onCancel={selectedJob && (selectedJob.status === 'queued' || selectedJob.status === 'processing') ? () => cancelMutation.mutateAsync(selectedJob.id) : undefined}
                  isCancelling={cancelMutation.isPending && cancelMutation.variables === selectedJob?.id}
                />
              </section>
            )
          ) : null}

          {currentView === 'history' ? (
            batchesQuery.isLoading ? (
              <section className="split-view" ref={splitViewRef} style={splitStyle}>
                <SkeletonJobList />
                <div
                  className="resize-handle"
                  ref={handleRef}
                  onLostPointerCapture={finishResize}
                  onPointerCancel={onResizeEnd}
                  onPointerDown={onResizeStart}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeEnd}
                />
                <SkeletonDetail />
              </section>
            ) : (
              <section className="split-view" ref={splitViewRef} style={splitStyle}>
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
                <div
                  className="resize-handle"
                  ref={handleRef}
                  onLostPointerCapture={finishResize}
                  onPointerCancel={onResizeEnd}
                  onPointerDown={onResizeStart}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeEnd}
                />
                <JobDetail
                  job={selectedJob ?? null}
                  batch={selectedBatch}
                  markdown={markdownQuery.data ?? ''}
                  isMarkdownLoading={markdownQuery.isLoading}
                  isLoading={selectedJobQuery.isLoading}
                  onRetry={selectedJob && (selectedJob.status === 'failed' || selectedJob.status === 'cancelled') ? () => retryMutation.mutateAsync(selectedJob.id) : undefined}
                  isRetrying={retryMutation.isPending && retryMutation.variables === selectedJob?.id}
                  onCancel={selectedJob && (selectedJob.status === 'queued' || selectedJob.status === 'processing') ? () => cancelMutation.mutateAsync(selectedJob.id) : undefined}
                  isCancelling={cancelMutation.isPending && cancelMutation.variables === selectedJob?.id}
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
