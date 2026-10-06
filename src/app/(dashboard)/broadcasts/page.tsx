'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Broadcast } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Radio,
  Plus,
  Loader2,
  Search,
  RefreshCw,
  Send,
  Users,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2,
  RotateCcw,
  Power,
  PowerOff,
} from 'lucide-react';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { getBroadcastStatus } from '@/lib/broadcast-status';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 4_000;

interface BroadcastStats {
  total: number;
  sending: number;
  sent: number;
  failed: number;
  totalRecipients: number;
  totalDelivered: number;
}

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

function ChannelBadge({ channel }: { channel?: string }) {
  if (channel === 'messenger') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
          <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.514 3.734 7.202V22l3.376-1.854c.905.251 1.877.387 2.89.387 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.05 12.443l-2.673-2.853-5.217 2.853 5.738-6.094 2.742 2.853 5.148-2.853-5.738 6.094z" />
        </svg>
        Messenger
      </span>
    );
  }
  if (channel === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z" />
        </svg>
        WhatsApp
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
      <Radio className="w-3 h-3" />
      Omnichannel
    </span>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const canCreate = useCan('send-messages');

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [stats, setStats] = useState<BroadcastStats>({
    total: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    totalRecipients: 0,
    totalDelivered: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBroadcasts = useCallback(
    async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (channelFilter !== 'all') params.set('channel', channelFilter);

        const res = await fetch(`/api/broadcasts?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Failed to retrieve broadcasts');
        }
        const data = await res.json();
        setBroadcasts(data.broadcasts ?? []);
        if (data.stats) {
          setStats(data.stats);
        }
      } catch (err: any) {
        console.warn('[BroadcastsPage] fetch warning:', err);
        if (!silent) {
          toast.error('Unable to fetch broadcasts. Check connection.');
        }
      } finally {
        setLoading(false);
        if (!silent) setIsRefreshing(false);
      }
    },
    [search, statusFilter, channelFilter]
  );

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts]
  );

  // Auto-polling while a broadcast is sending
  useEffect(() => {
    if (!anySending) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    pollTimer.current = setInterval(() => {
      fetchBroadcasts(true);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [anySending, fetchBroadcasts]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this broadcast?')) return;
    try {
      const res = await fetch(`/api/broadcasts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Broadcast campaign deleted');
        fetchBroadcasts(true);
      } else {
        toast.error('Failed to delete broadcast');
      }
    } catch {
      toast.error('Error deleting broadcast');
    }
  }

  async function handleResume(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/broadcasts/${id}/resume`, { method: 'POST' });
      if (res.ok) {
        toast.success('Broadcast resumed');
        fetchBroadcasts(true);
      } else {
        toast.error('Failed to resume broadcast');
      }
    } catch {
      toast.error('Error resuming broadcast');
    }
  }

  async function handleToggleOffer(e: React.MouseEvent, broadcast: Broadcast) {
    e.stopPropagation();
    const isEnded = broadcast.status === 'cancelled' || broadcast.status === 'ended';
    const nextStatus = isEnded ? 'sent' : 'cancelled';
    try {
      const res = await fetch(`/api/broadcasts/${broadcast.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        toast.success(
          isEnded
            ? 'Campaign offer turned ON. AI knowledge updated!'
            : 'Campaign offer turned OFF. AI knowledge updated!'
        );
        fetchBroadcasts(true);
      } else {
        toast.error('Failed to update campaign offer status');
      }
    } catch {
      toast.error('Error updating campaign offer status');
    }
  }

  return (
    <div className="space-y-6">
      {/* Top indeterminate progress bar when any broadcast is actively sending */}
      {anySending && (
        <div
          role="progressbar"
          aria-label={t('broadcastInProgress')}
          className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-primary/20"
        >
          <div className="h-full bg-primary animate-pulse w-full" />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t('title')}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary border border-primary/20">
              WhatsApp & Messenger
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchBroadcasts(false)}
            disabled={isRefreshing}
            className="border-border text-foreground hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => router.push('/broadcasts/new')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('newBroadcast')}
          </GatedButton>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Campaigns</span>
            <Radio className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {stats.total.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Across all channels</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Active Sending</span>
            {stats.sending > 0 ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
            ) : (
              <Send className="h-4 w-4 text-amber-400" />
            )}
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {stats.sending.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Currently delivering</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Messages Delivered</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">
            {stats.totalDelivered.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Successfully sent</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Audience Reached</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {stats.totalRecipients.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Total recipients</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-3 rounded-xl border border-border">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-background border-border text-sm"
          />
        </div>

        {/* Channel & Status Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Channel Tabs */}
          <div className="flex items-center rounded-lg bg-muted p-1 border border-border text-xs">
            <button
              onClick={() => setChannelFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                channelFilter === 'all'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setChannelFilter('whatsapp')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                channelFilter === 'whatsapp'
                  ? 'bg-card text-emerald-400 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              WhatsApp
            </button>
            <button
              onClick={() => setChannelFilter('messenger')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                channelFilter === 'messenger'
                  ? 'bg-card text-blue-400 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Messenger
            </button>
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg bg-background border border-border px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="sending">Sending</option>
            <option value="sent">Completed</option>
            <option value="draft">Draft</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Ended / Off</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-border bg-card">
          <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
          <p className="text-xs text-muted-foreground">Loading campaigns...</p>
        </div>
      ) : broadcasts.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center shadow-sm">
          <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary">
            <Radio className="h-8 w-8" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
            </span>
          </div>

          <h3 className="text-lg font-semibold text-foreground">
            {search || statusFilter !== 'all' || channelFilter !== 'all'
              ? 'No matching broadcasts found'
              : 'No Broadcast Campaigns Yet'}
          </h3>

          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            {search || statusFilter !== 'all' || channelFilter !== 'all'
              ? 'Try changing your search keywords or clearing active filters.'
              : 'Broadcast targeted promotional announcements, alerts, and updates to your audience on WhatsApp and Facebook Messenger.'}
          </p>

          <div className="mt-6 flex items-center gap-3">
            {search || statusFilter !== 'all' || channelFilter !== 'all' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setChannelFilter('all');
                }}
              >
                Reset Filters
              </Button>
            ) : (
              <GatedButton
                canAct={canCreate}
                gateReason="create broadcasts"
                onClick={() => router.push('/broadcasts/new')}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create First Broadcast
              </GatedButton>
            )}
          </div>
        </div>
      ) : (
        /* Broadcasts Data Table */
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-border bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-muted-foreground text-xs font-medium">Campaign</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Channel</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium text-right sm:table-cell">Recipients</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Delivery Progress</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Status</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium hidden sm:table-cell">Created</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((broadcast) => {
                const status = getBroadcastStatus(broadcast.status);
                const pct = percent(broadcast.sent_count, broadcast.total_recipients);

                return (
                  <TableRow
                    key={broadcast.id}
                    className="cursor-pointer border-border hover:bg-muted/40 transition-colors"
                    onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                  >
                    {/* Campaign Name */}
                    <TableCell className="font-medium text-foreground py-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm hover:text-primary transition-colors">
                          {broadcast.name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-xs">
                          {broadcast.template_name || 'Custom text broadcast'}
                        </span>
                      </div>
                    </TableCell>

                    {/* Channel */}
                    <TableCell>
                      <ChannelBadge channel={broadcast.channel} />
                    </TableCell>

                    {/* Recipients Count */}
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {broadcast.total_recipients.toLocaleString()}
                    </TableCell>

                    {/* Delivery Progress Bar */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted border border-border">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              broadcast.status === 'failed'
                                ? 'bg-red-500'
                                : broadcast.status === 'sending'
                                ? 'bg-amber-400'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground font-mono">
                          {broadcast.sent_count}/{broadcast.total_recipients} ({pct}%)
                        </span>
                      </div>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.classes}`}
                      >
                        {status.pulse && (
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
                          </span>
                        )}
                        {broadcast.status === 'sending' ? 'Sending' : tStatus(status.label)}
                      </span>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                      {new Date(broadcast.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {broadcast.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                            title="Resume broadcast"
                            onClick={(e) => handleResume(e, broadcast.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${
                            broadcast.status === 'cancelled' || broadcast.status === 'ended'
                              ? 'text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-emerald-400 hover:text-amber-400 hover:bg-amber-500/10'
                          }`}
                          title={
                            broadcast.status === 'cancelled' || broadcast.status === 'ended'
                              ? 'Turn ON Campaign Offer for AI'
                              : 'Turn OFF Campaign Offer for AI'
                          }
                          onClick={(e) => handleToggleOffer(e, broadcast)}
                        >
                          {broadcast.status === 'cancelled' || broadcast.status === 'ended' ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="View Details"
                          onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-400"
                          title="Delete"
                          onClick={(e) => handleDelete(e, broadcast.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
