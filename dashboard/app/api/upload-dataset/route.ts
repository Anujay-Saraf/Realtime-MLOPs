import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://order-api:8000'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Forward to FastAPI
    const forward = new FormData()
    forward.append('file', file, file.name)

    const res = await fetch(`${API_BASE}/upload-dataset`, {
      method: 'POST',
      body: forward,
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || 'Upload failed' },
        { status: res.status }
      )
    }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: `Upload error: ${String(err)}` },
      { status: 500 }
    )
  }
}
