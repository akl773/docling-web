export function SkeletonStats() {
  return (
    <div className="skeleton-stats" aria-label="Loading stats">
      <div className="skeleton-stat">
        <span className="skeleton skeleton-text-sm" style={{ width: '80px' }} />
        <span className="skeleton skeleton-text" style={{ width: '40px' }} />
      </div>
      <div className="skeleton-stat">
        <span className="skeleton skeleton-text-sm" style={{ width: '120px' }} />
        <span className="skeleton skeleton-text" style={{ width: '60px' }} />
      </div>
      <div className="skeleton-stat">
        <span className="skeleton skeleton-text-sm" style={{ width: '100px' }} />
        <span className="skeleton skeleton-text" style={{ width: '60px' }} />
      </div>
      <div className="skeleton-stat">
        <span className="skeleton skeleton-text-sm" style={{ width: '60px' }} />
        <span className="skeleton skeleton-text" style={{ width: '30px' }} />
      </div>
    </div>
  )
}

export function SkeletonJobList() {
  return (
    <div className="job-list" role="list">
      {[1, 2, 3, 4, 5].map((i) => (
        <div className="skeleton skeleton-row" key={i} role="listitem" />
      ))}
    </div>
  )
}

export function SkeletonJobRow() {
  return (
    <div className="job-row">
      <div className="job-row-main">
        <div>
          <div className="skeleton skeleton-text" style={{ width: '200px', marginBottom: '4px' }} />
          <div className="skeleton skeleton-text-sm" style={{ width: '140px' }} />
        </div>
        <div className="skeleton skeleton-pill" />
      </div>
      <div className="progress-bar">
        <div className="skeleton" style={{ width: '45%', height: '100%' }} />
      </div>
      <div className="job-meta">
        <div className="skeleton skeleton-text-sm" style={{ width: '30px' }} />
        <div className="skeleton skeleton-text-sm" style={{ width: '100px' }} />
      </div>
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <section className="view-section detail-panel">
      <div className="detail-header">
        <div>
          <div className="skeleton skeleton-text-sm" style={{ width: '80px', height: '12px' }} />
          <div className="skeleton skeleton-text" style={{ width: '180px', marginTop: '8px' }} />
        </div>
        <div className="action-row">
          <div className="skeleton" style={{ width: '100px', height: '32px', borderRadius: '6px' }} />
          <div className="skeleton" style={{ width: '120px', height: '32px', borderRadius: '6px' }} />
          <div className="skeleton" style={{ width: '100px', height: '32px', borderRadius: '6px' }} />
        </div>
      </div>
      <div className="detail-meta">
        <div className="skeleton skeleton-pill" />
        <div className="skeleton skeleton-text-sm" style={{ width: '30px' }} />
        <div className="skeleton skeleton-text-sm" style={{ width: '80px' }} />
        <div className="skeleton skeleton-text-sm" style={{ width: '80px' }} />
        <div className="skeleton skeleton-text-sm" style={{ width: '80px' }} />
      </div>
      <div className="preview-grid">
        <div className="preview-pane">
          <div className="preview-pane-title">Original PDF</div>
          <div className="skeleton" style={{ flex: 1, minHeight: '300px', borderRadius: '8px' }} />
        </div>
        <div className="preview-pane">
          <div className="preview-pane-title">Markdown</div>
          <div className="skeleton" style={{ flex: 1, minHeight: '300px', borderRadius: '8px' }} />
        </div>
      </div>
    </section>
  )
}