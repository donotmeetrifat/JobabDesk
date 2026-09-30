'use client'

import { useState } from 'react'
import { Store, Sliders, Plug, Sparkles } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { BusinessSetup } from './business-setup'
import { ChannelControls } from './channel-controls'
import { ChannelConnections } from './channel-connections'
import { SandboxAndLogs } from './sandbox-and-logs'

export function AiRouterPanel() {
  const [activeTab, setActiveTab] = useState<'business' | 'controls' | 'playground' | 'connections'>('business')

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full max-w-4xl mb-6 bg-muted/60 p-1.5 rounded-2xl">
          <TabsTrigger value="business" className="flex items-center gap-2 text-xs font-semibold rounded-xl py-2.5">
            <Store className="h-4 w-4 text-primary" />
            <span>1. Business Setup</span>
          </TabsTrigger>
          <TabsTrigger value="controls" className="flex items-center gap-2 text-xs font-semibold rounded-xl py-2.5">
            <Sliders className="h-4 w-4 text-primary" />
            <span>2. Automation Controls</span>
          </TabsTrigger>
          <TabsTrigger value="playground" className="flex items-center gap-2 text-xs font-semibold rounded-xl py-2.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>3. Interactive Playground</span>
          </TabsTrigger>
          <TabsTrigger value="connections" className="flex items-center gap-2 text-xs font-semibold rounded-xl py-2.5">
            <Plug className="h-4 w-4 text-primary" />
            <span>4. Channel Connections</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business">
          <BusinessSetup />
        </TabsContent>

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
