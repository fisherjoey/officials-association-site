import { render, screen } from '@testing-library/react'
import DateDisplay from '@/components/atoms/DateDisplay'

describe('DateDisplay Atom', () => {
  // Mock current date for consistent testing
  const mockDate = new Date('2024-01-15T12:00:00Z')

  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(mockDate)
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  describe('Date Formatting', () => {
    it('should display date in default format', () => {
      render(<DateDisplay date="2024-01-10" />)
      expect(screen.getByText('January 10, 2024')).toBeInTheDocument()
    })

    it('should handle ISO date strings', () => {
      render(<DateDisplay date="2024-01-10T15:30:00Z" />)
      expect(screen.getByText('January 10, 2024')).toBeInTheDocument()
    })

    it('should handle Date objects', () => {
      render(<DateDisplay date={new Date('2024-01-10T00:00:00')} />)
      expect(screen.getByText('January 10, 2024')).toBeInTheDocument()
    })

    it('should display custom format when specified', () => {
      render(<DateDisplay date="2024-01-10" format="short" />)
      expect(screen.getByText('Jan 10, 2024')).toBeInTheDocument()
    })

    it('should display year only format', () => {
      render(<DateDisplay date="2024-01-10" format="year" />)
      expect(screen.getByText('2024')).toBeInTheDocument()
    })
  })

  describe('Relative Time', () => {
    it('should show "Today" for current date', () => {
      render(<DateDisplay date="2024-01-15" showRelative />)
      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    it('should show "Yesterday" for previous day', () => {
      render(<DateDisplay date="2024-01-14" showRelative />)
      expect(screen.getByText('Yesterday')).toBeInTheDocument()
    })

    it('should show "Tomorrow" for next day', () => {
      render(<DateDisplay date="2024-01-16" showRelative />)
      expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    })

    it('should show days ago for recent past dates', () => {
      render(<DateDisplay date="2024-01-10" showRelative />)
      expect(screen.getByText('5 days ago')).toBeInTheDocument()
    })

    it('should show days from now for future dates', () => {
      render(<DateDisplay date="2024-01-20" showRelative />)
      expect(screen.getByText('in 5 days')).toBeInTheDocument()
    })

    it('should fall back to full date for dates over 30 days', () => {
      render(<DateDisplay date="2023-12-01" showRelative />)
      expect(screen.getByText('December 1, 2023')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid date strings gracefully', () => {
      render(<DateDisplay date="invalid-date" />)
      expect(screen.getByText('Invalid date')).toBeInTheDocument()
    })

    it('should handle null dates', () => {
      render(<DateDisplay date={null as any} />)
      expect(screen.getByText('No date')).toBeInTheDocument()
    })

    it('should handle undefined dates', () => {
      render(<DateDisplay date={undefined as any} />)
      expect(screen.getByText('No date')).toBeInTheDocument()
    })

    it('should handle empty string dates', () => {
      render(<DateDisplay date="" />)
      expect(screen.getByText('No date')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<DateDisplay date="2024-01-10" className="text-blue-500" />)
      expect(screen.getByText('January 10, 2024')).toHaveClass('text-blue-500')
    })

    it('should have default styling', () => {
      render(<DateDisplay date="2024-01-10" />)
      expect(screen.getByText('January 10, 2024')).toHaveClass('text-gray-600')
    })

    it('should show icon when specified', () => {
      render(<DateDisplay date="2024-01-10" showIcon />)
      const icon = screen.getByTestId('calendar-icon')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper datetime attribute', () => {
      render(<DateDisplay date="2024-01-10" />)
      const timeElement = screen.getByText('January 10, 2024').closest('time')
      expect(timeElement).toHaveAttribute('dateTime', '2024-01-10')
    })

    it('should have aria-label for screen readers', () => {
      render(<DateDisplay date="2024-01-10" />)
      const timeElement = screen.getByText('January 10, 2024').closest('time')
      expect(timeElement).toHaveAttribute('aria-label', 'Date: January 10, 2024')
    })

    it('should indicate relative time in aria-label', () => {
      render(<DateDisplay date="2024-01-15" showRelative />)
      const timeElement = screen.getByText('Today').closest('time')
      expect(timeElement).toHaveAttribute('aria-label', 'Date: Today (January 15, 2024)')
    })
  })
})