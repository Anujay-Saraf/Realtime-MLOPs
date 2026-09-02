'use client'

import { useCallback, useEffect, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ModelInfo {
  name: string
  size_mb: number
  modified: string
  sha: string
}

interface PredictionResult {
  model?: string
  prediction: number
  result: 'PASS' | 'FAIL'
  pass_probability: number
  fail_probability: number
  error?: string
}

interface HistoryEntry {
  id: number
  input: string
  resultA: PredictionResult | null
  resultB: PredictionResult | null
  timestamp: Date
}

// ── Dummy JSON ────────────────────────────────────────────────────────────────

const DEFAULT_INPUT = {
  region: 'North',
  channel: 'Online',
  service_type: 'Fiber',
  plan_type: 'Premium',
  customer_type: 'New',
  address_verified: 1,
  network_available: 1,
  inventory_available: 1,
  credit_check_passed: 1,
  installation_required: 0,
  monthly_charge: 89.99,
  previous_failed_orders: 0,
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModelSelector({
  label,
  value,
  models,
  onChange,
}: {
  label: string
  value: string
  models: ModelInfo[]
  onChange: (v: string) => void
}) {
  return (
    <div className="model-selector">
      <label className="selector-label">{label}</label>
      <select
        className="model-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.length === 0 && <option value="">No models available</option>}
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name.replace('.joblib', '')} ({m.size_mb} MB)
          </option>
        ))}
      </select>
    </div>
  )
}

function PredictionCard({
  label,
  result,
  loading,
}: {
  label: string
  result: PredictionResult | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="prediction-card loading">
        <p className="card-label">{label}</p>
        <div className="card-loading">
          <span className="spinner" />
          Running prediction...
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="prediction-card empty">
        <p className="card-label">{label}</p>
        <p className="card-empty">Run prediction to see results</p>
      </div>
    )
  }

  if (result.error) {
    return (
      <div className="prediction-card error">
        <p className="card-label">{label}</p>
        <p className="card-error">Error: {result.error}</p>
      </div>
    )
  }

  const isPass = result.result === 'PASS'
  return (
    <div className={`prediction-card ${isPass ? 'pass' : 'fail'}`}>
      <p className="card-label">{label}</p>
      <div className={`card-result-badge ${isPass ? 'badge-pass' : 'badge-fail'}`}>
        {isPass ? 'PASS' : 'FAIL'}
      </div>
      <div className="card-probabilities">
        <div className="prob-row">
          <span className="prob-label">Pass probability</span>
          <div className="prob-bar-wrap">
            <div
              className="prob-bar pass"
              style={{ width: `${(result.pass_probability * 100).toFixed(1)}%` }}
            />
          </div>
          <span className="prob-value">{(result.pass_probability * 100).toFixed(1)}%</span>
        </div>
        <div className="prob-row">
          <span className="prob-label">Fail probability</span>
          <div className="prob-bar-wrap">
            <div
              className="prob-bar fail"
              style={{ width: `${(result.fail_probability * 100).toFixed(1)}%` }}
            />
          </div>
          <span className="prob-value">{(result.fail_probability * 100).toFixed(1)}%</span>
        </div>
      </div>
      {result.model && (
        <p className="card-model">Model: {result.model.replace('.joblib', '')}</p>
      )}
    </div>
  )
}

function ABComparison({
  resultA,
  resultB,
}: {
  resultA: PredictionResult | null
  resultB: PredictionResult | null
}) {
  if (!resultA || !resultB || resultA.error || resultB.error) return null

  const match = resultA.prediction === resultB.prediction
  const probDiff = Math.abs(resultA.pass_probability - resultB.pass_probability)

  return (
    <div className={`ab-diff ${match ? 'match' : 'mismatch'}`}>
      <div className="ab-diff-icon">
        {match ? '✓' : '✕'}
      </div>
      <div className="ab-diff-text">
        <p className="ab-diff-title">
          {match ? 'Predictions Match' : 'Predictions Differ'}
        </p>
        <p className="ab-diff-detail">
          {match
            ? 'Both models agree on the outcome'
            : `Model A predicts ${resultA.result}, Model B predicts ${resultB.result}`}
          &nbsp;&middot;&nbsp;
          {probDiff.toFixed(1)}pp probability difference
        </p>
      </div>
    </div>
  )
}

