'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { IconCheck, IconAlertCircle, IconLoader2, IconArrowLeft, IconArrowRight } from '@tabler/icons-react'
import { buildOSAPayload, type OSAFormState } from '@/lib/forms/osaPayload'
import { readFriendlyError, friendlyErrorFromThrown } from '@/lib/userFacingError'

// Import wizard components
import ProgressIndicator from './wizard/ProgressIndicator'
import Step1Organization from './wizard/Step1Organization'
import Step2Billing from './wizard/Step2Billing'
import Step3EventContact from './wizard/Step3EventContact'
import Step4Events from './wizard/Step4Events'
import Step5Review from './wizard/Step5Review'

// ============================================
// Constants
// ============================================

import { PROVINCES } from '@/lib/constants'

const STORAGE_KEY = 'osa-form-draft'

// ============================================
// Validation Schemas
// ============================================

const PHONE_REGEX = /^(\+1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}$/
const POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/i

const phoneSchema = z.string()
  .optional()
  .refine(
    (val) => !val || val.trim() === '' || PHONE_REGEX.test(val.replace(/\s/g, '')),
    { message: 'Please enter a valid phone number' }
  )

const postalCodeSchema = z.string()
  .min(1, 'Postal code is required')
  .refine(
    (val) => POSTAL_CODE_REGEX.test(val.trim()),
    { message: 'Please enter a valid postal code' }
  )

const exhibitionGameSchema = z.object({
  date: z.string()
    .min(1, 'Date is required')
    .refine(
      (val) => {
        if (!val) return true
        const selectedDate = new Date(val)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return selectedDate >= today
      },
      { message: 'Date cannot be in the past' }
    ),
  time: z.string().min(1, 'Time is required'),
  numberOfGames: z.string()
    .min(1, 'Number of games is required')
    .refine(
      (val) => {
        const num = parseInt(val, 10)
        return !isNaN(num) && num >= 1 && num <= 50
      },
      { message: 'Enter a valid number (1-50)' }
    ),
})

const EVENT_TYPES = ['Exhibition Game(s)', 'League', 'Tournament'] as const

// Loose schemas for storing data (no validation - validated in superRefine based on eventType)
const leagueSchemaLoose = z.object({
  leagueName: z.string().optional().default(''),
  leagueStartDate: z.string().optional().default(''),
  leagueEndDate: z.string().optional().default(''),
  leagueDaysOfWeek: z.array(z.string()).optional().default([]),
  leaguePlayerGender: z.array(z.string()).optional().default([]),
  leagueLevelOfPlay: z.array(z.string()).optional().default([]),
})

const tournamentSchemaLoose = z.object({
  tournamentName: z.string().optional().default(''),
  tournamentStartDate: z.string().optional().default(''),
  tournamentEndDate: z.string().optional().default(''),
  tournamentNumberOfGames: z.string().optional().default(''),
  tournamentPlayerGender: z.array(z.string()).optional().default([]),
  tournamentLevelOfPlay: z.array(z.string()).optional().default([]),
})

const exhibitionGameSchemaLoose = z.object({
  date: z.string().optional().default(''),
  time: z.string().optional().default(''),
  numberOfGames: z.string().optional().default('1'),
})

const exhibitionSchemaLoose = z.object({
  exhibitionGameLocation: z.string().optional().default(''),
  exhibitionGames: z.array(exhibitionGameSchemaLoose).optional().default([]),
  exhibitionPlayerGender: z.array(z.string()).optional().default([]),
  exhibitionLevelOfPlay: z.array(z.string()).optional().default([]),
})

