'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { IconAlertTriangle, IconCheck, IconCloudUpload, IconDownload, IconFileSpreadsheet, IconLoader2, IconX } from '@tabler/icons-react'
import Modal from '@/components/ui/Modal'
import { calendarAPI } from '@/lib/api'
import {
  buildTemplateCsv,
  parseEventsCsv,
  type CsvRowResult,
  type ParseEventsCsvResult,
} from '@/lib/forms/calendarEventCsv'
import { buildCalendarEventPayload } from '@/lib/forms/calendarEventPayload'

interface BulkEventUploadModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called with the array of created event rows after a successful upload. */
  onUploaded: (created: any[]) => void
}

interface UploadProgress {
  done: number
  total: number
  failures: { lineNumber: number; error: string }[]
}

export default function BulkEventUploadModal({
  isOpen,
  onClose,
  onUploaded,
}: BulkEventUploadModalProps) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParseEventsCsvResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validRows = useMemo<CsvRowResult[]>(
    () => (parsed?.rows ?? []).filter((r) => r.ok),
    [parsed]
  )
  const invalidRows = useMemo<CsvRowResult[]>(
    () => (parsed?.rows ?? []).filter((r) => !r.ok),
    [parsed]
  )

  const reset = () => {
    setFileName(null)
    setParsed(null)
    setProgress(null)
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleClose = () => {
    if (uploading) return
    reset()
    onClose()
  }

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name)
    setProgress(null)
    try {
      const text = await readFileAsText(file)
      setParsed(parseEventsCsv(text))
    } catch (err) {
      setParsed({
        headerErrors: [`Could not read file: ${(err as Error).message}`],
        rows: [],
      })
    }
  }, [])

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'events-template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const upload = async () => {
    if (validRows.length === 0) return
    setUploading(true)
    const failures: UploadProgress['failures'] = []
    const created: any[] = []
    setProgress({ done: 0, total: validRows.length, failures: [] })

    // Upload sequentially so the API isn't slammed and we can report
    // per-row failures in order. The volume is small (a season at a time).
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      if (!row.ok) continue
      try {
        const payload = buildCalendarEventPayload(row.state)
        const result = await calendarAPI.create(payload)
        created.push(result)
      } catch (err) {
        failures.push({
          lineNumber: row.lineNumber,
          error: (err as Error).message || 'Upload failed',
        })
      }
      setProgress({
        done: i + 1,
        total: validRows.length,
        failures: [...failures],
      })
    }

    setUploading(false)

    if (created.length > 0) onUploaded(created)

    // If everything succeeded, close. Otherwise leave the modal open
    // so the user can see which rows failed.
    if (failures.length === 0) {
      reset()
      onClose()
    }
  }

  const headerErrors = parsed?.headerErrors ?? []
  const hasFile = fileName !== null && parsed !== null
  const canUpload =
    hasFile &&
    !uploading &&
    headerErrors.length === 0 &&
    validRows.length > 0 &&
    invalidRows.length === 0

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Upload Events" size="lg">
      <div className="space-y-4">
        {/* Template download */}
        <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40">
          <div className="text-sm text-orange-900 dark:text-orange-200">
            <p className="font-medium">Need the format?</p>
            <p className="text-xs mt-0.5 opacity-90">
              Download the template, fill in events row-by-row, and upload the
              CSV here. Tournament-specific columns are only used when{' '}
              <span className="font-mono">Event Type</span> is{' '}
              <span className="font-mono">Tournament</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white dark:bg-portal-surface border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40"
          >
            <IconDownload className="h-3.5 w-3.5" />
            Download template
          </button>
        </div>

        {/* Drop zone */}
        {!hasFile && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
              dragActive
                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                : 'border-gray-300 dark:border-portal-border hover:border-orange-400 hover:bg-gray-50 dark:hover:bg-portal-hover'
            }`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
          >
            <IconCloudUpload className="h-10 w-10 text-gray-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Drop a CSV file here, or click to choose
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              .csv files only
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFileInputChange}
            />
          </div>
        )}

        {/* File summary */}
        {hasFile && (
          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-portal-border bg-white dark:bg-portal-surface">
            <div className="flex items-center gap-2 text-sm">
              <IconFileSpreadsheet className="h-5 w-5 text-gray-500" />
              <span className="font-medium text-gray-900 dark:text-white">{fileName}</span>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={reset}
                className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 inline-flex items-center gap-1"
              >
                <IconX className="h-3.5 w-3.5" />
                Choose different file
              </button>
            )}
          </div>
        )}

        {/* Header errors */}
        {hasFile && headerErrors.length > 0 && (
          <div className="p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800/40">
            <div className="flex items-center gap-2 mb-1.5">
              <IconAlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-800 dark:text-red-300">
                CSV header is invalid
              </span>
            </div>
            <ul className="text-xs text-red-700 dark:text-red-300 list-disc list-inside space-y-0.5">
              {headerErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Row stats */}
        {hasFile && headerErrors.length === 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat
              label="Total rows"
              value={parsed!.rows.length}
              tone="neutral"
            />
            <Stat label="Valid" value={validRows.length} tone="success" />
            <Stat label="Errors" value={invalidRows.length} tone="error" />
          </div>
        )}

        {/* Row errors */}
        {invalidRows.length > 0 && (
          <div className="p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800/40 max-h-56 overflow-auto">
            <div className="flex items-center gap-2 mb-2">
              <IconAlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-800 dark:text-red-300">
                Fix these rows before uploading
              </span>
            </div>
            <ul className="text-xs text-red-800 dark:text-red-300 space-y-1.5">
              {invalidRows.map((r) => (
                <li key={r.lineNumber}>
                  <span className="font-mono">Line {r.lineNumber}:</span>{' '}
                  {!r.ok && r.errors.join('; ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upload progress */}
        {progress && (
          <div className="p-3 rounded-lg border border-gray-200 dark:border-portal-border">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-gray-700 dark:text-gray-200 inline-flex items-center gap-2">
                {uploading ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : progress.failures.length === 0 ? (
                  <IconCheck className="h-4 w-4 text-green-600" />
                ) : (
                  <IconAlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                {uploading ? 'Uploading…' : 'Upload complete'}
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                {progress.done} / {progress.total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-portal-border overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all"
                style={{
                  width: `${
                    progress.total === 0
                      ? 0
                      : Math.round((progress.done / progress.total) * 100)
                  }%`,
                }}
              />
            </div>
            {progress.failures.length > 0 && (
              <ul className="mt-2 text-xs text-red-700 dark:text-red-300 space-y-1">
                {progress.failures.map((f) => (
                  <li key={f.lineNumber}>
                    <span className="font-mono">Line {f.lineNumber}:</span>{' '}
                    {f.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2 text-sm rounded-lg bg-gray-200 dark:bg-portal-hover text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={upload}
            disabled={!canUpload}
            className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {uploading && <IconLoader2 className="h-4 w-4 animate-spin" />}
            {uploading
              ? `Uploading (${progress?.done ?? 0}/${progress?.total ?? 0})…`
              : `Upload ${validRows.length} event${
                  validRows.length === 1 ? '' : 's'
                }`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsText(file)
  })
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'success' | 'error'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40'
      : tone === 'error'
        ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40'
        : 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-portal-surface border-gray-200 dark:border-portal-border'
  return (
    <div className={`rounded-lg border p-2 ${toneClass}`}>
      <div className="text-xl font-semibold leading-tight">{value}</div>
      <div className="text-[11px] uppercase tracking-wide opacity-75">{label}</div>
    </div>
  )
}
