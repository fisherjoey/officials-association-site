import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import TextInput from '@/components/atoms/TextInput'
import SelectInput from '@/components/atoms/SelectInput'
import { RuleModification } from '@/lib/adapters/types'
import { ruleModificationSchema, RULE_CATEGORIES, type RuleModificationFormData } from '@/lib/schemas'

interface EditFormProps {
  rule?: Partial<RuleModification>
  onSubmit: (data: Partial<RuleModification>) => void
  onCancel: () => void
  isCreating?: boolean
}

export default function EditForm({
  rule = {},
  onSubmit,
  onCancel,
  isCreating = false,
}: EditFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<RuleModificationFormData>({
    resolver: zodResolver(ruleModificationSchema),
    defaultValues: {
      title: rule.title || '',
      category: rule.category as RuleModificationFormData['category'] || undefined,
      summary: rule.summary || '',
      content: rule.content || '',
      date: rule.date || new Date().toISOString().split('T')[0],
    },
  })

  const categoryOptions = RULE_CATEGORIES.map(cat => ({ value: cat, label: cat }))

  const onFormSubmit = (data: RuleModificationFormData) => {
    onSubmit(data)
  }

  // Watch values for controlled components
  const categoryValue = watch('category')

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <TextInput
        label="Title"
        {...register('title')}
        error={errors.title?.message}
        required
      />

      <SelectInput
        label="Category"
        value={categoryValue || ''}
        onChange={(value) => setValue('category', value as RuleModificationFormData['category'])}
        options={categoryOptions}
        error={errors.category?.message}
        required
      />

      <TextInput
        label="Summary"
        {...register('summary')}
        error={errors.summary?.message}
        required
      />

      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
          Content <span className="text-red-500">*</span>
        </label>
        <textarea
          id="content"
          {...register('content')}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.content ? 'border-red-500' : 'border-gray-300'
          }`}
          rows={10}
        />
        {errors.content && (
          <p className="mt-1 text-sm text-red-600">{errors.content.message}</p>
        )}
      </div>

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          {isCreating ? 'Create' : 'Save'}
        </button>
      </div>
    </form>
  )
}
