'use client'

interface GoogleFormProps {
  formUrl: string
  title?: string
  height?: string
}

export default function GoogleForm({
  formUrl,
  title = "Official Request Form",
  height = "1000px"
}: GoogleFormProps) {
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
          Please fill out the form above to request officials for your event.
          We'll respond within 24-48 hours.
        </p>
      </div>
    </div>
  )
}