'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { IconSend, IconCheck, IconAlertCircle, IconBulb, IconX, IconShieldCheck, IconMail, IconQuestionMark, IconLink, IconChevronDown, IconPlus, IconTrash } from '@tabler/icons-react'
import { isDeviceFlagged } from '@/lib/deviceFlag'
import { readFriendlyError, friendlyErrorFromThrown, toFriendlyMessage } from '@/lib/userFacingError'
import { CONTACT_CATEGORIES } from '@/lib/siteConfig'

// Pattern detection for suggesting the right form
type FormSuggestion = {
  type: 'booking' | 'become-referee'
  title: string
  description: string
  href: string
  linkText: string
} | null

const BOOKING_PATTERNS = [
  // Direct booking intent
  /\b(need|want|looking for|require|hire|book)\b.*\b(refs?|referees?|officials?|umpires?)\b/i,
  /\b(refs?|referees?|officials?)\b.*\b(for|to|at)\b.*\b(our|my|the|a)\b/i,
  // Event types that need officials
  /\b(tournament|tourney|league|exhibition|scrimmage|game|games|match|matches)\b.*\b(need|refs?|officials?|referees?)\b/i,
  /\b(hosting|organizing|running|have)\b.*\b(tournament|tourney|league|event|games?)\b/i,
  // Scheduling/booking language
  /\b(schedule|scheduling|assign|assignment|cover|coverage)\b.*\b(refs?|officials?|referees?|games?)\b/i,
  /how (do|can) (i|we) (get|book|hire|request)/i,
  /\b(officiating services|officiating request)\b/i,
  // Numbers + games pattern
  /\b\d+\s*(games?|courts?|gyms?)\b/i,
  // Date patterns with events
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b.*\b(tournament|event|games?|league)\b/i,
]

const BECOME_REFEREE_PATTERNS = [
  // Direct intent to become
  /\b(want|like|interested|looking)\b.*\b(to\s+)?(become|be|start|try)\b.*\b(a\s+)?(ref|referee|official|umpire)\b/i,
  /\b(how|where)\b.*\b(do|can|to)\b.*\b(i|we)\b.*\b(become|join|sign up|register|apply|get certified|start)\b/i,
  /\b(become|becoming|join|joining)\b.*\b(a\s+)?(ref|referee|official|association)\b/i,
  // Training/certification
  /\b(training|certification|certified|course|clinic|class)\b.*\b(refs?|referees?|officials?|officiating)\b/i,
  /\b(refs?|referees?|officials?|officiating)\b.*\b(training|certification|course|clinic)\b/i,
  // Membership questions
  /\b(join|membership|member|sign up|register)\b.*\b(association|officials?)\b/i,
  // New official patterns
  /\bnew (to )?officiating\b/i,
  /\b(never|haven't|have not)\b.*\b(officiated|reffed|refereed)\b/i,
  /\bblue whistle\b/i,
  // Requirements
  /\b(what|requirements?|qualifications?|need)\b.*\b(to\s+)?(become|be|start)\b.*\b(ref|referee|official)\b/i,
]

const COMPLAINT_PATTERNS = [
  // Direct complaint language
  /\b(complain|complaint|complaints|complaining)\b/i,
  /\b(file|filing|submit|lodge|make)\b.*\b(a\s+)?(complaint|grievance|formal)\b/i,
  // Dissatisfaction with officials/service
  /\b(terrible|horrible|awful|worst|incompetent|unprofessional|biased|unfair|unacceptable)\b.*\b(ref|referee|official|umpire|call|calls|officiating|game|service)\b/i,
  /\b(ref|referee|official|umpire|officiating)\b.*\b(terrible|horrible|awful|worst|incompetent|unprofessional|biased|unfair|unacceptable)\b/i,
  // Misconduct / report
  /\b(report|reporting)\b.*\b(misconduct|behaviour|behavior|abuse|incident|official|referee)\b/i,
  /\b(misconduct|abuse|inappropriate)\b.*\b(by|from|of)\b.*\b(ref|referee|official|umpire)\b/i,
  // Formal tone
  /\b(grievance|formal complaint|disciplinary|escalate|escalation)\b/i,
  /\b(demand|demanding|insist)\b.*\b(action|response|investigation|review)\b/i,
  // Bad experience
  /\b(bad|poor|negative)\b.*\b(experience|officiating|refereeing|call|calls)\b/i,
  /\b(ruined|rigged|cheated|robbed)\b/i,
  // Threatening or aggressive
  /\b(never\s+again|done\s+with|fed\s+up|sick\s+(of|and\s+tired)|had\s+enough|last\s+straw)\b/i,
  /\b(want|need)\b.*\b(answers?|explanation|accountability)\b/i,
  // Requesting action against someone
  /\b(fire|remove|ban|suspend|discipline)\b.*\b(ref|referee|official|him|her|them|this)\b/i,
]

function detectComplaint(message: string, subject: string): boolean {
  const combined = `${subject} ${message}`
  return COMPLAINT_PATTERNS.some(pattern => pattern.test(combined))
}

function detectFormSuggestion(message: string, subject: string): FormSuggestion {
  const combined = `${subject} ${message}`.toLowerCase()

  // Check for booking patterns
  for (const pattern of BOOKING_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        type: 'booking',
        title: 'Looking to book officials?',
        description: 'Our Officiating Services Request form is the fastest way to book referees for your event.',
        href: '/get-officials',
        linkText: 'Go to Booking Form',
      }
    }
  }

  // Check for become-a-referee patterns
  for (const pattern of BECOME_REFEREE_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        type: 'become-referee',
        title: 'Interested in becoming an official?',
        description: 'Our New Officials application page has everything you need to get started.',
        href: '/become-a-referee',
        linkText: 'Apply to Become an Official',
      }
    }
  }

  return null
}

