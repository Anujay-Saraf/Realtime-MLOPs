'use client'

import { useCallback, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationResult {
  rows: number
  columns: string[]
  class_distribution: Record<string, number>
  missing_columns: string[]
  preview: Record<string, string>[]
}

interface PipelineStatus {
  run_id?: number
  run_url?: string
  run_number?: number
  status?: string
  conclusion?: string | null
  error?: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_COLUMNS = [
  'region', 'channel', 'service_type', 'plan_type', 'customer_type',
  'address_verified', 'network_available', 'inventory_available',
  'credit_check_passed', 'installation_required',
  'monthly_charge', 'previous_failed_orders', 'order_result',
]

// ── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split('\n')
  if (lines.length < 1) return { headers: [], rows: [] }

  // Split by comma, strip whitespace, handle simple quoted values
  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current.trim())
    return cells
  }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1).map((line) => {
    const vals = parseRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
  return { headers, rows }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function UploadZone({
  onFile,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  onFile: (f: File) => void
  isDragging: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`upload-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p className="upload-title">Drag &amp; drop your CSV here</p>
      <p className="upload-sub">or click to browse &middot; .csv files only</p>
      <p className="upload-hint">
        Required: {REQUIRED_COLUMNS.join(', ')}
      </p>
    </div>
  )
}

function PreviewTable({ preview, columns }: { preview: Record<string, string>[]; columns: string[] }) {
  if (!preview || preview.length === 0) return null
  return (
    <div className="preview-table-wrap">
      <p className="section-label">Preview (first 5 rows)</p>
      <div className="preview-table-scroll">
        <table className="preview-table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => <td key={c}>{row[c] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PipelineStatusPanel({ status }: { status: PipelineStatus | null }) {
  if (!status) return null
  if (status.error) {
    return (
      <div className="pipeline-status error">
        <p className="pipeline-status-title">Pipeline Trigger Failed</p>
        <p className="pipeline-status-detail">{status.error}</p>
      </div>
    )
  }
  const isRunning = status.status === 'in_progress' || status.status === 'queued'
  const isSuccess = status.conclusion === 'success'
  const isFailed = status.conclusion === 'failure'

  return (
    <div className={`pipeline-status ${isSuccess ? 'success' : isFailed ? 'error' : 'running'}`}>
      <p className="pipeline-status-title">
        {isSuccess ? 'Pipeline Running Successfully' : isFailed ? 'Pipeline Failed' : 'Pipeline Triggered'}
      </p>
      {status.run_number && (
        <p className="pipeline-status-detail">
          Run #{status.run_number}
          {status.status && ` · ${status.status}`}
          {status.conclusion && ` · ${status.conclusion}`}
        </p>
      )}
      {status.run_url && (
        <a href={status.run_url} target="_blank" rel="noopener noreferrer" className="pipeline-link">
          View on GitHub
        </a>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UpdateTrainingData() {
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [polling, setPolling] = useState(false)
  const fileRef = useRef<File | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name)
    fileRef.current = file
    setValidation(null)
    setValidationError(null)
    setPipelineStatus(null)
    setValidating(true)

    try {
      const text = await file.text()
      const { headers, rows } = parseCSV(text)

      if (rows.length === 0) {
        setValidationError('CSV must have at least a header row and one data row')
        return
      }

      const classDist: Record<string, number> = {}
      if (headers.includes('order_result')) {
        for (const r of rows) {
          const k = r['order_result'] ?? '?'
          classDist[k] = (classDist[k] ?? 0) + 1
        }
      }

      const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c))
      setValidation({
        rows: rows.length,
        columns: headers,
        class_distribution: classDist,
        missing_columns: missing,
        preview: rows.slice(0, 5),
      })
    } catch {
      setValidationError('Failed to parse CSV')
    } finally {
      setValidating(false)
    }
  }, [])

  const startPolling = useCallback((runId: number) => {
    setPolling(true)
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/workflows/${runId}`)
        if (res.ok) {
          const data = await res.json()
          setPipelineStatus({
            run_id: data.id,
            run_url: data.html_url,
            run_number: data.run_number,
            status: data.status,
            conclusion: data.conclusion,
          })
          if (data.status === 'completed') {
            if (pollingRef.current) clearInterval(pollingRef.current)
            setPolling(false)
          }
        }
      } catch {
        // keep polling
      }
    }, 10000)
  }, [])

  const handleTrigger = useCallback(async () => {
    if (!validation || validation.missing_columns.length > 0 || !fileRef.current) return

    setTriggering(true)
    setPipelineStatus(null)

    try {
      // 1. Upload the real file to the API
      const formData = new FormData()
      formData.append('file', fileRef.current)

      const uploadRes = await fetch('/api/upload-dataset', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()

      if (!uploadRes.ok) {
        throw new Error((uploadData.detail as string) || 'Upload failed')
      }

      // 2. Trigger GitHub pipeline
      const triggerRes = await fetch('/api/trigger-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_type: 'dataset_update' }),
      })
      const triggerData = await triggerRes.json()

      if (!triggerRes.ok) {
        throw new Error((triggerData.error as string) || 'Trigger failed')
      }

      setPipelineStatus({
        run_id: triggerData.run_id,
        run_url: triggerData.run_url,
        run_number: triggerData.run_number,
        status: triggerData.status || 'queued',
      })

      if (triggerData.run_id) {
        startPolling(triggerData.run_id)
      }
    } catch (err) {
      setPipelineStatus({ error: String(err) })
    } finally {
      setTriggering(false)
    }
  }, [validation, startPolling])

  const canTrigger =
    validation &&
    validation.missing_columns.length === 0 &&
    !triggering &&
    !polling &&
    fileRef.current !== null

  return (
    <div className="tab-content">
      <div className="tab-header">
        <h2>Update Training Data</h2>
        <p className="tab-subtitle">
          Upload a new CSV to retrain the model. The pipeline validates data,
          trains with F1 quality gate, then deploys automatically.
        </p>
      </div>

      <UploadZone
        onFile={handleFile}
        isDragging={isDragging}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
      />

      {fileName && (
        <p className="file-name">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {fileName}
        </p>
      )}

      {validationError && (
        <div className="upload-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {validationError}
        </div>
      )}

      {validating && <p className="upload-status">Parsing CSV...</p>}

      {validation && (
        <div className="validation-results">
          {/* Stats */}
          <div className="column-check">
            <div className="column-check-row">
              <span className="badge badge-blue">{validation.rows.toLocaleString()} rows</span>
              <span className="badge badge-blue">{validation.columns.length} cols</span>
              {Object.entries(validation.class_distribution).map(([k, v]) => (
                <span key={k} className="badge badge-purple">
                  class {k}: {Number(v).toLocaleString()}
                </span>
              ))}
            </div>
            {validation.missing_columns.length > 0 && (
              <div className="column-warning">
                Missing columns: {validation.missing_columns.join(', ')}
              </div>
            )}
          </div>

          <PreviewTable preview={validation.preview} columns={validation.columns} />

          {validation.missing_columns.length > 0 && (
            <div className="upload-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Missing columns detected &mdash; pipeline may fail validation step.
            </div>
          )}

          <button
            className={`trigger-btn ${canTrigger ? '' : 'disabled'}`}
            onClick={handleTrigger}
            disabled={!canTrigger}
          >
            {triggering ? (
              <>
                <span className="spinner" />
                {polling ? 'Monitoring Pipeline...' : 'Triggering...'}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Trigger Training Pipeline
              </>
            )}
          </button>

          <PipelineStatusPanel status={pipelineStatus} />

          {polling && (
            <p className="polling-hint">
              Polling GitHub every 10s &middot; Run #{pipelineStatus?.run_number}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
