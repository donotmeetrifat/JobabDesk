'use client'

import { useEffect, useState } from 'react'
import { Sheet, RefreshCw, CheckCircle2, AlertCircle, X, ExternalLink } from 'lucide-react'
import { fetchAndParseSheet, sheetsToCsvUrl } from '@/lib/products/sheets-sync'
import type { ParseResult, ImportRow } from '@/lib/products/parse-import'

interface SheetsSyncDialogProps {
  open: boolean
  onClose: () => void
  onSynced: () => void
}

export function SheetsSyncDialog({ open, onClose, onSynced }: SheetsSyncDialogProps) {
  const [url, setUrl] = useState('')
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [syncResult, setSyncResult] = useState<{ imported: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      const result = await fetchAndParseSheet(url.trim())
      setParseResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch sheet')
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
          <div className="flex items-center gap-2">
            <Sheet className="size-5 text-green-600" />
            <h2 className="text-lg font-semibold">Sync from Google Sheets</h2>
          </div>
          <button onClick={handleClose} className="rounded p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Success */}
          {syncResult ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="size-12 text-green-500" />
              <p className="text-xl font-semibold">Sync Complete!</p>
              <p className="text-muted-foreground">
                Imported <strong>{syncResult.imported}</strong> of{' '}
                <strong>{syncResult.total}</strong> products from Google Sheets.
              </p>
              <p className="text-xs text-muted-foreground">
                Sheets URL saved — click &quot;Sync Now&quot; anytime to re-sync.
              </p>
              <button
                onClick={handleClose}
                className="mt-2 rounded-lg bg-primary px-6 py-2 text-primary-foreground font-medium"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Instructions */}
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 text-sm">
                <p className="font-medium text-green-800 dark:text-green-200 mb-1">How to share your Google Sheet:</p>
                <ol className="list-decimal list-inside space-y-1 text-green-700 dark:text-green-300">
                  <li>Open your Google Sheet</li>
                  <li>Click <strong>Share</strong> &rarr; <strong>Anyone with the link</strong> &rarr; <strong>Viewer</strong></li>
                  <li>Copy the link and paste it below</li>
                </ol>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Google Sheets URL</label>
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={handleFetch}
                    disabled={fetching || !url.trim()}
                    className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white font-medium disabled:opacity-50 hover:bg-green-700"
                  >
                    <RefreshCw className={`size-4 ${fetching ? 'animate-spin' : ''}`} />
                    {fetching ? 'Fetching...' : 'Fetch'}
                  </button>
                </div>
                {sheetsToCsvUrl(url) && (
                  <a
                    href={sheetsToCsvUrl(url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    Preview CSV export
                  </a>
                )}
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
                  <div className="overflow-auto rounded-lg border max-h-56">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          {['Row','Name','SKU','Price','Category','Brand','Stock','Status'].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.rows.slice(0, 10).map((row: ImportRow) => (
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
                    {parseResult.totalRows > 10 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                        + {parseResult.totalRows - 10} more rows
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {parseResult && !syncResult && (
          <div className="border-t px-6 py-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {parseResult.validRows} product{parseResult.validRows !== 1 ? 's' : ''} will be synced
            </p>
            <div className="flex gap-2">
              <button onClick={handleClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={handleSync}
                disabled={importing || parseResult.validRows === 0}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white font-medium disabled:opacity-50 hover:bg-green-700"
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