// Category list, labels and routing addresses all come from lib/siteConfig.ts,
// so a category cannot exist here without a destination there.
const contactCategories = CONTACT_CATEGORIES

type CategoryValue = string
const validCategories: readonly CategoryValue[] = contactCategories.map(c => c.value)

function isValidCategory(value: string | null): value is CategoryValue {
  return value !== null && (validCategories as readonly string[]).includes(value)
}

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  category: z.string().min(1, 'Please select a category'),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(20, 'Message must be at least 20 characters'),
})

const MAX_ATTACHMENTS = 5

type ContactFormData = z.infer<typeof contactSchema>

const inputStyles = "w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-colors"
const labelStyles = "block text-sm font-semibold text-gray-700 mb-2"
const errorStyles = "text-red-500 text-sm mt-1"

export default function ContactForm() {
  const searchParams = useSearchParams()
  const formRef = useRef<HTMLFormElement>(null)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([''])
  const [attachmentErrors, setAttachmentErrors] = useState<string[]>([])
  const [showAttachmentHelp, setShowAttachmentHelp] = useState(false)

  // Email verification state
  const [deviceFlagged, setDeviceFlagged] = useState(false)
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'sending' | 'sent' | 'verified' | 'error'>('idle')
  const [verificationToken, setVerificationToken] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationError, setVerificationError] = useState('')

  // Get category from URL params
  const categoryParam = searchParams.get('category')
  const defaultCategory = isValidCategory(categoryParam) ? categoryParam : ''

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      email: '',
      category: defaultCategory,
      subject: '',
      message: '',
    }
  })

  // Watch message and subject for smart suggestions
  const watchedMessage = watch('message')
  const watchedSubject = watch('subject')
  const watchedEmail = watch('email')

  // Detect if user should use a different form
  const formSuggestion = useMemo(() => {
    if (suggestionDismissed) return null
    if (!watchedMessage || watchedMessage.length < 15) return null
    return detectFormSuggestion(watchedMessage, watchedSubject || '')
  }, [watchedMessage, watchedSubject, suggestionDismissed])

  // Check if device is flagged on mount
  useEffect(() => {
    isDeviceFlagged().then(flagged => {
      setDeviceFlagged(flagged)
      if (flagged) setVerificationRequired(true)
    })
  }, [])

  // Detect complaints — require email verification
  // Once triggered in a session, it sticks (session cookie survives refresh)
  const SESSION_FLAG = '_cf_s'
  const [complaintLatched, setComplaintLatched] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.cookie.split(';').some(c => c.trim().startsWith(`${SESSION_FLAG}=`))
    }
    return false
  })

  const isComplaint = useMemo(() => {
    if (complaintLatched) return true
    if (!watchedMessage || watchedMessage.length < 15) return false
    return detectComplaint(watchedMessage, watchedSubject || '')
  }, [watchedMessage, watchedSubject, complaintLatched])

  // Latch complaint detection: once triggered, set session cookie so it survives refresh/edits
  useEffect(() => {
    if (isComplaint && !complaintLatched) {
      setComplaintLatched(true)
      document.cookie = `${SESSION_FLAG}=1; path=/; SameSite=Lax`
    }
  }, [isComplaint, complaintLatched])

  // Detect links in message body or subject
  const hasLinksInText = useMemo(() => {
    const combined = `${watchedSubject || ''} ${watchedMessage || ''}`
    return /https?:\/\/\S+/i.test(combined)
  }, [watchedMessage, watchedSubject])

  // Check if any attachment URLs are filled in
  const hasAttachments = attachmentUrls.some(u => u.trim() !== '')

  // Update verification requirement when complaint detection, links, or device flag changes
  useEffect(() => {
    if (deviceFlagged || isComplaint || hasLinksInText || hasAttachments) {
      setVerificationRequired(true)
    } else {
      setVerificationRequired(false)
      setVerificationStatus('idle')
      setVerificationToken('')
      setVerificationCode('')
      setVerificationError('')
    }
  }, [isComplaint, deviceFlagged, hasLinksInText, hasAttachments])

  // Scroll to form and set category when URL has category param
  useEffect(() => {
    if (isValidCategory(categoryParam)) {
      setValue('category', categoryParam)
      // Scroll to form after a brief delay to ensure page is loaded
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [categoryParam, setValue])

  const sendVerificationCode = async () => {
    if (!watchedEmail || !watchedEmail.includes('@')) {
      setVerificationError('Please enter your email address first.')
      return
    }

    setVerificationStatus('sending')
    setVerificationError('')

    try {
      const response = await fetch('/.netlify/functions/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: watchedEmail }),
      })

      if (!response.ok) {
        const friendly = await readFriendlyError(response)
        setVerificationStatus('error')
        setVerificationError(friendly.message)
        return
      }

      const result = await response.json()
      setVerificationToken(result.token)
      setVerificationStatus('sent')
    } catch (error) {
      setVerificationStatus('error')
      setVerificationError(friendlyErrorFromThrown(error).message)
    }
  }

  const onSubmit = async (data: ContactFormData) => {
    // If complaint detected, ensure verification is complete
    if (verificationRequired && verificationStatus !== 'verified') {
      setErrorMessage('Please verify your email address before submitting.')
      setSubmitStatus('error')
      return
    }

    // Validate attachment URLs
    const validUrls = attachmentUrls.filter(u => u.trim() !== '')
    const allowedHosts = [
      'youtube.com', 'www.youtube.com', 'youtu.be',
      'vimeo.com', 'www.vimeo.com',
      'drive.google.com', 'docs.google.com',
      'dropbox.com', 'www.dropbox.com', 'dl.dropboxusercontent.com',
      'imgur.com', 'i.imgur.com',
      'onedrive.live.com', '1drv.ms',
    ]
    const newErrors = attachmentUrls.map(u => {
      if (!u.trim()) return ''
      try {
        const parsed = new URL(u)
        if (parsed.protocol !== 'https:') return 'Link must use HTTPS'
        const host = parsed.hostname.toLowerCase()
        if (!allowedHosts.some(a => host === a || host.endsWith('.' + a))) {
          return 'Use a supported service: YouTube, Vimeo, Google Drive, Dropbox, Imgur, or OneDrive'
        }
        return ''
      } catch {
        return 'Please enter a valid URL starting with https://'
      }
    })
    if (newErrors.some(e => e !== '')) {
      setAttachmentErrors(newErrors)
      setSubmitStatus('error')
      setErrorMessage('Please fix the invalid attachment links.')
      return
    }
    setAttachmentErrors([])

    setSubmitStatus('loading')
    setErrorMessage('')

    try {
      const payload: Record<string, unknown> = { ...data }

      // Include attachment URLs
      if (validUrls.length > 0) {
        payload.attachmentUrls = validUrls
      }

      // Include verification data if this is a complaint
      if (verificationRequired) {
        payload.complaintDetected = true
        payload.verificationToken = verificationToken
        payload.verificationCode = verificationCode
      }

      const response = await fetch('/.netlify/functions/contact-form', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let body: { suggestion?: string; error?: string; message?: string; fields?: Record<string, string> } = {}
        try {
          body = await response.json()
        } catch {
          // Non-JSON body — leave empty.
        }
        if (body.suggestion) {
          setValue('email', body.suggestion)
        }
        const friendly = toFriendlyMessage(response, body)
        setSubmitStatus('error')
        setErrorMessage(
          body.suggestion
            ? `${friendly.message} We’ve filled in the corrected address — please review and resubmit.`
            : friendly.message,
        )
        return
      }

      setSubmitStatus('success')
      reset()
      setAttachmentUrls([''])
      setAttachmentsOpen(false)

      // Verification succeeded — clear any device flag so future sessions are trusted
      if (verificationRequired && deviceFlagged) {
        // Device was previously flagged but user verified successfully — no longer needed
        setDeviceFlagged(false)
      }

      // Reset verification state for next submission
      setVerificationStatus('idle')
      setVerificationToken('')
      setVerificationCode('')
    } catch (error) {
      setSubmitStatus('error')
      setErrorMessage(friendlyErrorFromThrown(error).message)
    }
  }

  if (submitStatus === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <IconCheck size={32} className="text-green-600" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-green-800 mb-2">Message Sent!</h3>
        <p className="text-green-700 mb-6">
          Thank you for contacting us. We&apos;ll get back to you as soon as possible.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setSubmitStatus('idle')}
        >
          Send Another Message
        </Button>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {submitStatus === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <IconAlertCircle size={24} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 font-medium">Failed to send message</p>
            <p className="text-red-600 text-sm">{errorMessage}</p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="name" className={labelStyles}>
            Your Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            {...register('name')}
            className={inputStyles}
            placeholder="John Doe"
          />
          {errors.name && <p className={errorStyles}>{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="email" className={labelStyles}>
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            {...register('email')}
            className={inputStyles}
            placeholder="john@example.com"
          />
          {errors.email && <p className={errorStyles}>{errors.email.message}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="category" className={labelStyles}>
          Category <span className="text-red-500">*</span>
        </label>
        <select
          id="category"
          {...register('category')}
          className={inputStyles}
        >
          <option value="">Select a category...</option>
          {contactCategories.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
        {errors.category && <p className={errorStyles}>{errors.category.message}</p>}
      </div>

      <div>
        <label htmlFor="subject" className={labelStyles}>
          Subject <span className="text-red-500">*</span>
        </label>
        <input
          id="subject"
          type="text"
          {...register('subject')}
          className={inputStyles}
          placeholder="What is this regarding?"
        />
        {errors.subject && <p className={errorStyles}>{errors.subject.message}</p>}
      </div>

      <div>
        <label htmlFor="message" className={labelStyles}>
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          {...register('message')}
          rows={6}
          className={inputStyles}
          placeholder="Please provide as much detail as possible..."
        />
        {errors.message && <p className={errorStyles}>{errors.message.message}</p>}

        {/* Smart form suggestion */}
        {formSuggestion && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-4 relative">
            <button
              type="button"
              onClick={() => setSuggestionDismissed(true)}
              className="absolute top-2 right-2 text-amber-400 hover:text-amber-600 transition-colors"
              aria-label="Dismiss suggestion"
            >
              <IconX size={18} />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <IconBulb size={24} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800">{formSuggestion.title}</p>
                <p className="text-amber-700 text-sm mt-1">{formSuggestion.description}</p>
                <Link
                  href={formSuggestion.href}
                  className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-brand-primary hover:text-brand-secondary transition-colors"
                >
                  {formSuggestion.linkText} →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Attachments Accordion */}
      <div className="border border-gray-200 rounded-lg">
        <button
          type="button"
          onClick={() => setAttachmentsOpen(!attachmentsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
        >
          <div className="flex items-center gap-2">
            <IconLink size={18} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Attachments</span>
            <span className="text-xs text-gray-500 font-normal">(optional)</span>
            {attachmentUrls.filter(u => u.trim()).length > 0 && (
              <span className="bg-brand-primary text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                {attachmentUrls.filter(u => u.trim()).length}
              </span>
            )}
          </div>
          <IconChevronDown size={18} className={`text-gray-400 transition-transform ${attachmentsOpen ? 'rotate-180' : ''}`} />
        </button>

        {attachmentsOpen && (
          <div className="p-4 space-y-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Paste links to files, images, or videos.
              </p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAttachmentHelp(!showAttachmentHelp)}
                  className="text-gray-400 hover:text-brand-primary transition-colors"
                  aria-label="Attachment help"
                  title="How to attach files"
                >
                  <IconQuestionMark size={16} />
                </button>
                {showAttachmentHelp && (
                  <>
                  <div className="fixed inset-0 z-[9]" onClick={() => setShowAttachmentHelp(false)} />
                  <div className="absolute right-0 top-7 z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
                    <button
                      type="button"
                      onClick={() => setShowAttachmentHelp(false)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                    >
                      <IconX size={14} />
                    </button>
                    <p className="text-sm text-gray-700 font-medium mb-2">How to attach files</p>
                    <p className="text-xs text-gray-600 mb-3">
                      Upload your file to one of these free services, then paste the link here:
                    </p>
                    <ul className="space-y-1.5 text-xs text-gray-600">
                      <li className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">Videos:</span>
                        YouTube, Vimeo, or Google Drive
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">Images:</span>
                        Google Drive, Dropbox, or Imgur
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">Documents:</span>
                        Google Drive, Dropbox, or OneDrive
                      </li>
                    </ul>
                    <p className="text-[11px] text-gray-400 mt-2">HTTPS links only</p>
                  </div>
                  </>
                )}
              </div>
            </div>

            {attachmentUrls.map((url, index) => (
              <div key={index}>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <IconLink size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => {
                        const updated = [...attachmentUrls]
                        updated[index] = e.target.value
                        setAttachmentUrls(updated)
                      }}
                      className={`${inputStyles} pl-9 py-2.5 text-sm`}
                      placeholder="https://drive.google.com/... or https://youtube.com/..."
                    />
                  </div>
                  {attachmentUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = attachmentUrls.filter((_, i) => i !== index)
                        setAttachmentUrls(updated)
                        setAttachmentErrors(attachmentErrors.filter((_, i) => i !== index))
                      }}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      <IconTrash size={16} />
                    </button>
                  )}
                </div>
                {attachmentErrors[index] && <p className={errorStyles}>{attachmentErrors[index]}</p>}
              </div>
            ))}

            {attachmentUrls.length < MAX_ATTACHMENTS && (
              <button
                type="button"
                onClick={() => setAttachmentUrls([...attachmentUrls, ''])}
                className="flex items-center gap-1.5 text-sm text-brand-primary hover:text-orange-600 font-medium transition-colors"
              >
                <IconPlus size={16} />
                Add another link
              </button>
            )}
          </div>
        )}
      </div>

      {/* Email verification for complaints */}
      {verificationRequired && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
              <IconShieldCheck size={20} className="text-brand-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-brand-secondary">Email Verification Required</p>
              <p className="text-gray-600 text-sm mt-1">
                To ensure we can follow up on your message, please verify your email address.
                We&apos;ll email you a 6-digit code — enter it below to unlock the submit button.
              </p>

              {verificationStatus === 'idle' && (
                <button
                  type="button"
                  onClick={sendVerificationCode}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-brand-primary text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
                >
                  <IconMail size={16} />
                  Email Me a Verification Code
                </button>
              )}

              {verificationStatus === 'sending' && (
                <div className="mt-3 flex items-center gap-2 text-brand-primary text-sm">
                  <span className="animate-spin">&#9696;</span>
                  Sending verification code...
                </div>
              )}

              {verificationStatus === 'sent' && (
                <div className="mt-3 space-y-3">
                  <p className="text-gray-700 text-sm">
                    Code sent to <strong className="text-brand-secondary">{watchedEmail}</strong>
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={async (e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                        setVerificationCode(val)
                        if (val.length === 6) {
                          // Verify with the server before flipping to
                          // 'verified'. Without this, the UI happily
                          // claims any six digits are valid even though
                          // the backend would later reject the submit.
                          try {
                            const res = await fetch('/.netlify/functions/verify-email', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                email: watchedEmail,
                                token: verificationToken,
                                code: val,
                              }),
                            })
                            if (res.ok) {
                              const result = await res.json()
                              if (result.valid) {
                                setVerificationError('')
                                setVerificationStatus('verified')
                                return
                              }
                            }
                            const friendly = await readFriendlyError(res)
                            setVerificationError(friendly.message)
                          } catch (err) {
                            setVerificationError(friendlyErrorFromThrown(err).message)
                          }
                        }
                      }}
                      maxLength={6}
                      placeholder="000000"
                      className="w-40 px-4 py-3 text-center text-xl font-mono tracking-[0.3em] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={sendVerificationCode}
                    className="text-brand-primary hover:text-orange-600 text-xs font-medium transition-colors"
                  >
                    Resend code
                  </button>
                </div>
              )}

              {verificationStatus === 'verified' && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={verificationCode}
                      readOnly
                      className="w-40 px-4 py-3 text-center text-xl font-mono tracking-[0.3em] border border-green-300 bg-green-50 rounded-lg text-green-700"
                    />
                    <div className="flex items-center gap-1.5 text-green-600">
                      <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                        <IconCheck size={14} />
                      </div>
                      <span className="text-sm font-medium">Verified</span>
                    </div>
                  </div>
                </div>
              )}

              {verificationStatus === 'error' && (
                <div className="mt-3">
                  <p className="text-red-600 text-sm">{verificationError}</p>
                  <button
                    type="button"
                    onClick={sendVerificationCode}
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 bg-brand-primary text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
                  >
                    <IconMail size={16} />
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pt-2">
        <Button
          type="submit"
          size="lg"
          className="w-full md:w-auto"
          disabled={submitStatus === 'loading' || (verificationRequired && verificationStatus !== 'verified')}
        >
          {submitStatus === 'loading' ? (
            <>
              <span className="animate-spin mr-2">&#9696;</span>
              Sending...
            </>
          ) : (
            <>
              <IconSend size={20} className="mr-2" />
              Send Message
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
