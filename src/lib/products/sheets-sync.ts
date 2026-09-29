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
