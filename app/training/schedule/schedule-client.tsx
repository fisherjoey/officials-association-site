'use client'

import { useState } from 'react'
import Hero from '@/components/content/Hero'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ContentItem } from '@/lib/content'

interface ScheduleClientProps {
  trainingEvents: ContentItem[]
}

export default function ScheduleClient({ trainingEvents }: ScheduleClientProps) {
  const [filterType, setFilterType] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  
  // Sort events by date
  const sortedEvents = [...trainingEvents].sort((a, b) => {
    const dateA = new Date(a.date || '')
    const dateB = new Date(b.date || '')
    return dateA.getTime() - dateB.getTime()
  })
  
  // Filter out past events and apply type filter
  const currentDate = new Date()
  currentDate.setHours(0, 0, 0, 0)
  
  const upcomingEvents = sortedEvents.filter(event => {
    const eventDate = new Date(event.date || '')
    const isUpcoming = eventDate >= currentDate
    const matchesFilter = filterType === 'all' || event.type === filterType
    return isUpcoming && matchesFilter
  })
  
  const eventTypes = ['all', 'workshop', 'certification', 'refresher', 'meeting']
  
  const getEventTypeColor = (type: string) => {
    switch(type) {
      case 'workshop': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'certification': return 'bg-green-100 text-green-800 border-green-300'
      case 'refresher': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'meeting': return 'bg-purple-100 text-purple-800 border-purple-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }
  
  const getEventTypeIcon = (type: string) => {
    switch(type) {
      case 'workshop': return '🎓'
      case 'certification': return '📜'
      case 'refresher': return '🔄'
      case 'meeting': return '👥'
      default: return '📅'
    }
  }
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }
  
  const getAvailabilityStatus = (event: ContentItem) => {
    const max = event.maxParticipants || 0
    const current = event.currentRegistrations || 0
    
    if (max === 0) return { text: 'Open', color: 'bg-green-100 text-green-800' }
    
    const spotsLeft = max - current
    if (spotsLeft <= 0) return { text: 'Full', color: 'bg-red-100 text-red-800' }
    if (spotsLeft <= 5) return { text: `${spotsLeft} spots left`, color: 'bg-yellow-100 text-yellow-800' }
    return { text: `${spotsLeft} spots available`, color: 'bg-green-100 text-green-800' }
  }
  
  // Group events by month for better organization
  const eventsByMonth: { [key: string]: ContentItem[] } = {}
  upcomingEvents.forEach(event => {
    const date = new Date(event.date || '')
    const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!eventsByMonth[monthYear]) {
      eventsByMonth[monthYear] = []
    }
    eventsByMonth[monthYear].push(event)
  })
  
  return (
    <>
      <Hero
        title="Training Schedule"
        subtitle="Upcoming training events and certification sessions"
      />
      
      <section className="py-16">
        <div className="container mx-auto px-4">
          {/* Filters and View Toggle */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex flex-wrap gap-2">
                {eventTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-4 py-2 rounded-full capitalize transition-all ${
                      filterType === type
                        ? 'bg-brand-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {type === 'all' ? 'All Events' : type}
                  </button>
                ))}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    viewMode === 'list'
                      ? 'bg-brand-secondary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📋 List View
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    viewMode === 'calendar'
                      ? 'bg-brand-secondary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  📅 Calendar View
                </button>
              </div>
            </div>
          </div>
          
          {/* Events Display */}
          {upcomingEvents.length > 0 ? (
            viewMode === 'list' ? (
              <div className="space-y-8">
                {Object.entries(eventsByMonth).map(([month, events]) => (
                  <div key={month}>
                    <h2 className="text-2xl font-bold text-brand-secondary mb-4 pb-2 border-b-2 border-gray-200">
                      {month}
                    </h2>
                    <div className="space-y-4">
                      {events.map((event, index) => {
                        const availability = getAvailabilityStatus(event)
                        return (
                          <Card key={event.slug || index}>
                            <div className="flex flex-col lg:flex-row gap-6">
                              <div className="flex-shrink-0">
                                <div className="text-center">
                                  <div className="text-3xl mb-2">{getEventTypeIcon(event.type || '')}</div>
                                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getEventTypeColor(event.type || '')}`}>
                                    {event.type}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
                                  <h3 className="text-xl font-bold text-brand-secondary">
                                    {event.title}
                                  </h3>
                                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${availability.color}`}>
                                    {availability.text}
                                  </span>
                                </div>
                                
                                <div className="space-y-2 text-gray-700 mb-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-brand-primary">📅</span>
                                    <span>{formatDate(event.date || '')}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-brand-primary">⏰</span>
                                    <span>{event.startTime} - {event.endTime}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-brand-primary">📍</span>
                                    <span>{event.location}</span>
                                  </div>
                                  {event.instructor && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-brand-primary">👤</span>
                                      <span>Instructor: {event.instructor}</span>
                                    </div>
                                  )}
                                </div>
                                
                                <p className="text-gray-700 mb-4">{event.description}</p>
                                
                                {event.requirements && (
                                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                    <p className="text-sm font-semibold text-gray-700 mb-1">Requirements:</p>
                                    <p className="text-sm text-gray-600">{event.requirements}</p>
                                  </div>
                                )}
                                
                                {event.registrationLink && (
                                  <div className="flex justify-end">
                                    <Button 
                                      href={event.registrationLink}
                                      size="sm"
                                    >
                                      Register Now
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Calendar View
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="grid grid-cols-7 gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center font-semibold text-gray-700 py-2">
                      {day}
                    </div>
                  ))}
                  {/* Simple calendar grid - would need more complex logic for full implementation */}
                  <div className="col-span-7 text-center py-8 text-gray-500">
                    Calendar view coming soon...
                  </div>
                </div>
              </div>
            )
          ) : (
            <Card>
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📅</div>
                <h3 className="text-xl font-bold text-gray-700 mb-2">
                  No Upcoming Training Events
                </h3>
                <p className="text-gray-500 mb-6">
                  {trainingEvents.length === 0 
                    ? 'No training events have been scheduled yet. Check back soon!'
                    : 'All scheduled events have passed. New events will be posted soon.'}
                </p>
                <Button href="/become-a-referee">
                  Join Our Mailing List
                </Button>
              </div>
            </Card>
          )}
          
          {/* Info Section */}
          <div className="mt-12 grid md:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-lg font-bold text-brand-secondary mb-3">
                Registration Information
              </h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start">
                  <span className="text-brand-primary mr-2">•</span>
                  <span>Pre-registration is required for all training events</span>
                </li>
                <li className="flex items-start">
                  <span className="text-brand-primary mr-2">•</span>
                  <span>Events may have prerequisites - check requirements carefully</span>
                </li>
                <li className="flex items-start">
                  <span className="text-brand-primary mr-2">•</span>
                  <span>Cancellation policy: 48 hours notice required for refund</span>
                </li>
                <li className="flex items-start">
                  <span className="text-brand-primary mr-2">•</span>
                  <span>Members receive priority registration and discounted rates</span>
                </li>
              </ul>
            </Card>
            
            <Card>
              <h3 className="text-lg font-bold text-brand-secondary mb-3">
                Need Help?
              </h3>
              <p className="text-gray-700 mb-3">
                Questions about training events or registration?
              </p>
              <div className="space-y-2 text-sm">
                <p className="text-gray-700">
                  <a href="/contact?category=education" className="text-brand-primary hover:underline">
                    Contact our education team
                  </a>{' '}
                  for questions about training events or registration.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </>
  )
}