const osaFormSchema = z.object({
  organizationName: z.string()
    .min(2, 'Organization name is required (min 2 characters)')
    .max(100, 'Organization name is too long (max 100 characters)'),
  billingContactName: z.string()
    .min(2, 'Billing contact name is required (min 2 characters)')
    .max(100, 'Name is too long (max 100 characters)'),
  billingEmail: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(254, 'Email is too long'),
  billingPhone: phoneSchema,
  billingAddress: z.string()
    .min(5, 'Billing address is required (min 5 characters)')
    .max(200, 'Address is too long (max 200 characters)'),
  billingCity: z.string()
    .min(2, 'City is required (min 2 characters)')
    .max(100, 'City name is too long'),
  billingProvince: z.string().min(1, 'Province is required'),
  billingPostalCode: postalCodeSchema,
  eventContactName: z.string()
    .min(2, 'Event contact name is required (min 2 characters)')
    .max(100, 'Name is too long (max 100 characters)'),
  eventContactEmail: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(254, 'Email is too long'),
  eventContactPhone: phoneSchema,
  // Single event type selection
  eventType: z.enum(EVENT_TYPES, { message: 'Please select an event type' }),
  // Arrays for each event type - use loose schemas so unselected types don't cause validation errors
  leagues: z.array(leagueSchemaLoose).optional(),
  tournaments: z.array(tournamentSchemaLoose).optional(),
  exhibitions: z.array(exhibitionSchemaLoose).optional(),
  disciplinePolicy: z.string().min(1, 'Please select a discipline policy'),
  agreement: z.boolean().refine(val => val === true, 'You must agree to the exclusivity agreement'),
}).superRefine((data, ctx) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Only validate the selected event type
  if (data.eventType === 'League') {
    if (!data.leagues || data.leagues.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one league is required', path: ['leagues'] })
    } else {
      data.leagues.forEach((league, index) => {
        if (!league.leagueName || league.leagueName.trim().length < 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'League name is required (min 2 characters)', path: ['leagues', index, 'leagueName'] })
        }
        if (!league.leagueStartDate) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start date is required', path: ['leagues', index, 'leagueStartDate'] })
        } else {
          const startDate = new Date(league.leagueStartDate)
          if (startDate < today) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start date cannot be in the past', path: ['leagues', index, 'leagueStartDate'] })
          }
        }
        if (!league.leagueEndDate) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date is required', path: ['leagues', index, 'leagueEndDate'] })
        } else if (league.leagueStartDate) {
          const startDate = new Date(league.leagueStartDate)
          const endDate = new Date(league.leagueEndDate)
          if (endDate < startDate) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date must be on or after start date', path: ['leagues', index, 'leagueEndDate'] })
          }
        }
        if (!league.leagueDaysOfWeek || league.leagueDaysOfWeek.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select at least one day', path: ['leagues', index, 'leagueDaysOfWeek'] })
        }
        if (!league.leaguePlayerGender || league.leaguePlayerGender.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select player gender', path: ['leagues', index, 'leaguePlayerGender'] })
        }
        if (!league.leagueLevelOfPlay || league.leagueLevelOfPlay.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select level of play', path: ['leagues', index, 'leagueLevelOfPlay'] })
        } else if (league.leagueLevelOfPlay.some(v => v === 'Other')) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please specify the "Other" level of play', path: ['leagues', index, 'leagueLevelOfPlay'] })
        }
      })
    }
  } else if (data.eventType === 'Tournament') {
    if (!data.tournaments || data.tournaments.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one tournament is required', path: ['tournaments'] })
    } else {
      data.tournaments.forEach((tournament, index) => {
        if (!tournament.tournamentName || tournament.tournamentName.trim().length < 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Tournament name is required (min 2 characters)', path: ['tournaments', index, 'tournamentName'] })
        }
        if (!tournament.tournamentStartDate) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start date is required', path: ['tournaments', index, 'tournamentStartDate'] })
        } else {
          const startDate = new Date(tournament.tournamentStartDate)
          if (startDate < today) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start date cannot be in the past', path: ['tournaments', index, 'tournamentStartDate'] })
          }
        }
        if (!tournament.tournamentEndDate) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date is required', path: ['tournaments', index, 'tournamentEndDate'] })
        } else if (tournament.tournamentStartDate) {
          const startDate = new Date(tournament.tournamentStartDate)
          const endDate = new Date(tournament.tournamentEndDate)
          if (endDate < startDate) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End date must be on or after start date', path: ['tournaments', index, 'tournamentEndDate'] })
          }
        }
        if (!tournament.tournamentNumberOfGames) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Number of games is required', path: ['tournaments', index, 'tournamentNumberOfGames'] })
        } else {
          const num = parseInt(tournament.tournamentNumberOfGames, 10)
          if (isNaN(num) || num < 1 || num > 500) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid number (1-500)', path: ['tournaments', index, 'tournamentNumberOfGames'] })
          }
        }
        if (!tournament.tournamentPlayerGender || tournament.tournamentPlayerGender.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select player gender', path: ['tournaments', index, 'tournamentPlayerGender'] })
        }
        if (!tournament.tournamentLevelOfPlay || tournament.tournamentLevelOfPlay.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select level of play', path: ['tournaments', index, 'tournamentLevelOfPlay'] })
        } else if (tournament.tournamentLevelOfPlay.some(v => v === 'Other')) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please specify the "Other" level of play', path: ['tournaments', index, 'tournamentLevelOfPlay'] })
        }
      })
    }
  } else if (data.eventType === 'Exhibition Game(s)') {
    if (!data.exhibitions || data.exhibitions.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one exhibition is required', path: ['exhibitions'] })
    } else {
      data.exhibitions.forEach((exhibition, index) => {
        if (!exhibition.exhibitionGameLocation || exhibition.exhibitionGameLocation.trim().length < 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Game location is required (min 2 characters)', path: ['exhibitions', index, 'exhibitionGameLocation'] })
        }
        if (!exhibition.exhibitionGames || exhibition.exhibitionGames.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one game is required', path: ['exhibitions', index, 'exhibitionGames'] })
        } else {
          exhibition.exhibitionGames.forEach((game, gameIndex) => {
            if (!game.date) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date is required', path: ['exhibitions', index, 'exhibitionGames', gameIndex, 'date'] })
            } else {
              const selectedDate = new Date(game.date)
              if (selectedDate < today) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date cannot be in the past', path: ['exhibitions', index, 'exhibitionGames', gameIndex, 'date'] })
              }
            }
            if (!game.time) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Time is required', path: ['exhibitions', index, 'exhibitionGames', gameIndex, 'time'] })
            }
            if (!game.numberOfGames) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Number of games is required', path: ['exhibitions', index, 'exhibitionGames', gameIndex, 'numberOfGames'] })
            } else {
              const num = parseInt(game.numberOfGames, 10)
              if (isNaN(num) || num < 1 || num > 50) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid number (1-50)', path: ['exhibitions', index, 'exhibitionGames', gameIndex, 'numberOfGames'] })
              }
            }
          })
        }
        if (!exhibition.exhibitionPlayerGender || exhibition.exhibitionPlayerGender.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select player gender', path: ['exhibitions', index, 'exhibitionPlayerGender'] })
        }
        if (!exhibition.exhibitionLevelOfPlay || exhibition.exhibitionLevelOfPlay.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select level of play', path: ['exhibitions', index, 'exhibitionLevelOfPlay'] })
        } else if (exhibition.exhibitionLevelOfPlay.some(v => v === 'Other')) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please specify the "Other" level of play', path: ['exhibitions', index, 'exhibitionLevelOfPlay'] })
        }
      })
    }
  }
})

