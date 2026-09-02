// Types for GitHub Actions API responses

export interface GitHubWorkflowRun {
  id: number
  name: string
  head_branch: string
  head_sha: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null
  created_at: string
  updated_at: string
  run_number: number
  event: string
  html_url: string
  jobs?: GitHubJob[]
}

export interface GitHubJob {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null
  started_at: string
  completed_at: string | null
  steps?: GitHubStep[]
}

export interface GitHubStep {
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null
  number: number
  started_at: string | null
  completed_at: string | null
}

export interface PipelineStats {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  avgDuration: string
}

export function getGitHubHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export async function fetchWorkflowRuns(
  repo: string,
  workflowId: string,
  token?: string,
  perPage = 10
): Promise<GitHubWorkflowRun[]> {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/runs?per_page=${perPage}`
  const res = await fetch(url, {
    headers: getGitHubHeaders(token),
    next: { revalidate: 30 }, // cache for 30 seconds
  })

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return data.workflow_runs || []
}

export async function fetchWorkflowRunWithJobs(
  repo: string,
  runId: number,
  token?: string
): Promise<GitHubWorkflowRun | null> {
  const [runRes, jobsRes] = await Promise.all([
    fetch(
      `https://api.github.com/repos/${repo}/actions/runs/${runId}`,
      { headers: getGitHubHeaders(token), next: { revalidate: 30 } }
    ),
    fetch(
      `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`,
      { headers: getGitHubHeaders(token), next: { revalidate: 30 } }
    ),
  ])

  if (!runRes.ok) return null

  const run: GitHubWorkflowRun = await runRes.json()
  if (jobsRes.ok) {
    const jobsData = await jobsRes.json()
    run.jobs = jobsData.jobs || []
  }

  return run
}

export function calcPipelineStats(runs: GitHubWorkflowRun[]): PipelineStats {
  const completed = runs.filter((r) => r.status === 'completed')
  const successful = completed.filter((r) => r.conclusion === 'success').length
  const failed = completed.filter((r) => r.conclusion === 'failure').length

  // Estimate average duration from runs
  const durations = completed
    .map((r) => {
      const start = new Date(r.created_at).getTime()
      const end = new Date(r.updated_at).getTime()
      return end - start
    })
    .filter((d) => d > 0)

  const avgMs = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0
  const avgMin = Math.round(avgMs / 60000)

  return {
    totalRuns: runs.length,
    successfulRuns: successful,
    failedRuns: failed,
    avgDuration: avgMin > 0 ? `~${avgMin} min` : 'N/A',
  }
}

export function formatDuration(start: string, end?: string | null): string {
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  const diffMs = endMs - startMs
  const min = Math.floor(diffMs / 60000)
  const sec = Math.floor((diffMs % 60000) / 1000)
  if (min > 0) return `${min}m ${sec}s`
  return `${sec}s`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const PIPELINE_STAGES = [
  'Build & Push API Image',
  'Build & Push Dashboard Image',
  'Deploy API to Azure',
  'Deploy Dashboard to Azure',
  'Generate Version Report',
]
