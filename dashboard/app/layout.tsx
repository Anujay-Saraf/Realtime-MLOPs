import type { Metadata } from 'next'
import './globals.css'
import DashboardShell from './components/DashboardShell'

export const metadata: Metadata = {
  title: 'MLOps Dashboard — Realtime-MLOPs',
  description: 'Full MLOps control center: pipeline status, A/B model testing, and training data management.',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2'><path d='M12 2L2 7l10 5 10-5-10-5z'/><path d='M2 17l10 5 10-5'/><path d='M2 12l10 5 10-5'/></svg>",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DashboardShell />
      </body>
    </html>
  )
}
