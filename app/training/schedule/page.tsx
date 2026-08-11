import { getAllContent } from '@/lib/content'
import ScheduleClient from './schedule-client'

export default function TrainingSchedulePage() {
  const trainingEvents = getAllContent('training')
  
  return <ScheduleClient trainingEvents={trainingEvents} />
}