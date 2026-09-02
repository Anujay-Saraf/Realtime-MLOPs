import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://order-api:8000'

// Forward to the named-model predictor
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body && body.model) {
      // A/B testing: predict with a specific model
      const res = await fetch(`${API_BASE}/predict/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        return NextResponse.json(
          { error: `API error: ${res.status}` },
          { status: res.status }
        )
      }
      return NextResponse.json(await res.json())
    }

    // Default prediction
    const res = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `API error: ${res.status}` },
        { status: res.status }
      )
    }
    return NextResponse.json(await res.json())
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach API: ${String(err)}` },
      { status: 502 }
    )
  }
}
