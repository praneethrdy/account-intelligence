/** Loading placeholders that match the real layout, so content doesn't jump in. */
export function DashboardSkeleton() {
  return (
    <div className="skeleton-page" aria-hidden="true">
      <div className="sk sk-spotlight" />
      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk sk-stat" />
        ))}
      </div>
      <div className="sk-table">
        <div className="sk sk-toolbar" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="sk-row">
            <span className="sk sk-avatar" />
            <span className="sk sk-line" style={{ width: '22%' }} />
            <span className="sk sk-circle" />
            <span className="sk sk-line" style={{ width: '8%' }} />
            <span className="sk sk-line" style={{ width: '10%' }} />
            <span className="sk sk-line" style={{ width: '20%' }} />
            <span className="sk sk-line" style={{ width: '16%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="skeleton-page" aria-hidden="true">
      <div className="sk sk-hero" />
      <div className="detail-grid">
        <div className="col-main">
          <div className="sk sk-card" style={{ height: 420 }} />
          <div className="two-col">
            <div className="sk sk-card" style={{ height: 260 }} />
            <div className="sk sk-card" style={{ height: 260 }} />
          </div>
        </div>
        <div className="col-side">
          <div className="sk sk-card" style={{ height: 320 }} />
          <div className="sk sk-card" style={{ height: 260 }} />
        </div>
      </div>
    </div>
  );
}
