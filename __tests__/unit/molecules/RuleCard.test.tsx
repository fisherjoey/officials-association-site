import { render, screen, fireEvent } from '@testing-library/react'
import RuleCard from '@/components/molecules/RuleCard'
import { RuleModification } from '@/lib/adapters/types'

describe('RuleCard Molecule', () => {
  const mockRule: RuleModification = {
    id: 'test-id',
    slug: 'test-rule',
    title: 'Test Rule Title',
    category: 'School League',
    summary: 'This is a test summary for the rule card component that should be displayed',
    content: 'Full content here',
    date: '2024-01-15',
  }

  describe('Rendering', () => {
    it('should render rule title', () => {
      render(<RuleCard rule={mockRule} />)
      expect(screen.getByText('Test Rule Title')).toBeInTheDocument()
    })

    it('should render category badge', () => {
      render(<RuleCard rule={mockRule} />)
      expect(screen.getByText('School League')).toBeInTheDocument()
    })

    it('should render date', () => {
      render(<RuleCard rule={mockRule} />)
      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument()
    })

    it('should render summary', () => {
      render(<RuleCard rule={mockRule} />)
      expect(screen.getByText(/This is a test summary/)).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('should call onClick when card is clicked', () => {
      const handleClick = jest.fn()
      render(<RuleCard rule={mockRule} onClick={handleClick} />)
      
      const card = screen.getByRole('article')
      fireEvent.click(card)
      
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('should show action buttons when showActions is true', () => {
      const handleEdit = jest.fn()
      const handleDelete = jest.fn()
      
      render(
        <RuleCard
          rule={mockRule}
          showActions
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )
      
      expect(screen.getByLabelText(`Edit ${mockRule.title}`)).toBeInTheDocument()
      expect(screen.getByLabelText(`Delete ${mockRule.title}`)).toBeInTheDocument()
    })

    it('should call onEdit when edit button is clicked', () => {
      const handleEdit = jest.fn()
      const handleClick = jest.fn()
      
      render(
        <RuleCard
          rule={mockRule}
          showActions
          onEdit={handleEdit}
          onClick={handleClick}
        />
      )
      
      const editButton = screen.getByLabelText(`Edit ${mockRule.title}`)
      fireEvent.click(editButton)
      
      expect(handleEdit).toHaveBeenCalledTimes(1)
      expect(handleClick).not.toHaveBeenCalled() // Should stop propagation
    })

    it('should call onDelete when delete button is clicked', () => {
      const handleDelete = jest.fn()
      const handleClick = jest.fn()
      
      render(
        <RuleCard
          rule={mockRule}
          showActions
          onDelete={handleDelete}
          onClick={handleClick}
        />
      )
      
      const deleteButton = screen.getByLabelText(`Delete ${mockRule.title}`)
      fireEvent.click(deleteButton)
      
      expect(handleDelete).toHaveBeenCalledTimes(1)
      expect(handleClick).not.toHaveBeenCalled() // Should stop propagation
    })
  })

  describe('Accessibility', () => {
    it('should have proper aria-label for the card', () => {
      render(<RuleCard rule={mockRule} />)
      
      const card = screen.getByRole('article')
      expect(card).toHaveAttribute('aria-label', `Rule: ${mockRule.title}`)
    })

    it('should have proper aria-labels for action buttons', () => {
      render(
        <RuleCard
          rule={mockRule}
          showActions
          onEdit={() => {}}
          onDelete={() => {}}
        />
      )
      
      expect(screen.getByLabelText(`Edit ${mockRule.title}`)).toBeInTheDocument()
      expect(screen.getByLabelText(`Delete ${mockRule.title}`)).toBeInTheDocument()
    })
  })
})