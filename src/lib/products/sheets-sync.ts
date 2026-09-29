import Papa from 'papaparse'
import { parseImportFile } from './parse-import'
import type { ParseResult } from './parse-import'

export function extractSheetId(url: string): { id: string; gid: string } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) return null
  const gidMatch = url.match(/[?&#]gid=(\d+)/)
  return { id: idMatch[1], gid: gidMatch?.[1] ?? '0' }
}

export function sheetsToCsvUrl(url: string): string | null {
  const parsed = extractSheetId(url)
  if (!parsed) return null
  return `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=csv&gid=${parsed.gid}`
}

export async function fetchAndParseSheet(url: string): Promise<ParseResult> {
  const csvUrl = sheetsToCsvUrl(url)
  if (!csvUrl) throw new Error('Invalid Google Sheets URL. Please paste a valid Google Sheets link.')

  const res = await fetch(csvUrl, { cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Sheet is not publicly accessible. Please share it as "Anyone with the link can view".')
    }
    throw new Error(`Failed to fetch sheet (${res.status}). Make sure the sheet is shared publicly.`)
  }

  const csvText = await res.text()
  if (!csvText.trim()) throw new Error('The sheet appears to be empty.')

  // Create a fake File object so we can reuse parseImportFile
  const blob = new Blob([csvText], { type: 'text/csv' })
  const file = new File([blob], 'sheet.csv', { type: 'text/csv' })
  return parseImportFile(file)
}

// Convert OneDrive/SharePoint sharing URL to direct download URL
export function onedriveToDownloadUrl(url: string): string | null {
  // Already a direct xlsx URL
  if (url.match(/\.xlsx?(\?|$)/i)) return url

  // OneDrive short link: https://1drv.ms/x/...
  // Convert to download using sharing API
  if (url.includes('1drv.ms') || url.includes('onedrive.live.com')) {
    // Base64-encode the URL (URL-safe, no padding)
    const encoded = Buffer.from(url)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    return `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`
  }

  // SharePoint / Office 365
  if (url.includes('sharepoint.com') || url.includes('office.com')) {
    // Add download=1 parameter
    const u = new URL(url)
    u.searchParams.set('download', '1')
    return u.toString()
  }

  return null
}

export function detectSyncSource(url: string): 'google-sheets' | 'onedrive' | 'direct-excel' | 'unknown' {
  if (url.includes('docs.google.com/spreadsheets')) return 'google-sheets'
  if (url.includes('1drv.ms') || url.includes('onedrive.live.com') || url.includes('sharepoint.com')) return 'onedrive'
  if (url.match(/\.xlsx?(\?|$)/i)) return 'direct-excel'
  return 'unknown'
}

export async function fetchAndParseUrl(url: string): Promise<ParseResult> {
  const source = detectSyncSource(url)

  if (source === 'google-sheets') {
    return fetchAndParseSheet(url)
  }

  // OneDrive or direct Excel URL
  const downloadUrl = source === 'onedrive' 
    ? onedriveToDownloadUrl(url) 
    : url

  if (!downloadUrl) throw new Error('Could not determine download URL. Please use a direct file link.')

  const res = await fetch(downloadUrl, { cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('File is not publicly accessible. Please share it so "Anyone with the link can view".')
    }
    throw new Error(`Failed to fetch file (${res.status}). Make sure the link is public.`)
  }

  const buffer = await res.arrayBuffer()
  const { read, utils } = await import('xlsx')
  const workbook = read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  // Re-use papaparse via a CSV conversion
  const csvRows = rawRows.map(row => Object.values(row).join(',')).join('\n')
  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]).join(',') : ''
  const csvText = headers + '\n' + csvRows

  // Use the importFile path  
  const file = new File([csvText], 'sheet.csv', { type: 'text/csv' })
  return parseImportFile(file)
}
