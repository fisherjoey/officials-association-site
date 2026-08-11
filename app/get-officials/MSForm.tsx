'use client'

interface MSFormProps {
  formUrl: string
  title?: string
  height?: string
}

export default function MSForm({
  formUrl,
  title = "Official Request Form",
  height = "800px"
}: MSFormProps) {
  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-brand-secondary mb-4">{title}</h2>
      <div className="bg-white rounded-lg shadow-lg p-4">
        <iframe
          src={formUrl}
          width="100%"
          height={height}
          frameBorder="0"
          marginHeight={0}
          marginWidth={0}
          className="w-full"
        >
          Loading…
        </iframe>
      </div>
      <div className="mt-4 text-sm text-gray-600">
        <p>
          This form is powered by Microsoft Forms and responses are automatically saved to Excel.
        </p>
      </div>
    </div>
  )
}