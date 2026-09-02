'use client'

import { useState } from 'react'
import TabNav, { Tab } from './TabNav'
import PipelineDashboard from '../page'
import LiveRealtimeTesting from './LiveRealtimeTesting'
import UpdateTrainingData from './UpdateTrainingData'

export default function DashboardShell() {
  const [activeTab, setActiveTab] = useState<Tab>('pipeline')

  return (
    <div className="app-shell">
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        {activeTab === 'pipeline' && <PipelineDashboard />}
        {activeTab === 'realtime' && <LiveRealtimeTesting />}
        {activeTab === 'training' && <UpdateTrainingData />}
      </main>
    </div>
  )
}