type OSAFormData = z.infer<typeof osaFormSchema>

// ============================================
// Field groups for per-step validation
// ============================================

const STEP_FIELDS: Record<number, (keyof OSAFormData)[]> = {
  1: ['organizationName'],
  2: ['billingAddress', 'billingCity', 'billingProvince', 'billingPostalCode', 'billingContactName', 'billingEmail', 'billingPhone'],
  3: ['eventContactName', 'eventContactEmail', 'eventContactPhone'],
  4: ['eventType', 'leagues', 'tournaments', 'exhibitions', 'disciplinePolicy', 'agreement'],
  5: [], // Review step - no validation needed
}

// ============================================
// Default form values
// ============================================

const getDefaultValues = (): OSAFormData => ({
  organizationName: '',
  billingContactName: '',
  billingEmail: '',
  billingPhone: '',
  billingAddress: '',
  billingCity: '',
  billingProvince: 'AB',
  billingPostalCode: '',
  eventContactName: '',
  eventContactEmail: '',
  eventContactPhone: '',
  eventType: undefined as any,
  leagues: [{
    leagueName: '',
    leagueStartDate: '',
    leagueEndDate: '',
    leagueDaysOfWeek: [],
    leaguePlayerGender: [],
    leagueLevelOfPlay: [],
  }],
  tournaments: [{
    tournamentName: '',
    tournamentStartDate: '',
    tournamentEndDate: '',
    tournamentNumberOfGames: '',
    tournamentPlayerGender: [],
    tournamentLevelOfPlay: [],
  }],
  exhibitions: [{
    exhibitionGameLocation: '',
    exhibitionGames: [{ date: '', time: '', numberOfGames: '1' }],
    exhibitionPlayerGender: [],
    exhibitionLevelOfPlay: [],
  }],
  disciplinePolicy: '',
  agreement: false,
})

