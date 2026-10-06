'use client'

import { useState } from 'react'
import { Store, Sliders, Sparkles, Plug } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { BusinessSetup } from './business-setup'
import { ChannelControls } from './channel-controls'
import { ChannelConnections } from './channel-connections'
import { SandboxAndLogs } from './sandbox-and-logs'
import { cn } from '@/lib/utils'

type AgentTab = 'business' | 'controls' | 'playground' | 'connections'

export function AiRouterPanel() {
  const [activeTab, setActiveTab] = useState<AgentTab>('business')

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AgentTab)} className="w-full">
        {/* Segment Navigation Pills (Clean Minimalist Tab Bar) */}
        <div className="flex items-center gap-1.5 p-1 bg-card rounded-xl border border-border shadow-xs mb-6 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0",
              activeTab === 'business'
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Store className={cn("h-4 w-4", activeTab === 'business' ? "text-primary-foreground" : "text-muted-foreground")} />
            <span>1. Business Setup</span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
              activeTab === 'business' ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              75%
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('controls')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all shrink-0",
              activeTab === 'controls'
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Sliders className={cn("h-4 w-4", activeTab === 'controls' ? "text-primary-foreground" : "text-muted-foreground")} />
            <span>2. Automation Controls</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('playground')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all shrink-0",
              activeTab === 'playground'
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Sparkles className={cn("h-4 w-4", activeTab === 'playground' ? "text-primary-foreground" : "text-muted-foreground")} />
            <span>3. Interactive Playground</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('connections')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all shrink-0",
              activeTab === 'connections'
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Plug className={cn("h-4 w-4", activeTab === 'connections' ? "text-primary-foreground" : "text-muted-foreground")} />
            <span>4. Channel Connections</span>
          </button>
        </div>

        <TabsContent value="business">
          <BusinessSetup onNavigateToPlayground={() => setActiveTab('playground')} />
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
