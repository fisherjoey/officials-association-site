import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

export interface TrainingEvent {
  title: string
  date: string
  startTime: string
  endTime: string
  location: string
  type: 'workshop' | 'certification' | 'refresher' | 'meeting'
  description: string
  registrationLink?: string
  maxParticipants?: number
  currentRegistrations?: number
  instructor?: string
  requirements?: string
  slug: string
}

export function getAllTrainingEvents(): TrainingEvent[] {
  try {
    const trainingDirectory = path.join(process.cwd(), 'content', 'training')
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(trainingDirectory)) {
      fs.mkdirSync(trainingDirectory, { recursive: true })
      return []
    }
    
    const fileNames = fs.readdirSync(trainingDirectory)
    
    const events = fileNames
      .filter(fileName => fileName.endsWith('.md'))
      .map(fileName => {
        const slug = fileName.replace(/\.md$/, '')
        const fullPath = path.join(trainingDirectory, fileName)
        const fileContents = fs.readFileSync(fullPath, 'utf8')
        const { data } = matter(fileContents)
        
        return {
          ...data,
          slug
        } as TrainingEvent
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    return events
  } catch (error) {
    console.error('Error loading training events:', error)
    return []
  }
}

export function getUpcomingTrainingEvents(): TrainingEvent[] {
  const allEvents = getAllTrainingEvents()
  const now = new Date()
  now.setHours(0, 0, 0, 0) // Set to start of day for accurate comparison
  
  return allEvents.filter(event => {
    const eventDate = new Date(event.date)
    eventDate.setHours(0, 0, 0, 0)
    return eventDate >= now
  })
}

export function getTrainingEventsByMonth(year: number, month: number): TrainingEvent[] {
  const allEvents = getAllTrainingEvents()
  
  return allEvents.filter(event => {
    const eventDate = new Date(event.date)
    return eventDate.getFullYear() === year && eventDate.getMonth() === month
  })
}

export function getTrainingEventsByType(type: TrainingEvent['type']): TrainingEvent[] {
  const allEvents = getAllTrainingEvents()
  return allEvents.filter(event => event.type === type)
}