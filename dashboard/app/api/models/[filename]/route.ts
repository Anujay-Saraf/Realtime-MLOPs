import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://order-api:8000'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  try {
    const res = await fetch(`${API_BASE}/models/${filename}`)
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
