/**
 * Thin SheetJS wrapper — the only place that imports `xlsx`.
 * Reads an uploaded .xlsx or .csv file into a raw array-of-rows, then hands off
 * to the pure `normalizeGameRows` parser. Runs client-side (browser File API).
 */
import * as XLSX from 'xlsx'
import { normalizeGameRows } from './arbiterGameInfo'
import type { ParseResult } from './types'

/** SHA-256 of the file bytes, hex — the whole-file idempotency key. */
export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const isGameIdCell = (c: unknown) =>
  String(c ?? '').trim().toLowerCase().replace(/[\s_]+/g, '') === 'gameid'

/**
 * Read the worksheet holding the Game Info rows into raw rows (array of arrays).
 * Scans every sheet and picks the first one with a "GameID" header — so it works
 * whether the user uploads the standalone Arbiter export OR the multi-sheet
 * summary workbook (whose first sheet is "Instructions"). Falls back to the first
 * non-empty sheet so the "no GameID header" error still surfaces meaningfully.
 */
export async function readSheetRows(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  let fallback: unknown[][] = []
  for (const name of wb.SheetNames) {
    // header:1 => array of arrays; raw values preserved (dates as Date via cellDates).
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: '' })
    if (rows.some((r) => Array.isArray(r) && r.some(isGameIdCell))) return rows
    if (!fallback.length && rows.length) fallback = rows
  }
  return fallback
}

/** Full client-side pipeline: File -> normalized, validated games + file hash. */
export async function parseArbiterFile(file: File): Promise<ParseResult & { fileHash: string }> {
  const [rows, fileHash] = await Promise.all([readSheetRows(file), hashFile(file)])
  const result = normalizeGameRows(rows)
  return { ...result, fileHash }
}
