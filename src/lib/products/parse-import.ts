import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { generateSku } from './generate-sku'

export interface ImportRow {
  rowIndex: number
  name: string
  sku: string
  description: string
  price: number | null
  cost: number | null
  category: string
  brand: string
  stock_quantity: number | null
  unit: string
  barcode: string
  status: 'active' | 'inactive' | 'draft'
  errors: string[]
}

export interface ParseResult {
  rows: ImportRow[]
  totalRows: number
  validRows: number
  errorRows: number
}

function normalizeStatus(val: string): 'active' | 'inactive' | 'draft' {
  const v = val?.toString().toLowerCase().trim()
  if (v === 'active' || v === 'সক্রিয়') return 'active'
  if (v === 'inactive' || v === 'নিষ্ক্রিয়') return 'inactive'
  return 'draft'
}

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function normalizeRow(raw: Record<string, unknown>, index: number): ImportRow {
  const errors: string[] = []

  // Flexible header matching — accept English and Bengali column names + position fallback
  const get = (pos: number, ...keys: string[]): string => {
    for (const k of keys) {
      const found = Object.keys(raw).find(
        (rk) => rk.toLowerCase().trim() === k.toLowerCase()
      )
      if (found && raw[found] !== undefined && raw[found] !== null && raw[found] !== '') {
        return String(raw[found]).trim()
      }
    }
    // Fallback: return value at column position
    const vals = Object.values(raw)
    if (pos >= 0 && pos < vals.length) {
      return String(vals[pos] ?? '').trim()
    }
    return ''
  }

  const name = get(0, 'name', 'product name', 'product', 'item', 'item name', 'title', 'পণ্যের নাম', 'নাম', 'পণ্য')
  if (!name) errors.push('Name is required')

  const rawSku = get(-1, 'sku', 'sku code', 'স্কু')
  const brand = get(2, 'brand', 'brand name', 'manufacturer', 'made by', 'made in', 'country', 'ব্র্যান্ড')
  const category = get(-1, 'category', 'cat', 'type', 'group', 'ক্যাটাগরি')
  const sku = rawSku || generateSku({ name, brand, category })

  const price = toNumber(get(3, 'price', 'selling price', 'sale price', 'retail price', 'mrp', 'মূল্য'))
  const cost = toNumber(get(-1, 'cost', 'cost price', 'ক্রয় মূল্য'))
  const stock_quantity = toNumber(get(-1, 'stock', 'stock quantity', 'quantity', 'qty', 'স্টক'))

  return {
    rowIndex: index + 2, // 1-based, +1 for header
    name,
    sku,
    description: get(1, 'description', 'desc', 'size', 'size ml', 'volume', 'বিবরণ'),
    price,
    cost,
    category,
    brand,
    stock_quantity,
    unit: get(-1, 'unit', 'একক') || 'pcs',
    barcode: get(-1, 'barcode', 'বারকোড'),
    status: normalizeStatus(get(-1, 'status', 'অবস্থা')),
    errors,
  }
}

export async function parseImportFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  let rawRows: Record<string, unknown>[] = []

  if (ext === 'csv') {
    const text = await file.text()
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    })
    rawRows = result.data

    // Skip empty leading rows and find actual header row
    // If all values in first row are empty, remove it and re-parse with next row as header
    if (rawRows.length > 0) {
      const firstRowValues = Object.values(rawRows[0])
      const allEmpty = firstRowValues.every(v => !v || String(v).trim() === '')
      if (allEmpty && rawRows.length > 1) {
        // The "header" row was actually empty — re-parse using row index 1 as header
        const lines = text.split('\n').filter(l => l.trim() && l.replace(/,/g,'').trim())
        const cleanedText = lines.join('\n')
        const result2 = Papa.parse<Record<string, unknown>>(cleanedText, {
          header: true,
          skipEmptyLines: true,
        })
        rawRows = result2.data
      }
    }
  } else if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  } else {
    throw new Error('Unsupported file type. Please upload .csv, .xlsx, or .xls')
  }

  const rows = rawRows.map((raw, i) => normalizeRow(raw, i))

  return {
    rows,
    totalRows: rows.length,
    validRows: rows.filter((r) => r.errors.length === 0).length,
    errorRows: rows.filter((r) => r.errors.length > 0).length,
  }
}
