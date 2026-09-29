'use client'

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { parseImportFile, type ParseResult, type ImportRow } from '@/lib/products/parse-import'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  onImported: () => void
}

export function ImportDialog({ open, onClose, onImported }: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [enriching, setEnriching] = useState(false)
  const [enriched, setEnriched] = useState(false)

  if (!open) return null

  const handleFile = async (file: File) => {
    setError(null)
    setParseResult(null)
    setImportResult(null)
    setEnriched(false)
    try {
      const result = await parseImportFile(file)
      setParseResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file')
    }
  }

  const handleEnrich = async () => {
    if (!parseResult) return
    setEnriching(true)
    try {
      // Only enrich rows that are missing category OR have suspicious brand (country name)
      const countryNames = ['uk', 'poland', 'france', 'thailand', 'usa', 'china', 'germany', 'italy', 'spain', 'korea', 'japan', 'india', 'bangladesh']
      const rowsToEnrich = parseResult.rows.map((r: ImportRow) => ({
        rowIndex: r.rowIndex,
        name: r.name,
        brand: r.brand,
        category: r.category,
      })).filter((r) => 
        r.name && (
          !r.category || 
          countryNames.includes(r.brand?.toLowerCase().trim() ?? '')
        )
      )

      if (rowsToEnrich.length === 0) {
        setEnriched(true)
        return
      }

      const res = await fetch('/api/products/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: rowsToEnrich }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Enrichment failed')

      interface EnrichedItem { rowIndex: number; brand?: string; category?: string; description?: string }
      const enrichMap = new Map<number, EnrichedItem>(
        (data.enriched || []).map((e: EnrichedItem) => [e.rowIndex, e])
      )
      const updatedRows = parseResult.rows.map((row: ImportRow) => {
        const e = enrichMap.get(row.rowIndex)
        if (!e) return row
        return {
          ...row,
          brand: e.brand || row.brand,
          category: e.category || row.category,
          description: e.description || row.description,
          errors: [], // clear errors since name was found
        }
      })

      setParseResult({
        ...parseResult,
        rows: updatedRows,
        validRows: updatedRows.filter((r: ImportRow) => r.errors.length === 0).length,
        errorRows: updatedRows.filter((r: ImportRow) => r.errors.length > 0).length,
      })
      setEnriched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI enrichment failed')
    } finally {
      setEnriching(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    if (!parseResult) return
    const validRows = parseResult.rows.filter((r: ImportRow) => r.errors.length === 0)
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setImportResult({ imported: data.imported, total: data.total })
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setParseResult(null)
    setImportResult(null)
    setError(null)
    setEnriched(false)
    setEnriching(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Import Products</h2>
          </div>
          <button onClick={handleClose} className="rounded p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Success state */}
          {importResult ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="size-12 text-green-500" />
              <p className="text-xl font-semibold">Import Complete!</p>
              <p className="text-muted-foreground">
                Successfully imported <strong>{importResult.imported}</strong> of{' '}
                <strong>{importResult.total}</strong> products.
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
              {/* File drop zone */}
              {!parseResult && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'}`}
                >
                  <Upload className="size-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">Drop your file here or click to browse</p>
                    <p className="text-sm text-muted-foreground mt-1">Supports .xlsx, .xls, .csv</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                  />
                </div>
              )}

              {/* Column guide */}
              {!parseResult && (
                <div className="rounded-lg bg-muted/50 p-4 text-sm">
                  <p className="font-medium mb-2">Expected columns (any order):</p>
                  <div className="grid grid-cols-3 gap-1 text-muted-foreground">
                    {['name *', 'sku', 'description', 'price', 'cost', 'category', 'brand', 'stock', 'unit', 'barcode', 'status'].map(col => (
                      <span key={col} className="font-mono text-xs bg-background rounded px-1 py-0.5">{col}</span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">* required &nbsp;|&nbsp; SKU auto-generated if blank &nbsp;|&nbsp; Bengali column names also supported</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 text-destructive p-3 text-sm">
                  <AlertCircle className="size-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Preview table */}
              {parseResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Total: <strong>{parseResult.totalRows}</strong></span>
                    <span className="text-green-600">Valid: <strong>{parseResult.validRows}</strong></span>
                    {parseResult.errorRows > 0 && (
                      <span className="text-destructive">Errors: <strong>{parseResult.errorRows}</strong></span>
                    )}
                    <button onClick={() => { setParseResult(null); if (fileRef.current) fileRef.current.value = '' }}
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground underline">
                      Change file
                    </button>
                  </div>

                  {parseResult && !importResult && !enriched && (
                    <button
                      onClick={handleEnrich}
                      disabled={enriching}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 w-full justify-center"
                    >
                      {enriching ? (
                        <>
                          <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          AI is filling in missing info...
                        </>
                      ) : (
                        <>✨ Auto-fill missing info with AI</>
                      )}
                    </button>
                  )}
                  {enriched && parseResult && !importResult && (
                    <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-2 text-sm text-primary">
                      ✅ AI enrichment complete — missing fields filled in
                    </div>
                  )}

                  <div className="overflow-auto rounded-lg border max-h-64">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          {['Row', 'Name', 'SKU', 'Price', 'Category', 'Brand', 'Stock', 'Status', 'Issues'].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.rows.map((row: ImportRow) => (
                          <tr key={row.rowIndex} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                            <td className="px-3 py-1.5 text-muted-foreground">{row.rowIndex}</td>
                            <td className="px-3 py-1.5 font-medium">{row.name || <span className="text-destructive">—</span>}</td>
                            <td className="px-3 py-1.5 font-mono">{row.sku}</td>
                            <td className="px-3 py-1.5">{row.price != null ? row.price : '—'}</td>
                            <td className="px-3 py-1.5">{row.category || '—'}</td>
                            <td className="px-3 py-1.5">{row.brand || '—'}</td>
                            <td className="px-3 py-1.5">{row.stock_quantity ?? '—'}</td>
                            <td className="px-3 py-1.5">{row.status}</td>
                            <td className="px-3 py-1.5 text-destructive">{row.errors.join(', ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {parseResult && !importResult && (
          <div className="border-t px-6 py-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {parseResult.validRows} product{parseResult.validRows !== 1 ? 's' : ''} will be imported
            </p>
            <div className="flex gap-2">
              <button onClick={handleClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || parseResult.validRows === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground font-medium disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import ${parseResult.validRows} Products`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
