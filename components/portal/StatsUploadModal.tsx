'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  IconFileSpreadsheet,
  IconCheck,
  IconAlertTriangle,
  IconUpload,
  IconX,
  IconLoader2,
  IconDownload,
} from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { statsAPI } from '@/lib/api'
import { parseArbiterFile } from '@/lib/stats/readWorkbook'
import type { NormalizedGame, RowError } from '@/lib/stats/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  season: string
  onImported: (result: { insertedCount: number; updatedCount: number; unmappedOrgs: string[] }) => void
}

type Parsed = {
  file: File
  fileHash: string
  games: NormalizedGame[]
  errors: RowError[]
  duplicateCount: number
  orgs: string[]
}

// Column layout of the Arbiter "Game Info" export the parser expects.
const TEMPLATE_HEADERS = [
  'GameID', 'Date', 'Time', 'Status', 'SiteName', 'SubSiteName', 'BillToName',
  'SportName', 'LevelName', 'HomeTeams', 'AwayTeams', 'Official 1', 'Official 2', 'Official 3',
]
const TEMPLATE_EXAMPLE = [
  '74397', '2025-09-08', '18:35', 'Normal', 'Community Sport Centre', 'Court 2',
  'Example Senior Mens League', 'Basketball', 'Mens Div 1', 'TBA', 'TBA',
  'Jane Official', 'Sam Official', '',
]

function downloadTemplate() {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const csv = [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'arbiter-game-info-template.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function StatsUploadModal({ isOpen, onClose, season, onImported }: Props) {
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setParsed(null)
    setError(null)
    setParsing(false)
    setUploading(false)
  }

  const handleClose = () => {
    if (uploading) return
    reset()
    onClose()
  }

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setError(null)
    setParsed(null)
    setParsing(true)
    try {
      const result = await parseArbiterFile(file)
      if (result.games.length === 0) {
        setError(
          result.errors[0]?.message ||
            'No game rows found. Make sure this is the Arbiter "Game Info" export.'
        )
      }
      setParsed({
        file,
        fileHash: result.fileHash,
        games: result.games,
        errors: result.errors,
        duplicateCount: result.duplicateCount,
        orgs: result.orgs,
      })
    } catch (e: any) {
      setError(e?.message || 'Could not read that file.')
    } finally {
      setParsing(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
  })

  const handleUpload = async () => {
    if (!parsed || parsed.games.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const result = await statsAPI.uploadGames({
        season,
        filename: parsed.file.name,
        fileHash: parsed.fileHash,
        games: parsed.games,
        rowCount: parsed.games.length + parsed.errors.length,
      })
      onImported(result)
      reset()
      onClose()
    } catch (e: any) {
      if (e?.status === 409) {
        setError('This exact file has already been imported — nothing to do.')
      } else {
        setError(e?.message || 'Upload failed.')
      }
      setUploading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Upload Arbiter export — ${season}`} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Upload the Arbiter <strong>Game Info</strong> export (<code>.xlsx</code> or <code>.csv</code>).
          Games are matched by their Arbiter <strong>GameID</strong>, so re-uploading an overlapping
          export updates existing games instead of duplicating them.
        </p>

        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:text-orange-700 dark:text-portal-accent"
        >
          <IconDownload className="h-4 w-4" /> Download template (.csv)
        </button>

        {!parsed && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-brand-primary bg-orange-50 dark:bg-orange-900/10'
                : 'border-gray-300 dark:border-portal-border hover:border-brand-primary'
            }`}
          >
            <input {...getInputProps()} />
            {parsing ? (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <IconLoader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Reading spreadsheet…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
                <IconFileSpreadsheet className="h-10 w-10 text-brand-primary" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Drop the Arbiter export here, or click to choose
                </p>
                <p className="text-xs">.xlsx or .csv</p>
              </div>
            )}
          </div>
        )}

        {parsed && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-portal-border p-3">
              <IconFileSpreadsheet className="h-8 w-8 text-brand-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{parsed.file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(parsed.file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button onClick={reset} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Choose a different file">
                <IconX className="h-5 w-5" />
              </button>
            </div>

            {/* Summary of what will be imported */}
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Games" value={parsed.games.length} tone="good" />
              <Stat label="Assignments" value={parsed.games.reduce((a, g) => a + g.assignmentCount, 0)} tone="good" />
              <Stat label="Skipped rows" value={parsed.errors.length} tone={parsed.errors.length ? 'warn' : 'good'} />
            </div>

            {parsed.duplicateCount > 0 && (
              <Notice tone="warn">
                {parsed.duplicateCount} duplicate GameID{parsed.duplicateCount > 1 ? 's' : ''} within the file — the last occurrence of each was kept.
              </Notice>
            )}
            {parsed.errors.length > 0 && (
              <Notice tone="warn">
                {parsed.errors.length} row{parsed.errors.length > 1 ? 's' : ''} skipped (missing/invalid GameID): rows{' '}
                {parsed.errors.slice(0, 8).map((e) => e.row).join(', ')}
                {parsed.errors.length > 8 ? '…' : ''}.
              </Notice>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {parsed.orgs.length} distinct organizations found — any not yet classified will be flagged after import.
            </p>
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!parsed || parsed.games.length === 0 || uploading}>
            {uploading ? (
              <span className="flex items-center gap-2"><IconLoader2 className="h-4 w-4 animate-spin" /> Importing…</span>
            ) : (
              <span className="flex items-center gap-2"><IconUpload className="h-4 w-4" /> Import {parsed?.games.length ?? ''} games</span>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-portal-hover p-3 text-center">
      <p className={`text-2xl font-bold ${tone === 'warn' && value > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'warn' | 'error' | 'good'; children: React.ReactNode }) {
  const styles = {
    warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    good: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
  }[tone]
  const Icon = tone === 'good' ? IconCheck : IconAlertTriangle
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styles}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
