import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextInput from '@/components/atoms/TextInput'

describe('TextInput Atom', () => {
  describe('Rendering', () => {
    it('should render with a label', () => {
      render(<TextInput label="Title" value="" onChange={() => {}} />)
      expect(screen.getByText('Title')).toBeInTheDocument()
    })

    it('should render without a label when not provided', () => {
      render(<TextInput value="" onChange={() => {}} />)
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
    })

    it('should display the current value', () => {
      render(<TextInput label="Title" value="Test Value" onChange={() => {}} />)
      expect(screen.getByDisplayValue('Test Value')).toBeInTheDocument()
    })

    it('should render placeholder text', () => {
      render(
        <TextInput
          label="Title"
          value=""
          onChange={() => {}}
          placeholder="Enter title..."
        />
      )
      expect(screen.getByPlaceholderText('Enter title...')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should call onChange when user types', () => {
      const handleChange = jest.fn()

      render(<TextInput label="Title" onChange={handleChange} />)
      const input = screen.getByRole('textbox')

      fireEvent.change(input, { target: { value: 'New' } })

      expect(handleChange).toHaveBeenCalledTimes(1)
      expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ target: input }))
    })

    it('should handle paste events', () => {
      const handleChange = jest.fn()

      render(<TextInput label="Title" onChange={handleChange} />)
      const input = screen.getByRole('textbox')

      fireEvent.change(input, { target: { value: 'Pasted Text' } })

      expect(handleChange).toHaveBeenCalledTimes(1)
    })

    it('should not call onChange when disabled', async () => {
      const handleChange = jest.fn()
      const user = userEvent.setup()

      render(
        <TextInput
          label="Title"
          value=""
          onChange={handleChange}
          disabled
        />
      )
      const input = screen.getByRole('textbox')

      await user.type(input, 'Test')

      expect(handleChange).not.toHaveBeenCalled()
    })
  })

  describe('States', () => {
    it('should show error state with error message', () => {
      render(
        <TextInput
          label="Title"
          value=""
          onChange={() => {}}
          error="This field is required"
        />
      )

      expect(screen.getByText('This field is required')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveClass('border-red-500')
    })

    it('should show disabled state', () => {
      render(
        <TextInput
          label="Title"
          value="Test"
          onChange={() => {}}
          disabled
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
      expect(input).toHaveClass('bg-gray-50')
    })

    it('should show required indicator', () => {
      render(
        <TextInput
          label="Title"
          value=""
          onChange={() => {}}
          required
        />
      )

      expect(screen.getByText('*')).toBeInTheDocument()
      expect(screen.getByText('*')).toHaveClass('text-red-500')
    })
  })

  describe('Accessibility', () => {
    it('should have proper aria-label', () => {
      render(
        <TextInput
          label="Title"
          value=""
          onChange={() => {}}
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-label', 'Title')
    })

    it('should have aria-invalid when error', () => {
      render(
        <TextInput
          label="Title"
          value=""
          onChange={() => {}}
          error="Invalid input"
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-invalid', 'true')
    })

    it('should have aria-required when required', () => {
      render(
        <TextInput
          label="Title"
          value=""
          onChange={() => {}}
          required
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-required', 'true')
    })

    it('should have aria-describedby for error message', () => {
      render(
        <TextInput
          label="Title"
          value=""
          onChange={() => {}}
          error="Error message"
        />
      )

      const input = screen.getByRole('textbox')
      const errorId = input.getAttribute('aria-describedby')
      expect(errorId).toBeTruthy()

      const errorElement = document.getElementById(errorId!)
      expect(errorElement).toHaveTextContent('Error message')
    })
  })

  describe('Input Types', () => {
    it('should support email type', () => {
      render(
        <TextInput
          label="Email"
          value=""
          onChange={() => {}}
          type="email"
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')
    })

    it('should support password type', () => {
      render(
        <TextInput
          label="Password"
          value=""
          onChange={() => {}}
          type="password"
        />
      )

      const input = screen.getByLabelText('Password')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('should support number type', () => {
      render(
        <TextInput
          label="Age"
          value=""
          onChange={() => {}}
          type="number"
        />
      )

      const input = screen.getByRole('spinbutton')
      expect(input).toHaveAttribute('type', 'number')
    })
  })
})