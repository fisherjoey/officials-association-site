import { Handler, HandlerEvent } from '@netlify/functions'
import { generateEmailTemplate } from '../../lib/emailTemplate'
import { checkEmailConfiguration, sendEmail as sendTransactionalEmail } from '../../lib/email'
import { Logger } from '../../lib/logger'
import { supabase, errorResponse } from './_shared/handler'
import { checkRateLimit, getClientIp } from './_shared/rateLimit'
import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import {
  ORG_NAME,
  ORG_SHORT_NAME,
  EMAIL_SCHEDULER,
  EMAIL_TREASURER,
  SITE_URL,
  getContactUrl,
} from '../../lib/siteConfig'

/**
 * OSA (Officiating Services Agreement) Form Webhook
 *
 * Receives form submissions and sends branded emails
 * to the client, scheduler, treasurer, and optionally president.
 *
 * Now supports multi-event submissions where each event creates
 * a separate database row but shares org/billing/contact info.
 */

// Exhibition game entry
interface ExhibitionGame {
  date: string
  time: string
  numberOfGames: string
}

// Single event data
interface EventData {
  eventIndex: number
  eventType: string // "Exhibition Game(s)" | "League" | "Tournament"

  // League fields
  leagueName?: string
  leagueStartDate?: string
  leagueEndDate?: string
  leagueDaysOfWeek?: string
  leaguePlayerGender?: string
  leagueLevelOfPlay?: string

  // Exhibition fields
  exhibitionGameLocation?: string
  exhibitionGames?: ExhibitionGame[]
  exhibitionPlayerGender?: string
  exhibitionLevelOfPlay?: string

  // Tournament fields
  tournamentName?: string
  tournamentStartDate?: string
  tournamentEndDate?: string
  tournamentNumberOfGames?: string | number
  tournamentPlayerGender?: string
  tournamentLevelOfPlay?: string
}

// Multi-event form data (new format)
interface MultiEventFormData {
  // Organization
  organizationName: string

  // Billing
  billingContactName: string
  billingEmail: string
  billingPhone?: string
  billingAddress?: string
  billingCity?: string
  billingProvince?: string
  billingPostalCode?: string

  // Event Contact
  eventContactName: string
  eventContactEmail: string
  eventContactPhone?: string

  // Events array
  events: EventData[]

  // Policies
  disciplinePolicy: string
  agreement?: boolean | string

  // Submission metadata
  submissionTime?: string
}

// Legacy single-event format (for backwards compatibility)
interface LegacyFormData {
  organizationName: string
  billingContactName: string
  billingEmail: string
  billingPhone?: string
  billingAddress?: string
  billingCity?: string
  billingProvince?: string
  billingPostalCode?: string
  eventContactName: string
  eventContactEmail: string
  eventContactPhone?: string
  eventType: string
  leagueName?: string
  leagueStartDate?: string
  leagueEndDate?: string
  leagueDaysOfWeek?: string
  leaguePlayerGender?: string
  leagueLevelOfPlay?: string
  exhibitionGameLocation?: string
  exhibitionNumberOfGames?: string | number
  exhibitionGameDate?: string
  exhibitionStartTime?: string
  exhibitionPlayerGender?: string
  exhibitionLevelOfPlay?: string
  tournamentName?: string
  tournamentStartDate?: string
  tournamentEndDate?: string
  tournamentNumberOfGames?: string | number
  tournamentPlayerGender?: string
  tournamentLevelOfPlay?: string
  disciplinePolicy: string
  agreement?: string
  submissionTime?: string
}

// Load file as base64
async function loadFileAsBase64(filename: string): Promise<string | null> {
  try {
    const possiblePaths = [
      path.join(process.cwd(), 'public', 'documents', filename),
      path.join(process.cwd(), 'public', filename),
      path.join(__dirname, '..', '..', 'public', 'documents', filename),
      path.join(__dirname, '..', '..', 'public', filename),
    ]

    for (const filePath of possiblePaths) {
      try {
        const fileBuffer = fs.readFileSync(filePath)
        return fileBuffer.toString('base64')
      } catch {
        // Try next path
      }
    }

    console.error(`File not found: ${filename}`)
    return null
  } catch (error) {
    console.error(`Error loading file ${filename}:`, error)
    return null
  }
}

// Get content type from filename
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'xls':
      return 'application/vnd.ms-excel'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Send one OSA notification through the configured transactional provider.
 *
 * Sender, CC routing and the attachment set are what this handler is for;
 * only the transport underneath changed.
 */
