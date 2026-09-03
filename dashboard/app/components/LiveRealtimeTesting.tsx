'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ModelInfo {
  name: string
  size_mb: number
  modified: string
  sha: string
  algorithm?: string
  training_date?: string
  dataset_sha?: string
  hyperparameters?: Record<string, number | string>
  cv_f1_mean?: number
  cv_f1_std?: number
  cv_f1_folds?: number[]
  holdout_f1?: number
  quality_gate?: string
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

interface BatchResponse {
  count: number
  matches: number
  match_rate: number
  avg_probability_gap: number
  results_a: PredictionResult[]
  results_b: PredictionResult[]
}

type OrderInput = {
  region: string
  channel: string
  service_type: string
  plan_type: string
  customer_type: string
  address_verified: number
  network_available: number
  inventory_available: number
  credit_check_passed: number
  installation_required: number
  monthly_charge: number
  previous_failed_orders: number
}

// ── Default input ──────────────────────────────────────────────────────────────

const DEFAULT_INPUT: OrderInput = {
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

// ── Bulk test input corpus (50 representative orders) ──────────────────────────
// Designed to cover edge cases where RF and GB are likely to disagree:
//   - high/low monthly charge
//   - zero inventory / credit failures
//   - new customers with previous failures
//   - premium plans with installation required
//   - etc.

const BULK_CORPUS: OrderInput[] = [
  // 1-10: clear PASS (everything checks out)
  { region: 'North', channel: 'Online', service_type: 'Fiber', plan_type: 'Premium', customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 89.99,  previous_failed_orders: 0 },
  { region: 'South', channel: 'Online', service_type: '5G',    plan_type: 'Standard', customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 65.00,  previous_failed_orders: 0 },
  { region: 'East',  channel: 'Store', service_type: 'Fiber', plan_type: 'Basic',    customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 45.00,  previous_failed_orders: 0 },
  { region: 'West',  channel: 'Phone', service_type: 'DSL',   plan_type: 'Premium',  customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 120.00, previous_failed_orders: 0 },
  { region: 'North', channel: 'Online', service_type: 'Fiber', plan_type: 'Standard', customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 75.00,  previous_failed_orders: 0 },
  { region: 'South', channel: 'Store', service_type: '5G',    plan_type: 'Premium',  customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 150.00, previous_failed_orders: 0 },
  { region: 'East',  channel: 'Online', service_type: 'Fiber', plan_type: 'Premium',  customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 180.00, previous_failed_orders: 0 },
  { region: 'West',  channel: 'Online', service_type: '5G',    plan_type: 'Standard', customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 95.00,  previous_failed_orders: 0 },
  { region: 'North', channel: 'Store', service_type: 'Fiber', plan_type: 'Standard', customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 55.00,  previous_failed_orders: 0 },
  { region: 'South', channel: 'Phone', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 40.00,  previous_failed_orders: 0 },

  // 11-20: clear FAIL (multiple risk factors)
  { region: 'North', channel: 'Store', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 50.00,  previous_failed_orders: 3 },
  { region: 'South', channel: 'Phone', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 1, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 45.00,  previous_failed_orders: 4 },
  { region: 'East',  channel: 'Store', service_type: 'DSL',   plan_type: 'Standard', customer_type: 'New',       address_verified: 1, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 70.00,  previous_failed_orders: 5 },
  { region: 'West',  channel: 'Phone', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'Existing', address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 40.00,  previous_failed_orders: 6 },
  { region: 'North', channel: 'Store', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 1, credit_check_passed: 0, installation_required: 1, monthly_charge: 45.00,  previous_failed_orders: 2 },
  { region: 'South', channel: 'Store', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 1, installation_required: 1, monthly_charge: 50.00,  previous_failed_orders: 3 },
  { region: 'East',  channel: 'Phone', service_type: 'DSL',   plan_type: 'Standard', customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 60.00,  previous_failed_orders: 4 },
  { region: 'West',  channel: 'Store', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 42.00,  previous_failed_orders: 7 },
  { region: 'North', channel: 'Phone', service_type: '5G',    plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 1, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 55.00,  previous_failed_orders: 2 },
  { region: 'South', channel: 'Store', service_type: '5G',    plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 48.00,  previous_failed_orders: 5 },

  // 21-30: edge cases where models may disagree (single risk factor)
  { region: 'North', channel: 'Online', service_type: 'Fiber', plan_type: 'Premium',  customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 199.00, previous_failed_orders: 0 },
  { region: 'South', channel: 'Online', service_type: 'Fiber', plan_type: 'Premium',  customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 40.00,  previous_failed_orders: 0 },
  { region: 'East',  channel: 'Online', service_type: '5G',    plan_type: 'Premium',  customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 1, monthly_charge: 180.00, previous_failed_orders: 0 },
  { region: 'West',  channel: 'Online', service_type: 'Fiber', plan_type: 'Premium',  customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 1, monthly_charge: 75.00,  previous_failed_orders: 0 },
  { region: 'North', channel: 'Store', service_type: 'Fiber', plan_type: 'Standard', customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 65.00,  previous_failed_orders: 2 },
  { region: 'South', channel: 'Online', service_type: '5G',    plan_type: 'Standard', customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 0, credit_check_passed: 1, installation_required: 0, monthly_charge: 80.00,  previous_failed_orders: 0 },
  { region: 'East',  channel: 'Store', service_type: 'Fiber', plan_type: 'Standard', customer_type: 'New',       address_verified: 1, network_available: 0, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 70.00,  previous_failed_orders: 0 },
  { region: 'West',  channel: 'Online', service_type: 'Fiber', plan_type: 'Standard', customer_type: 'New',       address_verified: 0, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 60.00,  previous_failed_orders: 0 },
  { region: 'North', channel: 'Online', service_type: '5G',    plan_type: 'Standard', customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 0, installation_required: 0, monthly_charge: 75.00,  previous_failed_orders: 0 },
  { region: 'South', channel: 'Store', service_type: 'Fiber', plan_type: 'Standard', customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 55.00,  previous_failed_orders: 1 },

  // 31-40: ambiguous (multiple soft risk factors)
  { region: 'North', channel: 'Phone', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 1, monthly_charge: 50.00,  previous_failed_orders: 1 },
  { region: 'South', channel: 'Store', service_type: '5G',    plan_type: 'Standard', customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 1, monthly_charge: 90.00,  previous_failed_orders: 1 },
  { region: 'East',  channel: 'Online', service_type: 'Fiber', plan_type: 'Premium',  customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 200.00, previous_failed_orders: 1 },
  { region: 'West',  channel: 'Online', service_type: '5G',    plan_type: 'Premium',  customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 1, monthly_charge: 110.00, previous_failed_orders: 1 },
  { region: 'North', channel: 'Store', service_type: 'Fiber', plan_type: 'Basic',    customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 0, credit_check_passed: 1, installation_required: 0, monthly_charge: 48.00,  previous_failed_orders: 0 },
  { region: 'South', channel: 'Phone', service_type: 'DSL',   plan_type: 'Standard', customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 62.00,  previous_failed_orders: 2 },
  { region: 'East',  channel: 'Online', service_type: '5G',    plan_type: 'Standard', customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 85.00,  previous_failed_orders: 1 },
  { region: 'West',  channel: 'Store', service_type: 'Fiber', plan_type: 'Premium',  customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 1, monthly_charge: 140.00, previous_failed_orders: 0 },
  { region: 'North', channel: 'Online', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 42.00,  previous_failed_orders: 1 },
  { region: 'South', channel: 'Online', service_type: 'Fiber', plan_type: 'Standard', customer_type: 'Existing', address_verified: 1, network_available: 1, inventory_available: 1, credit_check_passed: 1, installation_required: 0, monthly_charge: 70.00,  previous_failed_orders: 0 },

  // 41-50: stress (high monthly charge + high risk)
  { region: 'North', channel: 'Store', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 180.00, previous_failed_orders: 8 },
  { region: 'South', channel: 'Phone', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 195.00, previous_failed_orders: 9 },
  { region: 'East',  channel: 'Store', service_type: '5G',    plan_type: 'Premium',  customer_type: 'New',       address_verified: 0, network_available: 1, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 190.00, previous_failed_orders: 7 },
  { region: 'West',  channel: 'Phone', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'Existing', address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 185.00, previous_failed_orders: 6 },
  { region: 'North', channel: 'Store', service_type: 'Fiber', plan_type: 'Premium',  customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 200.00, previous_failed_orders: 5 },
  { region: 'South', channel: 'Phone', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 198.00, previous_failed_orders: 10 },
  { region: 'East',  channel: 'Store', service_type: 'DSL',   plan_type: 'Standard', customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 175.00, previous_failed_orders: 6 },
  { region: 'West',  channel: 'Phone', service_type: '5G',    plan_type: 'Premium',  customer_type: 'Existing', address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 0, installation_required: 1, monthly_charge: 188.00, previous_failed_orders: 4 },
  { region: 'North', channel: 'Store', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 0, credit_check_passed: 1, installation_required: 1, monthly_charge: 178.00, previous_failed_orders: 5 },
  { region: 'South', channel: 'Phone', service_type: 'DSL',   plan_type: 'Basic',    customer_type: 'New',       address_verified: 0, network_available: 0, inventory_available: 1, credit_check_passed: 0, installation_required: 1, monthly_charge: 182.00, previous_failed_orders: 7 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return 'N/A'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatPercent(n?: number, digits = 2) {
  if (n === undefined || n === null) return 'N/A'
  return `${(n * 100).toFixed(digits)}%`
}

function formatNumber(n?: number, digits = 4) {
  if (n === undefined || n === null) return 'N/A'
  return n.toFixed(digits)
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
                    {match === null && <span className="neutral-badge">{'—'}</span>}
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

function MetadataPanel({
  meta,
  label,
}: {
  meta: ModelInfo | null
  label: string
}) {
  if (!meta) {
    return (
      <div className="meta-card empty">
        <p className="meta-card-label">{label}</p>
        <p className="meta-empty">No metadata available</p>
      </div>
    )
  }

  return (
    <div className="meta-card">
      <p className="meta-card-label">{label}</p>
      <h3 className="meta-algorithm">{meta.algorithm ?? 'Unknown algorithm'}</h3>

      <dl className="meta-list">
        <div className="meta-row">
          <dt>Trained</dt>
          <dd>{formatDate(meta.training_date)}</dd>
        </div>
        <div className="meta-row">
          <dt>Quality gate</dt>
          <dd>
            <span className={`qg-badge ${meta.quality_gate === 'PASSED' ? 'qg-pass' : 'qg-fail'}`}>
              {meta.quality_gate ?? 'N/A'}
            </span>
          </dd>
        </div>
        <div className="meta-row">
          <dt>CV F1 (mean)</dt>
          <dd>
            {formatNumber(meta.cv_f1_mean)}
            {meta.cv_f1_std !== undefined && (
              <span className="meta-sub"> &plusmn; {formatNumber(meta.cv_f1_std)}</span>
            )}
          </dd>
        </div>
        <div className="meta-row">
          <dt>CV F1 folds</dt>
          <dd className="meta-folds">
            {meta.cv_f1_folds?.map((f, i) => (
              <span key={i} className="fold-pill">{f.toFixed(3)}</span>
            )) ?? 'N/A'}
          </dd>
        </div>
        <div className="meta-row">
          <dt>Holdout F1</dt>
          <dd>{formatNumber(meta.holdout_f1)}</dd>
        </div>
        <div className="meta-row">
          <dt>Dataset SHA</dt>
          <dd><code>{meta.dataset_sha ?? 'N/A'}</code></dd>
        </div>
        <div className="meta-row">
          <dt>Model SHA</dt>
          <dd><code>{meta.sha}</code></dd>
        </div>
        <div className="meta-row">
          <dt>Hyperparameters</dt>
          <dd>
            {meta.hyperparameters ? (
              <table className="hp-table">
                <tbody>
                  {Object.entries(meta.hyperparameters).map(([k, v]) => (
                    <tr key={k}>
                      <td className="hp-key">{k}</td>
                      <td className="hp-val">{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : 'N/A'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function BulkTestSection({
  modelA,
  modelB,
  onResultClick,
}: {
  modelA: string
  modelB: string
  onResultClick: (input: OrderInput) => void
}) {
  const [count, setCount] = useState(20)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BatchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOnlyDisagreements, setShowOnlyDisagreements] = useState(false)

  const handleRun = useCallback(async () => {
    if (!modelA || !modelB) {
      setError('Select Model A and Model B first')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const slice = BULK_CORPUS.slice(0, Math.max(10, Math.min(50, count)))
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_a: modelA, model_b: modelB, orders: slice }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setResult(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [modelA, modelB, count])

  const disagreements = useMemo(() => {
    if (!result) return 0
    return result.results_a.filter(
      (r, i) => r.prediction !== result.results_b[i].prediction
    ).length
  }, [result])

  const visibleRows = useMemo(() => {
    if (!result) return []
    if (!showOnlyDisagreements) {
      return BULK_CORPUS.slice(0, result.count).map((input, i) => ({
        input,
        a: result.results_a[i],
        b: result.results_b[i],
        idx: i,
      }))
    }
    return BULK_CORPUS.slice(0, result.count)
      .map((input, i) => ({
        input,
        a: result.results_a[i],
        b: result.results_b[i],
        idx: i,
      }))
      .filter((row) => row.a.prediction !== row.b.prediction)
  }, [result, showOnlyDisagreements])

  return (
    <div className="bulk-section">
      <div className="bulk-header">
        <h2>Bulk A/B Test</h2>
        <p className="bulk-subtitle">
          Run predictions on a preset batch of representative orders. Useful for understanding
          model agreement at a population level, not just one input at a time.
        </p>
      </div>

      <div className="bulk-controls">
        <label className="bulk-label">
          Sample size
          <input
            type="number"
            min={10}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bulk-input"
          />
          <span className="bulk-hint">10&ndash;50</span>
        </label>

        <button
          className={`run-btn ${!modelA || !modelB || loading ? 'disabled' : ''}`}
          onClick={handleRun}
          disabled={!modelA || !modelB || loading}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Running...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Run Bulk Test
            </>
          )}
        </button>
      </div>

      {error && <p className="bulk-error">Error: {error}</p>}

      {result && (
        <>
          <div className="bulk-stats">
            <div className="bulk-stat">
              <p className="bulk-stat-label">Sample size</p>
              <p className="bulk-stat-value">{result.count}</p>
            </div>
            <div className="bulk-stat">
              <p className="bulk-stat-label">Match rate</p>
              <p className="bulk-stat-value">
                {(result.match_rate * 100).toFixed(1)}%
              </p>
              <p className="bulk-stat-sub">
                {result.matches}/{result.count} agree
              </p>
            </div>
            <div className="bulk-stat">
              <p className="bulk-stat-label">Avg probability gap</p>
              <p className="bulk-stat-value">
                {(result.avg_probability_gap * 100).toFixed(2)}pp
              </p>
              <p className="bulk-stat-sub">absolute P(Pass) difference</p>
            </div>
            <div className="bulk-stat">
              <p className="bulk-stat-label">Disagreements</p>
              <p className="bulk-stat-value">{disagreements}</p>
              <p className="bulk-stat-sub">where models predict different outcomes</p>
            </div>
          </div>

          <div className="bulk-table-controls">
            <label className="bulk-toggle">
              <input
                type="checkbox"
                checked={showOnlyDisagreements}
                onChange={(e) => setShowOnlyDisagreements(e.target.checked)}
              />
              Show disagreements only
            </label>
            <p className="bulk-count-text">
              Showing {visibleRows.length} of {result.count} rows
            </p>
          </div>

          <div className="bulk-table-wrap">
            <table className="bulk-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Region / Plan</th>
                  <th>A</th>
                  <th>P(Pass) A</th>
                  <th>B</th>
                  <th>P(Pass) B</th>
                  <th>Gap</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const gap = Math.abs(row.a.pass_probability - row.b.pass_probability)
                  const agree = row.a.prediction === row.b.prediction
                  return (
                    <tr key={row.idx} className={agree ? 'row-agree' : 'row-disagree'}>
                      <td>{row.idx + 1}</td>
                      <td>
                        <code>{row.input.region}/{row.input.plan_type}</code>
                        <span className="bulk-mc">${row.input.monthly_charge.toFixed(0)}</span>
                      </td>
                      <td>
                        <span className={`badge ${row.a.result === 'PASS' ? 'badge-pass-inline' : 'badge-fail-inline'}`}>
                          {row.a.result}
                        </span>
                      </td>
                      <td>{(row.a.pass_probability * 100).toFixed(1)}%</td>
                      <td>
                        <span className={`badge ${row.b.result === 'PASS' ? 'badge-pass-inline' : 'badge-fail-inline'}`}>
                          {row.b.result}
                        </span>
                      </td>
                      <td>{(row.b.pass_probability * 100).toFixed(1)}%</td>
                      <td>
                        <span className={`gap ${gap > 0.1 ? 'gap-big' : ''}`}>
                          {(gap * 100).toFixed(1)}pp
                        </span>
                      </td>
                      <td>
                        <button
                          className="row-use-btn"
                          onClick={() => onResultClick(row.input)}
                          title="Load this input into the single-input tester"
                        >
                          Use
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
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
  const [showMetadata, setShowMetadata] = useState(false)
  const [metaA, setMetaA] = useState<ModelInfo | null>(null)
  const [metaB, setMetaB] = useState<ModelInfo | null>(null)

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

  // Load metadata when models change
  useEffect(() => {
    if (!modelA || !modelB) return
    Promise.all([
      fetch(`/api/models/${modelA}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/models/${modelB}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([a, b]) => {
        setMetaA(a)
        setMetaB(b)
      })
      .catch(() => {
        setMetaA(null)
        setMetaB(null)
      })
  }, [modelA, modelB])

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
    async (
      modelName: string,
      setResult: (r: PredictionResult) => void,
      setLoading: (l: boolean) => void
    ) => {
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
        setResult({
          prediction: -1,
          result: 'FAIL',
          pass_probability: 0,
          fail_probability: 1,
          error: String(err),
        })
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

  const handleUseAsTemplate = useCallback((entry: HistoryEntry) => {
    setJsonInput(entry.input)
    setJsonError(null)
  }, [])

  const handleLoadIntoTester = useCallback((input: OrderInput) => {
    setJsonInput(JSON.stringify(input, null, 2))
    setJsonError(null)
    setResultA(null)
    setResultB(null)
  }, [])

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
        <div className="ab-controls">
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

          <button
            className="meta-toggle-btn"
            onClick={() => setShowMetadata((s) => !s)}
            type="button"
          >
            {showMetadata ? 'Hide' : 'Show'} model metadata
          </button>

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

        <div className="ab-results">
          <div className="result-cards">
            <PredictionCard label={`Model A — ${modelA.replace('.joblib', '') || 'Select'}`} result={resultA} loading={loadingA} />
            <PredictionCard label={`Model B — ${modelB.replace('.joblib', '') || 'Select'}`} result={resultB} loading={loadingB} />
          </div>

          <ABComparison resultA={resultA} resultB={resultB} />
        </div>
      </div>

      {showMetadata && (
        <div className="metadata-panel">
          <h2>Model Metadata</h2>
          <p className="metadata-subtitle">
            Training-time metadata for the selected models. Read from
            <code> models/&lt;name&gt;.meta.json</code> sidecars.
          </p>
          <div className="metadata-grid">
            <MetadataPanel meta={metaA} label="Model A" />
            <MetadataPanel meta={metaB} label="Model B" />
          </div>
        </div>
      )}

      <BulkTestSection modelA={modelA} modelB={modelB} onResultClick={handleLoadIntoTester} />

      <HistoryTable entries={history} />
    </div>
  )
}
