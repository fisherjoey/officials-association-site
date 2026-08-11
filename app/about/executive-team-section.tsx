'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Card from '@/components/ui/Card'
import { executiveTeamAPI } from '@/lib/api'
import type { ExecutiveMember } from '@/types/publicContent'

export default function ExecutiveTeamSection() {
  const [executiveTeam, setExecutiveTeam] = useState<ExecutiveMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadExecutiveTeam = async () => {
      try {
        const data = await executiveTeamAPI.getActive()
        setExecutiveTeam(data)
      } catch (err) {
        console.error('Failed to load executive team:', err)
        setError('Failed to load executive team')
      } finally {
        setIsLoading(false)
      }
    }

    loadExecutiveTeam()
  }, [])

  if (isLoading) {
    return (
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-brand-secondary mb-12 text-center">Executive Team</h2>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
          </div>
        </div>
      </section>
    )
  }

  if (error || executiveTeam.length === 0) {
    return null // Don't show section if no data
  }

  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-brand-secondary mb-12 text-center">Executive Team</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {executiveTeam.map((member) => (
            <Card key={member.id}>
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4 relative rounded-full overflow-hidden bg-gray-100 border-2 border-gray-300">
                  <div className="absolute inset-0 flex items-end justify-center">
                    <Image
                      src={member.image_url || "/images/executive-placeholder.svg"}
                      alt={`${member.name} - ${member.position}`}
                      width={120}
                      height={120}
                      className="object-cover translate-y-2"
                    />
                  </div>
                </div>
                <h3 className="font-bold text-lg text-brand-secondary">{member.name}</h3>
                <p className="text-brand-primary font-medium mb-2">{member.position}</p>
                <a href={`mailto:${member.email}`} className="text-sm text-gray-600 hover:text-brand-secondary transition-colors">
                  {member.email}
                </a>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
