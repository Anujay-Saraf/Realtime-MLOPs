import { NextResponse } from 'next/server'
import { fetchWorkflowRunWithJobs } from '@/lib/github'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || 'Anujay-Saraf/Realtime-MLOPs'
  const token = process.env.NEXT_PUBLIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN
  const { id } = await params
  const runId = Number(id)

  if (!runId || isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })
  }

  try {
    const run = await fetchWorkflowRunWithJobs(repo, runId, token)
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }
    return NextResponse.json(run)
  } catch (err) {
    console.error('GitHub API error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch run details' },
      { status: 500 }
    )
  }
}