async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  attachments?: Array<{ name: string; content: string; contentType: string }>,
  cc?: string[]
): Promise<void> {
  const senderEmail = process.env.OSA_SENDER_EMAIL || EMAIL_SCHEDULER

  await sendTransactionalEmail({
    from: senderEmail,
    to,
    cc: cc && cc.length > 0 ? cc : undefined,
    subject,
    html: htmlContent,
    attachments: attachments?.map((att) => ({
      filename: att.name,
      content: att.content,
      contentType: att.contentType,
    })),
  })
}

// Helper to get event-specific details from an event
function getEventDetails(event: EventData): {
  eventName: string
  startDate: string
  endDate?: string
  numberOfGames?: string | number
  location?: string
  playerGender?: string
  levelOfPlay?: string
  daysOfWeek?: string
  startTime?: string
  exhibitionGames?: ExhibitionGame[]
} {
  switch (event.eventType) {
    case 'League':
      return {
        eventName: event.leagueName || 'League',
        startDate: event.leagueStartDate || '',
        endDate: event.leagueEndDate,
        playerGender: event.leaguePlayerGender,
        levelOfPlay: event.leagueLevelOfPlay,
        daysOfWeek: event.leagueDaysOfWeek,
      }
    case 'Tournament':
      return {
        eventName: event.tournamentName || 'Tournament',
        startDate: event.tournamentStartDate || '',
        endDate: event.tournamentEndDate,
        numberOfGames: event.tournamentNumberOfGames,
        playerGender: event.tournamentPlayerGender,
        levelOfPlay: event.tournamentLevelOfPlay,
      }
    case 'Exhibition Game(s)':
    default:
      // For exhibition, calculate total games and get first date
      const games = event.exhibitionGames || []
      const totalGames = games.reduce((sum, g) => sum + (parseInt(g.numberOfGames) || 0), 0)
      const firstGame = games[0]
      return {
        eventName: 'Exhibition Game(s)',
        startDate: firstGame?.date || '',
        numberOfGames: totalGames || games.length,
        location: event.exhibitionGameLocation,
        playerGender: event.exhibitionPlayerGender,
        levelOfPlay: event.exhibitionLevelOfPlay,
        startTime: firstGame?.time,
        exhibitionGames: games,
      }
  }
}

