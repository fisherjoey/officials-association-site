import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BulkEventUploadModal from '@/components/portal/BulkEventUploadModal'
import { CSV_HEADERS } from '@/lib/forms/calendarEventCsv'

// Mock the API client; tests assert on these calls instead of touching the
// network. The modal imports calendarAPI from '@/lib/api', which re-exports
// from '@/lib/api/portal' — mock both, mirroring the calendar page wiring.
jest.mock('@/lib/api', () => ({
  calendarAPI: {
    create: jest.fn(),
  },
}))

import { calendarAPI } from '@/lib/api'

const HEADER_ROW = CSV_HEADERS.join(',')

const VALID_TOURNAMENT_ROW = [
  'Tournament',
  'Test Bulk',
  '06/05/2026',
  '12:00 AM',
  '06/06/2026',
  '11:59 PM',
  'Site 1',
  'Bulk-uploaded',
  'Club 1',
  'Both',
  'FALSE',
  'Example City',
  '',
  'TRUE', 'FALSE', 'FALSE', 'FALSE', 'FALSE',
  'FALSE', 'FALSE', 'FALSE', 'FALSE', 'FALSE',
].join(',')

const INVALID_ROW = [
  'NotAType',
  '',
  'bad-date',
  '12:00 AM',
  '06/06/2026',
  '11:59 PM',
  '', '', '', '', '', '', '',
  'FALSE', 'FALSE', 'FALSE', 'FALSE', 'FALSE',
  'FALSE', 'FALSE', 'FALSE', 'FALSE', 'FALSE',
].join(',')

/** Build a `File` whose `.text()` resolves to the given CSV body. */
function makeCsvFile(body: string, name = 'events.csv'): File {
  return new File([body], name, { type: 'text/csv' })
}

async function selectFile(file: File) {
  // The dropzone wraps a hidden <input type="file">. Easiest to drive it
  // directly via fireEvent.change.
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement
  expect(input).toBeTruthy()
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } })
  })
}

describe('BulkEventUploadModal', () => {
  beforeEach(() => {
    ;(calendarAPI.create as jest.Mock).mockReset()
  })

  it('renders the dropzone and a download-template button', () => {
    render(
      <BulkEventUploadModal isOpen onClose={jest.fn()} onUploaded={jest.fn()} />
    )
    expect(screen.getByText(/Drop a CSV file here/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download template/ })).toBeInTheDocument()
  })

  it('shows row stats and enables the upload button after a valid CSV', async () => {
    render(
      <BulkEventUploadModal isOpen onClose={jest.fn()} onUploaded={jest.fn()} />
    )
    await selectFile(makeCsvFile(`${HEADER_ROW}\n${VALID_TOURNAMENT_ROW}\n`))

    await waitFor(() => {
      expect(screen.getByText('events.csv')).toBeInTheDocument()
    })

    // Stats: 1 total, 1 valid, 0 errors. The total + valid both render "1".
    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThanOrEqual(2)

    const uploadBtn = screen.getByRole('button', { name: /Upload 1 event/ })
    expect(uploadBtn).toBeEnabled()
  })

  it('lists per-row errors and disables the upload button when any row is invalid', async () => {
    render(
      <BulkEventUploadModal isOpen onClose={jest.fn()} onUploaded={jest.fn()} />
    )
    await selectFile(
      makeCsvFile(`${HEADER_ROW}\n${VALID_TOURNAMENT_ROW}\n${INVALID_ROW}\n`)
    )

    await waitFor(() => {
      expect(screen.getByText(/Fix these rows before uploading/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Line 3:/)).toBeInTheDocument()

    // Upload button is disabled while any row has errors. (1 valid + 1 invalid)
    const uploadBtn = screen.getByRole('button', { name: /Upload 1 event/ })
    expect(uploadBtn).toBeDisabled()
  })

  it('shows header errors and never enables upload when columns are missing', async () => {
    render(
      <BulkEventUploadModal isOpen onClose={jest.fn()} onUploaded={jest.fn()} />
    )
    await selectFile(makeCsvFile('Wrong,Headers\nfoo,bar\n'))

    await waitFor(() => {
      expect(screen.getByText(/CSV header is invalid/)).toBeInTheDocument()
    })
    const uploadBtn = screen.getByRole('button', { name: /Upload 0 events/ })
    expect(uploadBtn).toBeDisabled()
  })

  it('uploads each valid row via calendarAPI.create and reports back on success', async () => {
    const onClose = jest.fn()
    const onUploaded = jest.fn()
    ;(calendarAPI.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'a', title: 'Test Bulk' })
      .mockResolvedValueOnce({ id: 'b', title: 'Test Bulk 2' })

    render(
      <BulkEventUploadModal isOpen onClose={onClose} onUploaded={onUploaded} />
    )

    const ROW_TWO = VALID_TOURNAMENT_ROW.replace('Test Bulk', 'Test Bulk 2')
    await selectFile(
      makeCsvFile(`${HEADER_ROW}\n${VALID_TOURNAMENT_ROW}\n${ROW_TWO}\n`)
    )

    const uploadBtn = await screen.findByRole('button', {
      name: /Upload 2 events/,
    })
    await act(async () => {
      fireEvent.click(uploadBtn)
    })

    await waitFor(() => {
      expect(calendarAPI.create).toHaveBeenCalledTimes(2)
    })
    expect(onUploaded).toHaveBeenCalledWith([
      { id: 'a', title: 'Test Bulk' },
      { id: 'b', title: 'Test Bulk 2' },
    ])
    // Modal closes itself on full success.
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the modal open and surfaces failed lines on partial failure', async () => {
    const onClose = jest.fn()
    const onUploaded = jest.fn()
    ;(calendarAPI.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'a' })
      .mockRejectedValueOnce(new Error('boom'))

    render(
      <BulkEventUploadModal isOpen onClose={onClose} onUploaded={onUploaded} />
    )

    const ROW_TWO = VALID_TOURNAMENT_ROW.replace('Test Bulk', 'Test Bulk 2')
    await selectFile(
      makeCsvFile(`${HEADER_ROW}\n${VALID_TOURNAMENT_ROW}\n${ROW_TWO}\n`)
    )

    const uploadBtn = await screen.findByRole('button', {
      name: /Upload 2 events/,
    })
    await act(async () => {
      fireEvent.click(uploadBtn)
    })

    await waitFor(() => {
      expect(screen.getByText('Upload complete')).toBeInTheDocument()
    })
    // The failure for row 3 (line number = data row + 1 header) is rendered.
    expect(screen.getByText(/Line 3:/)).toBeInTheDocument()
    expect(screen.getByText(/boom/)).toBeInTheDocument()
    // Successful row was reported back so the page can update its in-memory list.
    expect(onUploaded).toHaveBeenCalledWith([{ id: 'a' }])
    // But onClose is NOT called: user needs to see what failed.
    expect(onClose).not.toHaveBeenCalled()
  })
})
