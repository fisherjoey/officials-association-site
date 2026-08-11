import { render, screen } from '@testing-library/react'
import CategoryBadge from '@/components/atoms/CategoryBadge'

describe('CategoryBadge Atom', () => {
  describe('Rendering', () => {
    it('should render the category text', () => {
      render(<CategoryBadge category="School League" />)
      expect(screen.getByText('School League')).toBeInTheDocument()
    })

    it('should handle empty category gracefully', () => {
      render(<CategoryBadge category="" />)
      expect(screen.getByText('Uncategorized')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should apply blue colors for School League', () => {
      render(<CategoryBadge category="School League" />)
      const badge = screen.getByText('School League')
      expect(badge).toHaveClass('bg-blue-100')
      expect(badge).toHaveClass('text-blue-800')
    })

    it('should apply purple colors for School Tournament', () => {
      render(<CategoryBadge category="School Tournament" />)
      const badge = screen.getByText('School Tournament')
      expect(badge).toHaveClass('bg-purple-100')
      expect(badge).toHaveClass('text-purple-800')
    })

    it('should apply green colors for Club League', () => {
      render(<CategoryBadge category="Club League" />)
      const badge = screen.getByText('Club League')
      expect(badge).toHaveClass('bg-green-100')
      expect(badge).toHaveClass('text-green-800')
    })

    it('should apply orange colors for Club Tournament', () => {
      render(<CategoryBadge category="Club Tournament" />)
      const badge = screen.getByText('Club Tournament')
      expect(badge).toHaveClass('bg-orange-100')
      expect(badge).toHaveClass('text-orange-800')
    })

    it('should apply yellow colors for Adult', () => {
      render(<CategoryBadge category="Adult" />)
      const badge = screen.getByText('Adult')
      expect(badge).toHaveClass('bg-yellow-100')
      expect(badge).toHaveClass('text-yellow-800')
    })

    it('should apply default gray colors for unknown categories', () => {
      render(<CategoryBadge category="Unknown Category" />)
      const badge = screen.getByText('Unknown Category')
      expect(badge).toHaveClass('bg-gray-100')
      expect(badge).toHaveClass('text-gray-800')
    })
  })

  describe('Accessibility', () => {
    it('should have appropriate ARIA attributes', () => {
      render(<CategoryBadge category="School League" />)
      const badge = screen.getByText('School League')
      expect(badge).toHaveAttribute('aria-label', 'Category: School League')
    })

    it('should have semantic HTML', () => {
      const { container } = render(<CategoryBadge category="School League" />)
      const span = container.querySelector('span')
      expect(span).toBeInTheDocument()
    })
  })

  describe('Props validation', () => {
    it('should handle special characters in category', () => {
      render(<CategoryBadge category="Test & Category!" />)
      expect(screen.getByText('Test & Category!')).toBeInTheDocument()
    })

    it('should trim whitespace from category', () => {
      render(<CategoryBadge category="  School League  " />)
      expect(screen.getByText('School League')).toBeInTheDocument()
    })
  })
})