// ============================================
// Main Wizard Component
// ============================================

export default function OSARequestFormWizard() {
  const router = useRouter()
  const formRef = useRef<HTMLDivElement>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [highestStepReached, setHighestStepReached] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    control,
    trigger,
    getValues,
    reset,
    setValue,
    formState: { errors }
  } = useForm<OSAFormData>({
    resolver: zodResolver(osaFormSchema) as any,
    defaultValues: getDefaultValues(),
    mode: 'onTouched',
  })

  const eventType = watch('eventType')
  const leagues = watch('leagues')
  const tournaments = watch('tournaments')
  const exhibitions = watch('exhibitions')

  // Calculate event count based on selected type
  const getEventCount = () => {
    if (eventType === 'League') return leagues?.length || 0
    if (eventType === 'Tournament') return tournaments?.length || 0
    if (eventType === 'Exhibition Game(s)') return exhibitions?.length || 0
    return 0
  }
  const eventCount = getEventCount()

  // ============================================
  // localStorage persistence
  // ============================================

  // Load saved form data on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.formData) {
          reset(parsed.formData)
        }
        if (parsed.currentStep) {
          setCurrentStep(parsed.currentStep)
        }
        if (parsed.highestStepReached) {
          setHighestStepReached(parsed.highestStepReached)
        }
      }
    } catch (e) {
      console.error('Failed to load saved form data:', e)
    }
    setIsHydrated(true)
  }, [reset])

  // Save form data on changes
  const saveToStorage = useCallback(() => {
    if (!isHydrated) return
    try {
      const data = {
        formData: getValues(),
        currentStep,
        highestStepReached,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save form data:', e)
    }
  }, [getValues, currentStep, highestStepReached, isHydrated])

  // Auto-save on step change and form changes
  useEffect(() => {
    if (isHydrated) {
      saveToStorage()
    }
  }, [currentStep, saveToStorage, isHydrated])

  // Save form data periodically (every 5 seconds while typing)
  useEffect(() => {
    if (!isHydrated) return
    const interval = setInterval(saveToStorage, 5000)
    return () => clearInterval(interval)
  }, [saveToStorage, isHydrated])

  // Clear storage on successful submit
  const clearStorage = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.error('Failed to clear storage:', e)
    }
  }

  // ============================================
  // Navigation handlers
  // ============================================

  const scrollToForm = () => {
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const goToStep = (step: number) => {
    if (step >= 1 && step <= 5) {
      setCurrentStep(step)
      scrollToForm()
    }
  }

  const handleNext = async () => {
    // Validate current step fields
    const fieldsToValidate = STEP_FIELDS[currentStep]
    const isValid = await trigger(fieldsToValidate)

    if (isValid) {
      const nextStep = Math.min(currentStep + 1, 5)
      setCurrentStep(nextStep)
      setHighestStepReached(prev => Math.max(prev, nextStep))
      saveToStorage()
      scrollToForm()
    }
  }

  const handleBack = () => {
    saveToStorage()
    setCurrentStep(prev => Math.max(prev - 1, 1))
    scrollToForm()
  }

  // ============================================
  // Form submission
  // ============================================

  const onSubmit = async (data: OSAFormData) => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const payload = buildOSAPayload(data as OSAFormState)

      const response = await fetch('/.netlify/functions/osa-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const friendly = await readFriendlyError(response)
        setSubmitError(friendly.message)
        setIsSubmitting(false)
        // Jump to review step so the user sees the banner
        if (currentStep !== 5) setCurrentStep(5)
        return
      }

      clearStorage()
      router.push('/get-officials/success')
    } catch (error) {
      console.error('Form submission error:', error)
      setSubmitError(friendlyErrorFromThrown(error).message)
      if (currentStep !== 5) setCurrentStep(5)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ============================================
  // Render
  // ============================================

  // Don't render until hydrated to avoid mismatch
  if (!isHydrated) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <IconLoader2 className="animate-spin text-brand-primary" size={32} />
        </div>
      </Card>
    )
  }

  return (
    <div ref={formRef}>
    <Card>
      <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
        {/* Progress Indicator */}
        <ProgressIndicator
          currentStep={currentStep}
          highestStepReached={highestStepReached}
          onStepClick={(step) => {
            // Allow clicking on any step we've visited
            if (step <= highestStepReached) {
              goToStep(step)
            }
          }}
        />

        {/* Step Content */}
        <div className="min-h-[400px]">
          {currentStep === 1 && (
            <Step1Organization
              register={register}
              errors={errors}
            />
          )}

          {currentStep === 2 && (
            <Step2Billing
              register={register}
              control={control}
              errors={errors}
            />
          )}

          {currentStep === 3 && (
            <Step3EventContact
              register={register}
              control={control}
              errors={errors}
            />
          )}

          {currentStep === 4 && (
            <Step4Events
              register={register}
              control={control}
              errors={errors}
              watch={watch}
              setValue={setValue}
            />
          )}

          {currentStep === 5 && (
            <Step5Review
              watch={watch}
              onEditStep={goToStep}
              eventCount={eventCount}
            />
          )}
        </div>

        {/* Submit Error */}
        {submitError && currentStep === 5 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
            <IconAlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-red-700">Submission Error</p>
              <p className="text-red-600 text-sm">{submitError}</p>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
          {/* Back Button */}
          {currentStep > 1 && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              className="sm:order-1"
            >
              <IconArrowLeft size={18} className="mr-2" />
              Back
            </Button>
          )}

          {/* Spacer for desktop */}
          {currentStep > 1 && <div className="hidden sm:block flex-1 sm:order-2" />}

          {/* Next/Submit Button */}
          {currentStep < 5 ? (
            <Button
              type="button"
              onClick={handleNext}
              className="sm:order-3 sm:ml-auto"
            >
              Next
              <IconArrowRight size={18} className="ml-2" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              className="sm:order-3 sm:ml-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <IconLoader2 className="animate-spin mr-2" size={20} />
                  Submitting...
                </>
              ) : (
                <>
                  <IconCheck className="mr-2" size={20} />
                  Submit {eventCount} {eventCount === 1 ? 'Event' : 'Events'}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Privacy Notice */}
        <p className="text-xs text-gray-500 text-center">
          Your information will be used to process your officiating services request and will be stored securely.
          <a href="/contact?category=scheduling" className="text-brand-primary hover:text-brand-secondary"> Contact us</a> with any questions.
        </p>
      </form>
    </Card>
    </div>
  )
}
