'use client'

import { useState } from 'react'
import { Sliders, Plug, Sparkles } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChannelControls } from './channel-controls'
import { ChannelConnections } from './channel-connections'
import { SandboxAndLogs } from './sandbox-and-logs'

export function AiRouterPanel() {
  const [activeTab, setActiveTab] = useState<'controls' | 'connections' | 'sandbox'>('controls')

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-xl mb-6 bg-muted/60 p-1 rounded-xl">
          <TabsTrigger value="controls" className="flex items-center gap-2 text-xs font-semibold rounded-lg">
            <Sliders className="h-4 w-4 text-primary" />
            <span>1. Controls & Switches</span>
          </TabsTrigger>
          <TabsTrigger value="connections" className="flex items-center gap-2 text-xs font-semibold rounded-lg">
            <Plug className="h-4 w-4 text-primary" />
            <span>2. Channel Connections</span>
          </TabsTrigger>
          <TabsTrigger value="sandbox" className="flex items-center gap-2 text-xs font-semibold rounded-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>3. Live Sandbox & Logs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="controls">
          <ChannelControls />
        </TabsContent>

        <TabsContent value="connections">
          <ChannelConnections />
        </TabsContent>

        <TabsContent value="sandbox">
          <SandboxAndLogs />
        </TabsContent>
      </Tabs>
    </div>
  )
}
