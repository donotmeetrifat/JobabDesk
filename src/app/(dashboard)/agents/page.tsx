'use client';

import { Bot } from 'lucide-react';
import { AiRouterPanel } from '@/components/agents/ai-router-panel';

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            AI Agents & Channel Automations
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure multi-language AI auto-reply rules, store instructions, channel connections, and test live in the interactive playground.
          </p>
        </div>
      </div>

      <AiRouterPanel />
    </div>
  );
}