// Generate HTML for a single event's details
function generateEventDetailsHtml(event: EventData): string {
  const details = getEventDetails(event)

  if (event.eventType === 'League') {
    return `
      <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">League Name:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.eventName}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Start Date:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.startDate}</td></tr>
      ${details.endDate ? `<tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">End Date:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.endDate}</td></tr>` : ''}
      ${details.daysOfWeek ? `<tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Day(s) of Week:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.daysOfWeek}</td></tr>` : ''}
      ${details.playerGender ? `<tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Player Gender:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.playerGender}</td></tr>` : ''}
      ${details.levelOfPlay ? `<tr><td style="padding: 12px; font-weight: 600;">Level of Play:</td>
          <td style="padding: 12px;">${details.levelOfPlay}</td></tr>` : ''}
    `
  } else if (event.eventType === 'Tournament') {
    return `
      <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Tournament Name:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.eventName}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Start Date:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.startDate}</td></tr>
      ${details.endDate ? `<tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">End Date:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.endDate}</td></tr>` : ''}
      ${details.numberOfGames ? `<tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Number of Games:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.numberOfGames}</td></tr>` : ''}
      ${details.playerGender ? `<tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Player Gender:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.playerGender}</td></tr>` : ''}
      ${details.levelOfPlay ? `<tr><td style="padding: 12px; font-weight: 600;">Level of Play:</td>
          <td style="padding: 12px;">${details.levelOfPlay}</td></tr>` : ''}
    `
  } else {
    // Exhibition Game(s) - show all game dates/times
    const games = details.exhibitionGames || []
    let gamesHtml = ''
    if (games.length > 1) {
      gamesHtml = `
        <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; vertical-align: top;">Game Schedule:</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
              <ul style="margin: 0; padding-left: 20px;">
                ${games.map(g => `<li>${g.date} at ${g.time} (${g.numberOfGames} game${parseInt(g.numberOfGames) > 1 ? 's' : ''})</li>`).join('')}
              </ul>
            </td></tr>
      `
    } else if (games.length === 1) {
      gamesHtml = `
        <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Game Date:</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${games[0].date}</td></tr>
        <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Start Time:</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${games[0].time}</td></tr>
        <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Number of Games:</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${games[0].numberOfGames}</td></tr>
      `
    }

    return `
      <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Event Type:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Exhibition Game(s)</td></tr>
      ${details.location ? `<tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Game Location:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.location}</td></tr>` : ''}
      ${gamesHtml}
      ${details.playerGender ? `<tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Player Gender:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${details.playerGender}</td></tr>` : ''}
      ${details.levelOfPlay ? `<tr><td style="padding: 12px; font-weight: 600;">Level of Play:</td>
          <td style="padding: 12px;">${details.levelOfPlay}</td></tr>` : ''}
    `
  }
}

// Generate client confirmation email content for multiple events
function generateMultiEventClientEmailContent(data: MultiEventFormData): string {
  const eventCount = data.events.length
  const eventSummary = eventCount === 1
    ? `your <strong>${data.events[0].eventType}</strong>`
    : `your <strong>${eventCount} events</strong>`

  // Generate event details for each event
  const eventsHtml = data.events.map((event, index) => {
    const details = getEventDetails(event)
    return `
      <h3 style="color: #1e3a5f; margin-top: 24px; margin-bottom: 12px;">Event ${index + 1}: ${event.eventType}</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background-color: #f9fafb; border: 2px solid #e5e7eb;">
        ${generateEventDetailsHtml(event)}
      </table>
    `
  }).join('')

  return `
    <h1>Booking Confirmation</h1>

    <p>Thank you for booking ${eventSummary} with ${ORG_NAME}.</p>

    <h2>Organization Information</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background-color: #f9fafb; border: 2px solid #e5e7eb;">
      <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; width: 40%;">Organization:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${data.organizationName}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Event Contact:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${data.eventContactName}</td></tr>
      <tr><td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Email:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${data.eventContactEmail}</td></tr>
      ${data.eventContactPhone ? `<tr><td style="padding: 12px; font-weight: 600;">Phone:</td>
          <td style="padding: 12px;">${data.eventContactPhone}</td></tr>` : ''}
    </table>

    <h2>Event Details</h2>
    ${eventsHtml}

    <h2>Discipline Policy</h2>
    <p>You have indicated your discipline policy will be: <strong>${data.disciplinePolicy}</strong></p>

    ${data.disciplinePolicy.toLowerCase().includes('own') ? `
    <p style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; margin: 16px 0;">
      <strong>Important:</strong> Since you are using your own document to address disciplinary issues, please provide a copy to the ${ORG_SHORT_NAME} Vice President prior to the start of your event.
    </p>
    ` : ''}

    <p>The ${ORG_SHORT_NAME} Scheduling & Assigning team will review your submission and be in touch if any additional information is needed. If you were unable to provide all game dates or details in the form, please <a href="${getContactUrl('scheduling')}">contact our scheduling team</a> with your complete schedule.</p>

    <h2>Attached Documents</h2>
    <p>For your reference, we have attached:</p>
    <ul>
      <li>${ORG_SHORT_NAME} Fee Schedule (Sept 2025 - Aug 2028)</li>
      <li>${ORG_SHORT_NAME} Invoice Policy</li>
      ${data.events[0]?.eventType === 'League' ? `
      <li>League Scheduling Template (Excel) - use if you have Microsoft Excel</li>
      <li>League Scheduling Template (Google Sheets) - use if you prefer Google Sheets</li>
      ` : ''}
      ${data.events[0]?.eventType === 'Tournament' ? `
      <li>Tournament Scheduling Template (Excel) - use if you have Microsoft Excel</li>
      <li>Tournament Scheduling Template (Google Sheets) - use if you prefer Google Sheets</li>
      ` : ''}
    </ul>
    ${data.events[0]?.eventType === 'League' || data.events[0]?.eventType === 'Tournament' ? `
    <p style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 12px 16px; margin: 16px 0;">
      <strong>Scheduling Template:</strong> Please fill out the attached scheduling template with your game schedule details and submit it through our <a href="${getContactUrl('scheduling')}">contact form</a> (select "Officiating Services / Booking"). We've included two versions - choose the Excel version if using Microsoft Excel, or the Google Sheets version if you'll be uploading to Google Drive.
    </p>
    ` : ''}

    <h2>Payment Information</h2>
    <p>Payments can be made by cheque or e-transfer. <a href="${getContactUrl('billing')}">Contact our billing team</a> (select "Billing / Payments") for payment details.</p>

    <p>Thank you for booking your officials with ${ORG_NAME}. We look forward to providing our trained and certified referees to make your ${eventCount === 1 ? 'event' : 'events'} a success.</p>

    <p>Best Regards,<br>
    <strong>${ORG_NAME}</strong><br>
    Scheduling Group<br>
    <a href="${getContactUrl('scheduling')}">Contact us</a><br>
    <a href="${SITE_URL}">${SITE_URL.replace('https://', 'www.')}</a></p>
  `
}

// Generate scheduler notification email content for multiple events
function generateMultiEventSchedulerEmailContent(data: MultiEventFormData): string {
  const eventCount = data.events.length

  // Generate event details for each event
  const eventsHtml = data.events.map((event, index) => {
    return `
      <h3 style="color: #1e3a5f; margin-top: 24px; margin-bottom: 12px;">Event ${index + 1}: ${event.eventType}</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        ${generateEventDetailsHtml(event)}
      </table>
    `
  }).join('')

  return `
    <h1>New OSA Request: ${eventCount} Event${eventCount > 1 ? 's' : ''}</h1>

    <p>A new Officiating Services Agreement request has been submitted with <strong>${eventCount} event${eventCount > 1 ? 's' : ''}</strong>.</p>

    <h2>Organization</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; width: 40%; background-color: #f9fafb;">Organization Name:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.organizationName}</td></tr>
    </table>

    <h2>Event Contact</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; width: 40%; background-color: #f9fafb;">Contact Name:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.eventContactName}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Contact Email:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;"><a href="mailto:${data.eventContactEmail}">${data.eventContactEmail}</a></td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Contact Phone:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.eventContactPhone || 'N/A'}</td></tr>
    </table>

    ${eventsHtml}

    <h2>Discipline Policy</h2>
    <p><strong>${data.disciplinePolicy}</strong></p>

    <h2>Billing Information</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; width: 40%; background-color: #f9fafb;">Billing Contact:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.billingContactName}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Billing Email:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;"><a href="mailto:${data.billingEmail}">${data.billingEmail}</a></td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Billing Phone:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.billingPhone || 'N/A'}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Billing Address:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${[data.billingAddress, data.billingCity, data.billingProvince, data.billingPostalCode].filter(Boolean).join(', ') || 'N/A'}</td></tr>
    </table>

    <p style="color: #6b7280; font-size: 14px;"><em>Submitted: ${data.submissionTime || new Date().toISOString()}</em></p>
  `
}

// Generate treasurer billing email content for multiple events
function generateMultiEventTreasurerEmailContent(data: MultiEventFormData): string {
  const eventCount = data.events.length

  // Generate event summary
  const eventSummaryHtml = data.events.map((event, index) => {
    const details = getEventDetails(event)
    return `
      <tr>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${index + 1}</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${event.eventType}</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${details.eventName}</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${details.startDate}</td>
        <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${details.numberOfGames || 'TBD'}</td>
      </tr>
    `
  }).join('')

  return `
    <h1>New OSA - Billing Information (${eventCount} Event${eventCount > 1 ? 's' : ''})</h1>

    <p>A new Officiating Services Agreement has been submitted. Below are the billing details.</p>

    <h2>Events Summary</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr style="background-color: #f9fafb;">
        <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left;">#</th>
        <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left;">Type</th>
        <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left;">Name</th>
        <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left;">Start Date</th>
        <th style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left;">Games</th>
      </tr>
      ${eventSummaryHtml}
    </table>

    <h2>Organization</h2>
    <p><strong>${data.organizationName}</strong></p>

    <h2>Billing Details</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; width: 40%; background-color: #f9fafb;">Billing Contact:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.billingContactName}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Billing Email:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;"><a href="mailto:${data.billingEmail}">${data.billingEmail}</a></td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Billing Phone:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.billingPhone || 'N/A'}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Billing Address:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.billingAddress || 'N/A'}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">City:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.billingCity || 'N/A'}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Province:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.billingProvince || 'N/A'}</td></tr>
      <tr><td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Postal Code:</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${data.billingPostalCode || 'N/A'}</td></tr>
    </table>

    <p style="color: #6b7280; font-size: 14px;"><em>Submitted: ${data.submissionTime || new Date().toISOString()}</em></p>
  `
}

// Helper to parse date strings to Date objects (handles various formats)
function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    return date.toISOString().split('T')[0] // Return YYYY-MM-DD
  } catch {
    return null
  }
}

// Helper to parse number of games
function parseNumberOfGames(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null
  const num = typeof value === 'number' ? value : parseInt(value, 10)
  return isNaN(num) ? null : num
}

// Save a single event submission to Supabase database
async function saveEventToDatabase(
  data: MultiEventFormData,
  event: EventData,
  submissionGroupId: string,
  emailResults: { client: boolean; scheduler: boolean; treasurer: boolean; president: boolean }
): Promise<{ id: string } | null> {
  try {
    const details = getEventDetails(event)

    const { data: inserted, error } = await supabase
      .from('osa_submissions')
      .insert({
        organization_name: data.organizationName,

        billing_contact_name: data.billingContactName,
        billing_email: data.billingEmail,
        billing_phone: data.billingPhone || null,
        billing_address: data.billingAddress || null,
        billing_city: data.billingCity || null,
        billing_province: data.billingProvince || null,
        billing_postal_code: data.billingPostalCode || null,

        event_contact_name: data.eventContactName,
        event_contact_email: data.eventContactEmail,
        event_contact_phone: data.eventContactPhone || null,

        event_type: event.eventType,

        // Multi-event tracking
        submission_group_id: submissionGroupId,
        event_index: event.eventIndex,

        // League fields
        league_name: event.leagueName || null,
        league_start_date: parseDate(event.leagueStartDate),
        league_end_date: parseDate(event.leagueEndDate),
        league_days_of_week: event.leagueDaysOfWeek || null,
        league_player_gender: event.leaguePlayerGender || null,
        league_level_of_play: event.leagueLevelOfPlay || null,

        // Exhibition fields
        exhibition_game_location: event.exhibitionGameLocation || null,
        exhibition_number_of_games: details.numberOfGames ? parseNumberOfGames(details.numberOfGames) : null,
        exhibition_game_date: event.exhibitionGames?.[0] ? parseDate(event.exhibitionGames[0].date) : null,
        exhibition_start_time: event.exhibitionGames?.[0]?.time || null,
        exhibition_player_gender: event.exhibitionPlayerGender || null,
        exhibition_level_of_play: event.exhibitionLevelOfPlay || null,
        exhibition_games: event.exhibitionGames || null,

        // Tournament fields
        tournament_name: event.tournamentName || null,
        tournament_start_date: parseDate(event.tournamentStartDate),
        tournament_end_date: parseDate(event.tournamentEndDate),
        tournament_number_of_games: parseNumberOfGames(event.tournamentNumberOfGames),
        tournament_player_gender: event.tournamentPlayerGender || null,
        tournament_level_of_play: event.tournamentLevelOfPlay || null,

        // Common fields
        discipline_policy: data.disciplinePolicy,
        agreement: data.agreement ? 'true' : null,

        // Metadata
        status: 'new',
        submission_time: data.submissionTime ? new Date(data.submissionTime).toISOString() : new Date().toISOString(),
        emails_sent: emailResults,
        raw_form_data: { ...data, currentEvent: event }
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to save OSA event to database:', error)
      return null
    }

    return inserted
  } catch (error) {
    console.error('Error saving OSA event:', error)
    return null
  }
}

// Convert legacy single-event format to multi-event format
function convertLegacyToMultiEvent(legacy: LegacyFormData): MultiEventFormData {
  return {
    organizationName: legacy.organizationName,
    billingContactName: legacy.billingContactName,
    billingEmail: legacy.billingEmail,
    billingPhone: legacy.billingPhone,
    billingAddress: legacy.billingAddress,
    billingCity: legacy.billingCity,
    billingProvince: legacy.billingProvince,
    billingPostalCode: legacy.billingPostalCode,
    eventContactName: legacy.eventContactName,
    eventContactEmail: legacy.eventContactEmail,
    eventContactPhone: legacy.eventContactPhone,
    disciplinePolicy: legacy.disciplinePolicy,
    agreement: legacy.agreement,
    submissionTime: legacy.submissionTime,
    events: [{
      eventIndex: 1,
      eventType: legacy.eventType,
      leagueName: legacy.leagueName,
      leagueStartDate: legacy.leagueStartDate,
      leagueEndDate: legacy.leagueEndDate,
      leagueDaysOfWeek: legacy.leagueDaysOfWeek,
      leaguePlayerGender: legacy.leaguePlayerGender,
      leagueLevelOfPlay: legacy.leagueLevelOfPlay,
      exhibitionGameLocation: legacy.exhibitionGameLocation,
      exhibitionGames: legacy.exhibitionGameDate ? [{
        date: legacy.exhibitionGameDate,
        time: legacy.exhibitionStartTime || '',
        numberOfGames: String(legacy.exhibitionNumberOfGames || 1)
      }] : undefined,
      exhibitionPlayerGender: legacy.exhibitionPlayerGender,
      exhibitionLevelOfPlay: legacy.exhibitionLevelOfPlay,
      tournamentName: legacy.tournamentName,
      tournamentStartDate: legacy.tournamentStartDate,
      tournamentEndDate: legacy.tournamentEndDate,
      tournamentNumberOfGames: legacy.tournamentNumberOfGames,
      tournamentPlayerGender: legacy.tournamentPlayerGender,
      tournamentLevelOfPlay: legacy.tournamentLevelOfPlay,
    }]
  }
}

export const handler: Handler = async (event: HandlerEvent) => {
  const logger = Logger.fromEvent('osa-webhook', event)

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return errorResponse({ code: 'method_not_allowed' })
  }

  // Rate limit per IP. Each call sends up to 4 Microsoft Graph emails
  // and writes DB rows; 10/min is generous for legit users + retries.
  const clientIp = getClientIp(event.headers)
  if (checkRateLimit(clientIp, { maxRequests: 10, windowMs: 60_000, prefix: 'osa-webhook' })) {
    return errorResponse({ code: 'rate_limited' })
  }

  try {
    // Parse form data
    const rawData = JSON.parse(event.body || '{}')

    // Determine if this is multi-event format (has events array) or legacy format
    let formData: MultiEventFormData
    if (rawData.events && Array.isArray(rawData.events)) {
      formData = rawData as MultiEventFormData
    } else if (rawData.eventType) {
      // Legacy single-event format - convert to multi-event
      formData = convertLegacyToMultiEvent(rawData as LegacyFormData)
    } else {
      return errorResponse({
        code: 'invalid_input',
        message: 'Your submission was missing event details. Please refresh the page and try again.',
      })
    }

    const eventCount = formData.events.length
    logger.info('osa', 'webhook_received', `OSA form submission: ${formData.organizationName} - ${eventCount} event(s)`, {
      metadata: { organization: formData.organizationName, eventCount }
    })

    // Validate required fields
    if (!formData.organizationName || !formData.eventContactEmail || !formData.events.length) {
      const fields: Record<string, string> = {}
      if (!formData.organizationName) fields.organizationName = 'Organization name is required'
      if (!formData.eventContactEmail) fields.eventContactEmail = 'Event contact email is required'
      if (!formData.events.length) fields.events = 'At least one event is required'
      return errorResponse({
        code: 'invalid_input',
        message: 'Some required information is missing. Please review the form and try again.',
        fields,
      })
    }

    // Compute a deterministic submission_group_id from the form data so
    // that retries (e.g. after a transient 5xx) don't fan out a fresh
    // batch of 4 emails per call. The hash includes the client-supplied
    // submissionTime, which is set once on form submit and stable
    // across retries, so two distinct submissions of the same form
    // still produce different keys.
    const idempotencyKey = createHash('sha256').update(JSON.stringify({
      org: formData.organizationName,
      contact: formData.eventContactEmail,
      billing: formData.billingEmail,
      submission_time: formData.submissionTime || '',
      events: formData.events.map(e => ({
        type: e.eventType,
        index: e.eventIndex,
        league: e.leagueName,
        location: e.exhibitionGameLocation,
        tournament: e.tournamentName,
        start: e.leagueStartDate || e.exhibitionGames?.[0]?.date || e.tournamentStartDate,
      }))
    })).digest('hex')
    // UUID-formatted (8-4-4-4-12) so it fits the submission_group_id
    // column whether that column is UUID or TEXT.
    const submissionGroupId = [
      idempotencyKey.slice(0, 8),
      idempotencyKey.slice(8, 12),
      idempotencyKey.slice(12, 16),
      idempotencyKey.slice(16, 20),
      idempotencyKey.slice(20, 32),
    ].join('-')

    const { data: existingGroup } = await supabase
      .from('osa_submissions')
      .select('id')
      .eq('submission_group_id', submissionGroupId)
      .limit(1)

    if (existingGroup && existingGroup.length > 0) {
      logger.info('osa', 'idempotent_replay', `Duplicate OSA submission ignored (group ${submissionGroupId})`, {
        metadata: { organization: formData.organizationName, eventCount }
      })
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          duplicate: true,
          submissionGroupId,
          message: 'This submission has already been received.'
        })
      }
    }

    // Check the transactional email provider is configured
    const emailConfig = checkEmailConfiguration()
    if (!emailConfig.configured) {
      logger.error('osa', 'config_error', emailConfig.error)
      return errorResponse({ code: 'service_unavailable' })
    }

    // Load attachments for client email
    const feeSchedulePdf = await loadFileAsBase64('Fee-Schedule.pdf')
    const invoicePolicyPdf = await loadFileAsBase64('Invoice-Policy.pdf')

    if (!feeSchedulePdf) logger.warn('osa', 'attachment_missing', 'Fee-Schedule.pdf not found — will send email without it')
    if (!invoicePolicyPdf) logger.warn('osa', 'attachment_missing', 'Invoice-Policy.pdf not found — will send email without it')

    const attachments: Array<{ name: string; content: string; contentType: string }> = []
    if (feeSchedulePdf) {
      attachments.push({
        name: 'Fee Schedule.pdf',
        content: feeSchedulePdf,
        contentType: 'application/pdf'
      })
    }
    if (invoicePolicyPdf) {
      attachments.push({
        name: 'Invoice Policy.pdf',
        content: invoicePolicyPdf,
        contentType: 'application/pdf'
      })
    }

    // Determine the primary event type for scheduling templates
    // Since we now support single event type, all events should be the same type
    const eventTypesSummary = Array.from(new Set(formData.events.map(e => e.eventType))).join(', ')
    const primaryEventType = formData.events[0]?.eventType

    // Add scheduling templates based on event type (League or Tournament only - not Exhibition)
    if (primaryEventType === 'League') {
      const leagueExcel = await loadFileAsBase64('League-Scheduling-Template.xlsx')
      const leagueGoogle = await loadFileAsBase64('League-Scheduling-Template-Google.xlsx')
      if (leagueExcel) {
        attachments.push({
          name: 'League Scheduling Template (Excel).xlsx',
          content: leagueExcel,
          contentType: getContentType('xlsx')
        })
      } else {
        logger.warn('osa', 'attachment_missing', 'League-Scheduling-Template.xlsx not found')
      }
      if (leagueGoogle) {
        attachments.push({
          name: 'League Scheduling Template (Google Sheets).xlsx',
          content: leagueGoogle,
          contentType: getContentType('xlsx')
        })
      } else {
        logger.warn('osa', 'attachment_missing', 'League-Scheduling-Template-Google.xlsx not found')
      }
    } else if (primaryEventType === 'Tournament') {
      const tournamentExcel = await loadFileAsBase64('Tournament-Scheduling-Template.xlsx')
      const tournamentGoogle = await loadFileAsBase64('Tournament-Scheduling-Template-Google.xlsx')
      if (tournamentExcel) {
        attachments.push({
          name: 'Tournament Scheduling Template (Excel).xlsx',
          content: tournamentExcel,
          contentType: getContentType('xlsx')
        })
      } else {
        logger.warn('osa', 'attachment_missing', 'Tournament-Scheduling-Template.xlsx not found')
      }
      if (tournamentGoogle) {
        attachments.push({
          name: 'Tournament Scheduling Template (Google Sheets).xlsx',
          content: tournamentGoogle,
          contentType: getContentType('xlsx')
        })
      } else {
        logger.warn('osa', 'attachment_missing', 'Tournament-Scheduling-Template-Google.xlsx not found')
      }
    }

    logger.info('osa', 'attachments_loaded', `Loaded ${attachments.length} attachment(s) for client email`)

    const results = {
      client: false,
      scheduler: false,
      treasurer: false,
      president: false
    }

    const schedulerEmail = process.env.OSA_SCHEDULER_EMAIL || EMAIL_SCHEDULER

    // 1. Send email to CLIENT (with attachments, CC scheduler) - ONE email for all events
    try {
      const clientContent = generateMultiEventClientEmailContent(formData)
      const clientHtml = generateEmailTemplate({
        subject: `Confirmation of booking - ${formData.organizationName} (${eventCount} event${eventCount > 1 ? 's' : ''})`,
        content: clientContent,
        previewText: `Thank you for booking ${eventCount} event${eventCount > 1 ? 's' : ''} with ${ORG_SHORT_NAME}`,
        external: true
      })

      await sendEmail(
        formData.eventContactEmail,
        `Confirmation of booking - ${formData.organizationName} (${eventCount} event${eventCount > 1 ? 's' : ''})`,
        clientHtml,
        attachments.length > 0 ? attachments : undefined,
        [schedulerEmail]
      )
      results.client = true
      logger.info('osa', 'email_sent', `Client confirmation sent to ${formData.eventContactEmail} (CC: ${schedulerEmail})`)
    } catch (error) {
      logger.error('osa', 'email_failed', `Failed to send client email`, error as Error)
    }

    // 2. Send email to SCHEDULER - ONE email for all events
    try {
      const schedulerContent = generateMultiEventSchedulerEmailContent(formData)
      const schedulerHtml = generateEmailTemplate({
        subject: `New OSA Request: ${formData.organizationName} - ${eventCount} event${eventCount > 1 ? 's' : ''} (${eventTypesSummary})`,
        content: schedulerContent,
        previewText: `New OSA with ${eventCount} event${eventCount > 1 ? 's' : ''} from ${formData.organizationName}`
      })

      await sendEmail(
        schedulerEmail,
        `New OSA Request: ${formData.organizationName} - ${eventCount} event${eventCount > 1 ? 's' : ''} (${eventTypesSummary})`,
        schedulerHtml
      )
      results.scheduler = true
      logger.info('osa', 'email_sent', `Scheduler notification sent to ${schedulerEmail}`)
    } catch (error) {
      logger.error('osa', 'email_failed', `Failed to send scheduler email`, error as Error)
    }

    // 3. Send email to TREASURER - only if billing email is NEW (not already in database)
    const treasurerEmail = process.env.OSA_TREASURER_EMAIL || EMAIL_TREASURER

    // Check if billing email already exists in the database
    let billingEmailExists = false
    try {
      const { data: existingSubmissions, error: lookupError } = await supabase
        .from('osa_submissions')
        .select('id')
        .eq('billing_email', formData.billingEmail)
        .limit(1)

      if (lookupError) {
        logger.warn('osa', 'billing_lookup_failed', `Failed to check if billing email exists: ${lookupError.message}`)
      } else {
        billingEmailExists = existingSubmissions && existingSubmissions.length > 0
      }
    } catch (error) {
      logger.warn('osa', 'billing_lookup_error', `Error checking billing email: ${(error as Error).message}`)
    }

    if (!billingEmailExists) {
      // New billing contact - send treasurer email with billing info
      try {
        const treasurerContent = generateMultiEventTreasurerEmailContent(formData)
        const treasurerHtml = generateEmailTemplate({
          subject: `OSA Billing Info: ${formData.organizationName} - ${eventCount} event${eventCount > 1 ? 's' : ''}`,
          content: treasurerContent,
          previewText: `Billing info for ${formData.organizationName}`
        })

        await sendEmail(
          treasurerEmail,
          `OSA Billing Info: ${formData.organizationName} - ${eventCount} event${eventCount > 1 ? 's' : ''}`,
          treasurerHtml
        )
        results.treasurer = true
        logger.info('osa', 'email_sent', `Treasurer notification sent to ${treasurerEmail} (new billing contact)`)
      } catch (error) {
        logger.error('osa', 'email_failed', `Failed to send treasurer email`, error as Error)
      }
    } else {
      logger.info('osa', 'treasurer_email_skipped', `Billing email ${formData.billingEmail} already exists in database - skipping treasurer notification`)
    }

    // 4. Send email to PRESIDENT (optional - enable via env var) - ONE email for all events
    const presidentEmail = process.env.OSA_PRESIDENT_EMAIL
    if (presidentEmail) {
      try {
        const presidentContent = generateMultiEventSchedulerEmailContent(formData)
        const presidentHtml = generateEmailTemplate({
          subject: `New OSA Request: ${formData.organizationName} - ${eventCount} event${eventCount > 1 ? 's' : ''}`,
          content: presidentContent,
          previewText: `New OSA with ${eventCount} event${eventCount > 1 ? 's' : ''} from ${formData.organizationName}`
        })

        await sendEmail(
          presidentEmail,
          `New OSA Request: ${formData.organizationName} - ${eventCount} event${eventCount > 1 ? 's' : ''}`,
          presidentHtml
        )
        results.president = true
        logger.info('osa', 'email_sent', `President notification sent to ${presidentEmail}`)
      } catch (error) {
        logger.error('osa', 'email_failed', `Failed to send president email`, error as Error)
      }
    }

    // 5. Save each event to database with shared submission_group_id
    // (computed deterministically above for idempotency)
    const submissionIds: string[] = []

    for (const event of formData.events) {
      try {
        const dbResult = await saveEventToDatabase(formData, event, submissionGroupId, results)
        if (dbResult) {
          submissionIds.push(dbResult.id)
          logger.info('osa', 'submission_saved', `OSA event ${event.eventIndex} saved to database with ID: ${dbResult.id}`)
        } else {
          logger.warn('osa', 'submission_save_failed', `Failed to save OSA event ${event.eventIndex} to database`)
        }
      } catch (error) {
        logger.error('osa', 'submission_save_error', `Error saving OSA event ${event.eventIndex} to database`, error as Error)
      }
    }


    // Audit log
    await logger.audit('OSA_SUBMITTED', 'osa', submissionGroupId, {
      actorId: 'external',
      actorEmail: formData.eventContactEmail,
      newValues: {
        organization: formData.organizationName,
        eventCount,
        submissionIds,
        events: formData.events.map(e => ({
          type: e.eventType,
          name: getEventDetails(e).eventName
        }))
      },
      description: `OSA submitted by ${formData.organizationName} with ${eventCount} event${eventCount > 1 ? 's' : ''}`
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `OSA form processed successfully (${eventCount} event${eventCount > 1 ? 's' : ''})`,
        submissionGroupId,
        submissionIds,
        eventCount,
        results
      })
    }

  } catch (error: any) {
    logger.error('osa', 'webhook_error', 'Error processing OSA webhook', error)
    return errorResponse({
      code: 'server_error',
      message: `We couldn’t finish processing your request. Please try again, or contact us at ${EMAIL_SCHEDULER} if it keeps failing.`,
    })
  }
}
