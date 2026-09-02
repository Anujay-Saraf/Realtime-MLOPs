import { NextRequest, NextResponse } from 'next/server'

const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || 'Anujay-Saraf/Realtime-MLOPs'
const WORKFLOW_ID = process.env.GITHUB_WORKFLOW_ID || 'mlops-pipeline.yml'
const GITHUB_API = 'https://api.github.com'

export async function POST(req: NextRequest) {
  const token =
    process.env.GITHUB_TOKEN ||
    process.env.NEXT_PUBLIC_GITHUB_TOKEN

  if (!token) {
    return NextResponse.json(
      { error: 'GitHub token not configured. Set GITHUB_TOKEN in your environment.' },
      { status: 401 }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const triggerType = body.trigger_type || 'manual'

    const response = await fetch(
      `${GITHUB_API}/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: body.branch || 'main',
          inputs: {
            trigger_type: triggerType,
          },
        }),
      }
    )

    if (response.status === 204) {
      // Dispatch succeeded — wait a moment then fetch the latest run
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const runsRes = await fetch(
        `${GITHUB_API}/repos/${REPO}/actions/workflows/${WORKFLOW_ID}/runs?per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      )
      if (runsRes.ok) {
        const runs = await runsRes.json()
        const latest = runs.workflow_runs?.[0]
        return NextResponse.json({
          success: true,
          message: 'Pipeline triggered successfully',
          run_id: latest?.id,
          run_url: latest?.html_url,
          run_number: latest?.run_number,
          status: latest?.status,
          conclusion: latest?.conclusion,
        })
      }
      return NextResponse.json({ success: true, message: 'Pipeline triggered' })
    }

    // Error from GitHub
    const errorText = await response.text()
    return NextResponse.json(
      { error: `GitHub API error ${response.status}: ${errorText}` },
      { status: response.status }
    )
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to trigger pipeline: ${String(err)}` },
      { status: 500 }
    )
  }
}
