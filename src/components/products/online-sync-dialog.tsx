'use client'

import { useEffect, useState } from 'react'
import { 
  RefreshCw, CheckCircle2, AlertCircle, X
} from 'lucide-react'
import { fetchAndParseUrl, detectSyncSource } from '@/lib/products/sheets-sync'
import type { ParseResult, ImportRow } from '@/lib/products/parse-import'

const SOURCE_INFO = {
  'google-sheets': {
    icon: '📊',
    label: 'Google Sheets',
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    btnBg: 'bg-green-600 hover:bg-green-700',
    instructions: [
      'Open your Google Sheet',
      'Click Share → Anyone with the link → Viewer',
      'Copy the link and paste below',
    ],
  },
  'onedrive': {
    icon: '📘',
    label: 'Microsoft OneDrive / Excel',
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    btnBg: 'bg-blue-600 hover:bg-blue-700',
    instructions: [
      'Open your Excel file in OneDrive or SharePoint',
      'Click Share → Anyone with the link → View',
      'Copy the link and paste below',
    ],
  },
  'direct-excel': {
    icon: '📗',
    label: 'Direct Excel URL',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    btnBg: 'bg-emerald-600 hover:bg-emerald-700',
    instructions: [
      'Paste any public .xlsx or .xls file URL',
      'The file must be publicly downloadable',
    ],
  },
  'unknown': {
    icon: '🔗',
    label: 'Paste your link',
    color: 'text-muted-foreground',
    bg: 'bg-muted/30',
    border: 'border-muted',
    btnBg: 'bg-primary hover:bg-primary/90',
    instructions: [
      'Paste a Google Sheets, OneDrive, SharePoint, or direct .xlsx URL',
    ],
  },
}

interface OnlineSyncDialogProps {
  open: boolean
  onClose: () => void
  onSynced: () => void
}

export function OnlineSyncDialog({ open, onClose, onSynced }: OnlineSyncDialogProps) {
  const [url, setUrl] = useState('')
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [syncResult, setSyncResult] = useState<{ imported: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const source = detectSyncSource(url.trim())
  const info = SOURCE_INFO[source]

  useEffect(() => {
    if (!open) return
    fetch('/api/products/sync-sheets')
      .then((r) => r.json())
      .then((d) => { if (d.sheetsUrl) { setSavedUrl(d.sheetsUrl); setUrl(d.sheetsUrl) } })
      .catch(() => {})
  }, [open])

  if (!open) return null

  const handleFetch = async () => {
    if (!url.trim()) return
    setError(null)
    setParseResult(null)
    setSyncResult(null)
    setFetching(true)
    try {
      const result = await fetchAndParseUrl(url.trim())
      setParseResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch file')
    } finally {
      setFetching(false)
    }
  }

  const handleSync = async () => {
    if (!parseResult) return
    const validRows = parseResult.rows.filter((r: ImportRow) => r.errors.length === 0)
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/products/sync-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetsUrl: url.trim(), rows: validRows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setSyncResult({ imported: data.imported, total: data.total })
      onSynced()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setUrl(savedUrl ?? '')
    setParseResult(null)
    setSyncResult(null)
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Sync from Online Spreadsheet</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Google Sheets · OneDrive · SharePoint · Any .xlsx URL
            </p>
          </div>
          <button onClick={handleClose} className="rounded p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {syncResult ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="size-12 text-green-500" />
              <p className="text-xl font-semibold">Sync Complete!</p>
              <p className="text-muted-foreground">
                Imported <strong>{syncResult.imported}</strong> of{' '}
                <strong>{syncResult.total}</strong> products.
              </p>
              <p className="text-xs text-muted-foreground">Link saved — click &quot;Sync&quot; anytime to re-sync.</p>
              <button onClick={handleClose} className="mt-2 rounded-lg bg-primary px-6 py-2 text-primary-foreground font-medium">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Source badge */}
              {source !== 'unknown' && (
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border ${info.bg} ${info.border} ${info.color}`}>
                  <span>{info.icon}</span>
                  <span>Detected: {info.label}</span>
                </div>
              )}

              {/* Instructions */}
              <div className={`rounded-lg border p-4 text-sm ${info.bg} ${info.border}`}>
                <p className={`font-medium mb-2 ${info.color}`}>
                  {source === 'unknown' ? '🔗 Supported sources:' : `${info.icon} How to share from ${info.label}:`}
                </p>
                {source === 'unknown' ? (
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(SOURCE_INFO).filter(([k]) => k !== 'unknown').map(([k, v]) => (
                      <div key={k} className={`rounded-lg border p-2 text-center ${v.bg} ${v.border}`}>
                        <div className="text-lg">{v.icon}</div>
                        <div className={`text-xs font-medium mt-1 ${v.color}`}>{v.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ol className={`list-decimal list-inside space-y-1 ${info.color} opacity-80`}>
                    {info.instructions.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                )}
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Spreadsheet URL</label>
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setParseResult(null); setError(null) }}
                    placeholder="Paste Google Sheets, OneDrive, or .xlsx URL..."
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={handleFetch}
                    disabled={fetching || !url.trim()}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-white font-medium disabled:opacity-50 ${info.btnBg}`}
                  >
                    <RefreshCw className={`size-4 ${fetching ? 'animate-spin' : ''}`} />
                    {fetching ? 'Fetching...' : 'Fetch'}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 text-destructive p-3 text-sm">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {/* Preview */}
              {parseResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Total: <strong>{parseResult.totalRows}</strong></span>
                    <span className="text-green-600">Valid: <strong>{parseResult.validRows}</strong></span>
                    {parseResult.errorRows > 0 && (
                      <span className="text-destructive">Errors: <strong>{parseResult.errorRows}</strong></span>
                    )}
                  </div>
                  <div className="overflow-auto rounded-lg border max-h-52">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          {['Row','Name','SKU','Price','Category','Brand','Stock','Status'].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.rows.slice(0, 8).map((row: ImportRow) => (
                          <tr key={row.rowIndex} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                            <td className="px-3 py-1.5 text-muted-foreground">{row.rowIndex}</td>
                            <td className="px-3 py-1.5 font-medium">{row.name || <span className="text-destructive">—</span>}</td>
                            <td className="px-3 py-1.5 font-mono text-xs">{row.sku}</td>
                            <td className="px-3 py-1.5">{row.price ?? '—'}</td>
                            <td className="px-3 py-1.5">{row.category || '—'}</td>
                            <td className="px-3 py-1.5">{row.brand || '—'}</td>
                            <td className="px-3 py-1.5">{row.stock_quantity ?? '—'}</td>
                            <td className="px-3 py-1.5">{row.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parseResult.totalRows > 8 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                        + {parseResult.totalRows - 8} more rows
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {parseResult && !syncResult && (
          <div className="border-t px-6 py-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {parseResult.validRows} product{parseResult.validRows !== 1 ? 's' : ''} will be synced
            </p>
            <div className="flex gap-2">
              <button onClick={handleClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                onClick={handleSync}
                disabled={importing || parseResult.validRows === 0}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-white font-medium disabled:opacity-50 ${info.btnBg}`}
              >
                <RefreshCw className={`size-4 ${importing ? 'animate-spin' : ''}`} />
                {importing ? 'Syncing...' : `Sync ${parseResult.validRows} Products`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