function HistoryTable({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div className="history-section">
      <p className="section-label">Prediction History</p>
      <div className="history-scroll">
        <table className="history-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Result A</th>
              <th>P(Pass) A</th>
              <th>Result B</th>
              <th>P(Pass) B</th>
              <th>Match?</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {[...entries].reverse().map((e, i) => {
              const match = e.resultA && e.resultB && e.resultA.prediction === e.resultB.prediction
              return (
                <tr key={e.id}>
                  <td>{entries.length - i}</td>
                  <td>
                    <span className={`badge ${e.resultA?.result === 'PASS' ? 'badge-pass-inline' : 'badge-fail-inline'}`}>
                      {e.resultA?.result ?? '—'}
                    </span>
                  </td>
                  <td>{e.resultA ? `${(e.resultA.pass_probability * 100).toFixed(1)}%` : '—'}</td>
                  <td>
                    <span className={`badge ${e.resultB?.result === 'PASS' ? 'badge-pass-inline' : 'badge-fail-inline'}`}>
                      {e.resultB?.result ?? '—'}
                    </span>
                  </td>
                  <td>{e.resultB ? `${(e.resultB.pass_probability * 100).toFixed(1)}%` : '—'}</td>
                  <td>
                    {match === true && <span className="match-badge">Match</span>}
                    {match === false && <span className="mismatch-badge">Diff</span>}
                    {match === null && <span className="neutral-badge">—</span>}
                  </td>
                  <td>{e.timestamp.toLocaleTimeString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LiveRealtimeTesting() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [jsonInput, setJsonInput] = useState(JSON.stringify(DEFAULT_INPUT, null, 2))
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [resultA, setResultA] = useState<PredictionResult | null>(null)
  const [resultB, setResultB] = useState<PredictionResult | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  // Load models on mount
  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        const modelList: ModelInfo[] = data.models || []
        setModels(modelList)
        if (modelList.length >= 1) {
          setModelA(modelList[0].name)
          setModelB(modelList.length > 1 ? modelList[1].name : modelList[0].name)
        }
      })
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false))
  }, [])

  const validateJson = useCallback((raw: string) => {
    try {
      const parsed = JSON.parse(raw)
      setJsonError(null)
      return parsed
    } catch (e) {
      setJsonError(`Invalid JSON: ${(e as Error).message}`)
      return null
    }
  }, [])

  const runPrediction = useCallback(
    async (modelName: string, setResult: (r: PredictionResult) => void, setLoading: (l: boolean) => void) => {
      const parsed = validateJson(jsonInput)
      if (!parsed) return

      setLoading(true)
      try {
        const res = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName, order: parsed }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        setResult(data)
      } catch (err) {
        setResult({ prediction: -1, result: 'FAIL', pass_probability: 0, fail_probability: 1, error: String(err) })
      } finally {
        setLoading(false)
      }
    },
    [jsonInput, validateJson]
  )

  const handleRunBoth = useCallback(async () => {
    if (!modelA || !modelB) return

    setResultA(null)
    setResultB(null)

    await Promise.all([
      runPrediction(modelA, setResultA, setLoadingA),
      runPrediction(modelB, setResultB, setLoadingB),
    ])
  }, [modelA, modelB, runPrediction])

  // Save to history when both results arrive
  useEffect(() => {
    if (resultA && resultB && !loadingA && !loadingB) {
      setHistory((prev) => [
        ...prev.slice(-19),
        {
          id: Date.now(),
          input: jsonInput,
          resultA,
          resultB,
          timestamp: new Date(),
        },
      ])
    }
  }, [resultA, resultB, loadingA, loadingB, jsonInput])

  const handleReset = useCallback(() => {
    setJsonInput(JSON.stringify(DEFAULT_INPUT, null, 2))
    setJsonError(null)
    setResultA(null)
    setResultB(null)
  }, [])

  const handleUseAsTemplate = useCallback(
    (entry: HistoryEntry) => {
      setJsonInput(entry.input)
      setJsonError(null)
    },
    []
  )

  return (
    <div className="tab-content">
      <div className="tab-header">
        <h2>Live Realtime Testing</h2>
        <p className="tab-subtitle">
          Compare model predictions side-by-side. Select two models, paste input JSON, and run
          A/B comparison to see how different models handle the same order.
        </p>
      </div>

      <div className="ab-layout">
        {/* LEFT: Controls */}
        <div className="ab-controls">
          {/* Model selectors */}
          <div className="model-selectors">
            {loadingModels ? (
              <p className="loading-models">Loading models...</p>
            ) : (
              <>
                <ModelSelector label="Model A" value={modelA} models={models} onChange={setModelA} />
                <ModelSelector label="Model B" value={modelB} models={models} onChange={setModelB} />
              </>
            )}
          </div>

          {/* JSON input */}
          <div className="json-input-section">
            <div className="json-input-header">
              <label className="selector-label">Order Input (JSON)</label>
              <button className="reset-btn" onClick={handleReset}>Reset</button>
            </div>
            <textarea
              className={`json-textarea ${jsonError ? 'json-error' : ''}`}
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value)
                if (jsonError) validateJson(e.target.value)
              }}
              rows={14}
              spellCheck={false}
            />
            {jsonError && <p className="json-error-msg">{jsonError}</p>}
          </div>

          {/* Run buttons */}
          <div className="run-buttons">
            <button
              className={`run-btn ${!modelA || !modelB || !!jsonError ? 'disabled' : ''}`}
              onClick={handleRunBoth}
              disabled={!modelA || !modelB || !!jsonError || loadingA || loadingB}
            >
              {(loadingA || loadingB) ? (
                <>
                  <span className="spinner" />
                  Running...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Run A/B Comparison
                </>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT: Results */}
        <div className="ab-results">
          <div className="result-cards">
            <PredictionCard label={`Model A — ${modelA.replace('.joblib', '') || 'Select'}`} result={resultA} loading={loadingA} />
            <PredictionCard label={`Model B — ${modelB.replace('.joblib', '') || 'Select'}`} result={resultB} loading={loadingB} />
          </div>

          <ABComparison resultA={resultA} resultB={resultB} />
        </div>
      </div>

      {/* History */}
      <HistoryTable entries={history} />
    </div>
  )
}
