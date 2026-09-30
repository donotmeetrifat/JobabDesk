'use client'

import { useState } from 'react'
import { Sliders, Plug, Sparkles } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChannelControls } from './channel-controls'
import { ChannelConnections } from './channel-connections'
import { SandboxAndLogs } from './sandbox-and-logs'

export function AiRouterPanel() {
  const [activeTab, setActiveTab] = useState<'controls' | 'playground' | 'connections'>('controls')

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-2xl mb-6 bg-muted/60 p-1.5 rounded-2xl">
          <TabsTrigger value="controls" className="flex items-center gap-2 text-xs font-semibold rounded-xl py-2.5">
            <Sliders className="h-4 w-4 text-primary" />
            <span>Controls & Automation</span>
          </TabsTrigger>
          <TabsTrigger value="playground" className="flex items-center gap-2 text-xs font-semibold rounded-xl py-2.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Interactive Playground</span>
          </TabsTrigger>
          <TabsTrigger value="connections" className="flex items-center gap-2 text-xs font-semibold rounded-xl py-2.5">
            <Plug className="h-4 w-4 text-primary" />
            <span>Channel Connections</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="controls">
          <ChannelControls />
        </TabsContent>

        <TabsContent value="playground">
          <SandboxAndLogs />
        </TabsContent>

        <TabsContent value="connections">
          <ChannelConnections />
        </TabsContent>
      </Tabs>
    </div>
  )
}
