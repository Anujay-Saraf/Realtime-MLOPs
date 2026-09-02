import { NextResponse } from 'next/server'
import { fetchWorkflowRuns, calcPipelineStats } from '@/lib/github'

export const runtime = 'nodejs'

export async function GET() {
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || 'Anujay-Saraf/Realtime-MLOPs'
  const token = process.env.NEXT_PUBLIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN

  try {
    // Workflow ID can be the filename or ID — use 'mlops-pipeline.yml'
    const runs = await fetchWorkflowRuns(repo, 'mlops-pipeline.yml', token, 10)
    const stats = calcPipelineStats(runs)

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        name: r.name,
        branch: r.head_branch,
        sha: r.head_sha.substring(0, 7),
        status: r.status,
        conclusion: r.conclusion,
        created_at: r.created_at,
        updated_at: r.updated_at,
        run_number: r.run_number,
        event: r.event,
        url: r.html_url,
      })),
      stats,
    })
  } catch (err) {
    console.error('GitHub API error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch pipeline data', detail: String(err) },
      { status: 500 }
    )
  }
}
