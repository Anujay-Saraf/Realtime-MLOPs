'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatDate, formatDuration } from '@/lib/github'

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkflowRun {
  id: number
  name: string
  branch: string
  sha: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: string | null
  created_at: string
  updated_at: string
  run_number: number
  event: string
  url: string
}

interface RunDetail {
  id: number
  jobs: Job[]
}

interface Job {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string
  completed_at: string | null
}

interface PipelineStats {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  avgDuration: string
}

interface ApiResponse {
  runs: WorkflowRun[]
  stats: PipelineStats
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === 'in_progress') {
    return <span className="badge badge-running">● Running</span>
  }
  if (status === 'queued') {
    return <span className="badge badge-pending">◷ Queued</span>
  }
  if (conclusion === 'success') {
    return <span className="badge badge-success">✓ Passed</span>
  }
  if (conclusion === 'failure') {
    return <span className="badge badge-failure">✕ Failed</span>
  }
  return <span className="badge badge-muted">{conclusion ?? '—'}</span>
}

function JobStatusIcon({ conclusion }: { conclusion: string | null }) {
  if (conclusion === 'success') {
    return <span className="job-icon success">✓</span>
  }
  if (conclusion === 'failure') {
    return <span className="job-icon failure">✕</span>
  }
  return <span className="job-icon pending">◷</span>
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={`chevron ${open ? 'open' : ''}`}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Run Card ─────────────────────────────────────────────────────────────────

function RunCard({ run }: { run: WorkflowRun }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const toggleOpen = useCallback(async () => {
    setOpen((v) => {
      const next = !v
      if (next && !detail) {
        setLoadingDetail(true)
        fetch(`/api/workflows/${run.id}`)
          .then((r) => r.json())
          .then(setDetail)
          .catch(console.error)
          .finally(() => setLoadingDetail(false))
      }
      return next
    })
  }, [run.id, detail])

  return (
    <div className="run-card" onClick={toggleOpen}>
      <div className="run-header">
        <div className="run-title">
          <StatusBadge status={run.status} conclusion={run.conclusion} />
          <span className="run-sha">{run.sha}</span>
          <span className="badge badge-muted">#{run.run_number}</span>
          <span className="badge badge-muted">{run.event}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {run.branch}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {formatDate(run.created_at)}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {formatDuration(run.created_at, run.updated_at)}
          </span>
          <ChevronIcon open={open} />
        </div>
      </div>

      {open && (
        <div className="jobs">
          {loadingDetail ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading jobs...</div>
          ) : detail?.jobs && detail.jobs.length > 0 ? (
            <div className="jobs-grid">
              {detail.jobs.map((job) => (
                <div key={job.id} className="job">
                  <JobStatusIcon conclusion={job.conclusion} />
                  <span className="job-name">
                    <span>{job.name}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No job data available
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <a
              href={run.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', fontSize: 13 }}
              onClick={(e) => e.stopPropagation()}
            >
              View on GitHub →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Version Card ──────────────────────────────────────────────────────────────

function VersionCard({
  label,
  value,
  sub,
  large,
}: {
  label: string
  value: string
  sub?: string
  large?: boolean
}) {
  return (
    <div className="version-card">
      <div className="version-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <line x1="16" y1="8" x2="2" y2="22" />
          <line x1="17.5" y1="15" x2="9" y2="15" />
        </svg>
        {label}
      </div>
      <div className={`version-value ${large ? 'large' : ''}`}>{value}</div>
      {sub && <div className="version-sub">{sub}</div>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PipelineDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workflows')
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const json: ApiResponse = await res.json()
      setData(json)
      setLastUpdated(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [fetchData])

  const latestRun = data?.runs?.[0]

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <div>
          <h1>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            MLOps Pipeline Dashboard
          </h1>
          <p className="subtitle">
            Realtime-MLOPs — Order Prediction API
            {lastUpdated && (
              <> · Updated {lastUpdated.toLocaleTimeString()}</>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="live-dot" title="Live" />
          <button className="refresh-btn" onClick={fetchData} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="error">
          ⚠️ {error}
          <br />
          <small>
            Make sure <code>NEXT_PUBLIC_GITHUB_REPO</code> is set correctly.
            If running locally, GitHub Actions API has a 60 req/hr limit for unauthenticated requests.
          </small>
        </div>
      )}

      {/* Stats */}
      {data && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Runs</div>
            <div className="stat-value blue">{data.stats.totalRuns}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Successful</div>
            <div className="stat-value green">{data.stats.successfulRuns}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Failed</div>
            <div className="stat-value red">{data.stats.failedRuns}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Duration</div>
            <div className="stat-value">{data.stats.avgDuration}</div>
          </div>
        </div>
      )}

      {/* Latest Version Info */}
      {latestRun && (
        <>
          <div className="section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Latest Deployment — #{latestRun.run_number}
          </div>
          <div className="versions-grid">
            <VersionCard
              label="Model Version (Git SHA)"
              value={latestRun.sha}
              sub={`Pushed to ${latestRun.branch} · ${formatDate(latestRun.created_at)}`}
              large
            />
            <VersionCard
              label="Pipeline Status"
              value={latestRun.conclusion === 'success' ? 'PASSED ✓' : latestRun.conclusion ?? 'Running...'}
              sub={`${latestRun.name} · ${latestRun.event} event`}
            />
            <VersionCard
              label="Data Version"
              value={latestRun.sha}
              sub="orders.csv — DVC tracked"
            />
            <VersionCard
              label="MLflow Run"
              value={latestRun.sha.substring(0, 8)}
              sub="Artifacts stored at mlruns/"
            />
          </div>
        </>
      )}

      {/* Pipeline History */}
      <div className="section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        Pipeline History
      </div>

      {loading && !data && (
        <div className="loading">Loading pipeline data...</div>
      )}

      {data?.runs && data.runs.length === 0 && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>
          No pipeline runs found. Push to GitHub to trigger the first run.
        </div>
      )}

      {data?.runs?.map((run) => (
        <RunCard key={run.id} run={run} />
      ))}

      {/* Footer */}
      <div className="footer">
        <p>
          MLOps Pipeline Dashboard — Realtime-MLOPs
          &nbsp;·&nbsp;
          <a href="https://github.com/Anujay-Saraf/Realtime-MLOPs/actions" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            GitHub Actions
          </a>
          &nbsp;·&nbsp;
          <a href="http://localhost:5000" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
            MLflow Tracking
          </a>
        </p>
      </div>
    </div>
  )
}
