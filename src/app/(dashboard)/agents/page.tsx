'use client'

import { AiRouterPanel } from '@/components/agents/ai-router-panel'

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      {/* Streamlined Page Header & Model Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/25">
              Autonomous Support
            </span>
            <span className="text-xs text-muted-foreground/60">•</span>
            <span className="text-xs text-muted-foreground font-medium">
              Knowledge & Tone Configuration
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            AI Agents & Channel Automations
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Train your store&apos;s AI representative with accurate catalog specs, return guidelines, shipping terms, and natural brand tone.
          </p>
        </div>
      </div>

      <AiRouterPanel />
    </div>
  )
}
