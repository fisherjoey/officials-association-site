import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import { getCorsHeaders, supabase, errorResponse } from './_shared/handler'
import { checkRateLimit, getClientIp } from './_shared/rateLimit'
import { generateEmailTemplate } from '../../lib/emailTemplate'
import { sendEmail } from '../../lib/email'
import { Logger } from '../../lib/logger'
import { validateEmail } from '../../lib/emailValidation'
import { recordContactFormEmail } from '../../lib/emailHistory'
import { verifyEmailToken } from './verify-email'
import {
  CONTACT_CATEGORY_EMAILS,
  CONTACT_CATEGORY_LABELS,
  EMAIL_ANNOUNCEMENTS,
  EMAIL_SECRETARY,
  ORG_NAME,
} from '../../lib/siteConfig'

export interface ContactFormData {
  name: string
  email: string
  category: string
  subject: string
  message: string
  attachmentUrls?: string[]
  verificationToken?: string
  verificationCode?: string
  complaintDetected?: boolean
}

const categoryEmailMap = CONTACT_CATEGORY_EMAILS
const categoryLabels = CONTACT_CATEGORY_LABELS

/**
 * Send from the announcements mailbox with Reply-To pointed at whoever filled
 * in the form, so the recipient can just hit reply. That routing is the whole
 * point of this handler and must survive a change of transport.
 */
async function sendContactEmail(
  toAddress: string,
  fromName: string,
  fromEmail: string,
  subject: string,
  htmlContent: string
): Promise<void> {
  await sendEmail({
    from: EMAIL_ANNOUNCEMENTS,
    to: toAddress,
    replyTo: { name: fromName, address: fromEmail },
    subject,
    html: htmlContent,
  })
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  const logger = Logger.fromEvent('contact-form', event)

  const origin = event.headers.origin || event.headers.Origin
  const headers = {
    ...getCorsHeaders(origin, ['POST']),
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // Rate limit: 5 submissions per minute per IP
  const clientIp = getClientIp(event.headers)
  if (checkRateLimit(clientIp, { maxRequests: 5, windowMs: 60_000, prefix: 'contact' })) {
    return errorResponse({ code: 'rate_limited', headers })
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse({ code: 'method_not_allowed', headers })
  }

  try {
    const body: ContactFormData = JSON.parse(event.body || '{}')
    const { name, email, category, subject, message } = body

    // Validation
    if (!name || name.trim().length < 2) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Please enter your name.',
        fields: { name: 'Name is required' },
      })
    }

    if (!email || !email.includes('@')) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Please enter a valid email address.',
        fields: { email: 'Valid email is required' },
      })
    }

    // Enhanced email validation: MX record lookup + disposable domain blocking
    const emailValidation = await validateEmail(email)
    if (!emailValidation.valid) {
      logger.info('email', 'contact_form_email_rejected', `Email rejected: ${emailValidation.reason}`, {
        metadata: { email, reason: emailValidation.reason, suggestion: emailValidation.suggestion }
      })
      return errorResponse({
        code: 'email_unavailable',
        headers,
        message: emailValidation.suggestion
          ? `That email address looks invalid. Did you mean ${emailValidation.suggestion}?`
          : 'That email address looks invalid. Please double-check and try again.',
        fields: { email: emailValidation.reason || 'Invalid email address' },
        extra: emailValidation.suggestion ? { suggestion: emailValidation.suggestion } : undefined,
      })
    }

    if (!category || !categoryEmailMap[category]) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Please choose a category for your message.',
        fields: { category: 'Please select a category' },
      })
    }

    if (!subject || subject.trim().length < 5) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Please add a short subject (at least 5 characters).',
        fields: { subject: 'Subject must be at least 5 characters' },
      })
    }

    // If the client flagged this as a complaint, require email verification
    if (body.complaintDetected) {
      if (!body.verificationToken || !body.verificationCode) {
        return errorResponse({ code: 'verification_required', headers })
      }
      const verification = verifyEmailToken(body.verificationToken, email, body.verificationCode)
      if (!verification.valid) {
        return errorResponse({
          code: 'verification_failed',
          headers,
          message: verification.reason || 'That verification code didn’t match. Please check the email and try again.',
        })
      }
      logger.info('email', 'contact_form_verified', 'Complaint submission with verified email', {
        metadata: { email }
      })
    }

    if (!message || message.trim().length < 20) {
      return errorResponse({
        code: 'invalid_input',
        headers,
        message: 'Please add a bit more detail (at least 20 characters).',
        fields: { message: 'Message must be at least 20 characters' },
      })
    }

    // Validate attachment URLs
    if (body.attachmentUrls && body.attachmentUrls.length > 0) {
      const MAX_ATTACHMENTS = 5
      if (body.attachmentUrls.length > MAX_ATTACHMENTS) {
        return errorResponse({
          code: 'invalid_input',
          headers,
          message: `Please limit attachments to ${MAX_ATTACHMENTS} links.`,
        })
      }

      const allowedHosts = [
        'youtube.com', 'www.youtube.com', 'youtu.be',
        'vimeo.com', 'www.vimeo.com',
        'drive.google.com', 'docs.google.com',
        'dropbox.com', 'www.dropbox.com', 'dl.dropboxusercontent.com',
        'imgur.com', 'i.imgur.com',
        'onedrive.live.com', '1drv.ms',
      ]

      for (const url of body.attachmentUrls) {
        let parsed: URL
        try {
          parsed = new URL(url)
        } catch {
          return errorResponse({
            code: 'invalid_input',
            headers,
            message: 'One of your attachment links isn’t a valid URL. Please check and try again.',
          })
        }

        if (parsed.protocol !== 'https:') {
          return errorResponse({
            code: 'invalid_input',
            headers,
            message: 'Attachment links must start with https://.',
          })
        }

        const host = parsed.hostname.toLowerCase()
        if (!allowedHosts.some(allowed => host === allowed || host.endsWith('.' + allowed))) {
          return errorResponse({
            code: 'invalid_input',
            headers,
            message: 'Attachments must be hosted on YouTube, Vimeo, Google Drive, Dropbox, Imgur, or OneDrive.',
          })
        }
      }

      // Check URLs against Google Safe Browsing API
      const safeBrowsingKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY
      if (safeBrowsingKey) {
        try {
          const sbResponse = await fetch(
            `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${safeBrowsingKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client: { clientId: 'officials-association-contact-form', clientVersion: '1.0.0' },
                threatInfo: {
                  threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
                  platformTypes: ['ANY_PLATFORM'],
                  threatEntryTypes: ['URL'],
                  threatEntries: body.attachmentUrls.map(url => ({ url })),
                },
              }),
            }
          )

          if (sbResponse.ok) {
            const sbData = await sbResponse.json()
            if (sbData.matches && sbData.matches.length > 0) {
              logger.info('email', 'contact_form_unsafe_url', 'Attachment URL flagged by Safe Browsing', {
                metadata: { matches: sbData.matches.map((m: { threat?: { url?: string }; threatType?: string }) => ({ url: m.threat?.url, type: m.threatType })) }
              })
              return errorResponse({
                code: 'invalid_input',
                headers,
                message: 'One or more of your links was flagged as unsafe. Please check your attachments and try again.',
              })
            }
          }
        } catch (sbError) {
          // Don't block submission if Safe Browsing API is unreachable
          logger.error('email', 'safe_browsing_error', 'Safe Browsing API check failed', sbError instanceof Error ? sbError : new Error(String(sbError)))
        }
      }
    }

    // Check environment variables
    if (!process.env.MICROSOFT_TENANT_ID ||
        !process.env.MICROSOFT_CLIENT_ID ||
        !process.env.MICROSOFT_CLIENT_SECRET) {
      logger.error('email', 'contact_form_config_error', 'Microsoft Graph credentials not configured')
      return errorResponse({ code: 'service_unavailable', headers })
    }

    const recipientEmail = categoryEmailMap[category]
    const categoryLabel = categoryLabels[category] || 'General Inquiry'

    logger.info('email', 'contact_form_submit', `Contact form submission: ${categoryLabel}`, {
      metadata: { category, recipientEmail, senderEmail: email }
    })

    // Build email content
    const emailContent = `
      <h1>New Contact Form Submission</h1>

      <p>A new message has been submitted through the ${ORG_NAME} website contact form.</p>

      <h2>Sender Information</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: 600; width: 150px;">Name:</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: 600;">Email:</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: 600;">Category:</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(categoryLabel)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: 600;">Subject:</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(subject)}</td>
        </tr>
      </table>

      <h2>Message</h2>
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
        <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>

      ${body.attachmentUrls && body.attachmentUrls.length > 0 ? `
      <h2>Attachments</h2>
      <div style="background-color: #eff6ff; padding: 12px 16px; border-radius: 8px; border: 1px solid #bfdbfe;">
        ${body.attachmentUrls.map((url, i) => `
          <p style="margin: ${i > 0 ? '8px' : '0'} 0 0 0; font-size: 14px;">
            <a href="${escapeHtml(url)}" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${escapeHtml(url)}</a>
          </p>
        `).join('')}
      </div>
      ` : ''}

      ${body.complaintDetected ? `
      <div style="margin-top: 20px; padding: 12px 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
        <p style="margin: 0; color: #166534; font-size: 14px;">
          <strong>&#10003; Verified Email</strong> &mdash; The sender verified ownership of this email address via a confirmation code before submitting.
        </p>
      </div>
      ` : ''}

      <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
        <strong>Note:</strong> You can reply directly to this email to respond to ${escapeHtml(name)}.
      </p>
    `

    const emailSubject = `[Contact Form] ${subject}`
    const emailHtml = generateEmailTemplate({
      subject: emailSubject,
      content: emailContent,
      previewText: `New contact form submission from ${name}`
    })

    await sendContactEmail(
      recipientEmail,
      name,
      email,
      emailSubject,
      emailHtml
    )

    logger.info('email', 'contact_form_sent', `Contact form email sent to ${recipientEmail}`, {
      metadata: { category, recipientEmail, senderName: name }
    })

    // Send confirmation email to the sender (fire-and-forget)
    try {
      const confirmationContent = `
        <h1>We've Received Your Message</h1>

        <p>Hi ${escapeHtml(name)},</p>

        <p>Thank you for contacting ${ORG_NAME}. This is a confirmation that we've received your message and it has been forwarded to the appropriate person.</p>

        <h2>Your Submission</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: 600; width: 150px;">Category:</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(categoryLabel)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: 600;">Subject:</td>
            <td style="padding: 10px; border: 1px solid #e5e7eb;">${escapeHtml(subject)}</td>
          </tr>
        </table>

        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
          <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
        </div>

        ${body.attachmentUrls && body.attachmentUrls.length > 0 ? `
        <h2>Attachments</h2>
        <div style="background-color: #eff6ff; padding: 12px 16px; border-radius: 8px; border: 1px solid #bfdbfe;">
          ${body.attachmentUrls.map((url, i) => `
            <p style="margin: ${i > 0 ? '8px' : '0'} 0 0 0; font-size: 14px;">
              <a href="${escapeHtml(url)}" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${escapeHtml(url)}</a>
            </p>
          `).join('')}
        </div>
        ` : ''}

        <p style="margin-top: 24px;">We typically respond within 1–2 business days. If your matter is urgent, please don't hesitate to follow up.</p>

        <p>Best regards,<br>
        <strong>${ORG_NAME}</strong></p>
      `

      const confirmationSubject = `We've received your message — ${ORG_NAME}`
      const confirmationHtml = generateEmailTemplate({
        subject: confirmationSubject,
        content: confirmationContent,
        previewText: `Thank you for contacting ${ORG_NAME}. We've received your message.`,
        external: true,
      })

      sendContactEmail(
        email,
        ORG_NAME,
        EMAIL_ANNOUNCEMENTS,
        confirmationSubject,
        confirmationHtml
      ).catch((err) => {
        logger.error('email', 'contact_form_confirmation_error', 'Failed to send confirmation email', err instanceof Error ? err : new Error(String(err)))
      })
    } catch (confirmErr) {
      logger.error('email', 'contact_form_confirmation_error', 'Failed to build confirmation email', confirmErr instanceof Error ? confirmErr : new Error(String(confirmErr)))
    }

    // Record in email history (fire-and-forget)
    recordContactFormEmail({
      senderName: name,
      senderEmail: email,
      category,
      categoryLabel,
      recipientEmail,
      subject: emailSubject,
      message,
      htmlContent: emailHtml,
    })

    // Save to contact_submissions table for admin tracking (fire-and-forget)
    try {
      supabase
        .from('contact_submissions')
        .insert({
          sender_name: name,
          sender_email: email,
          category,
          category_label: categoryLabel,
          subject: emailSubject,
          message,
          recipient_email: recipientEmail,
          attachment_urls: body.attachmentUrls && body.attachmentUrls.length > 0 ? body.attachmentUrls : null,
        })
        .then(({ error: insertError }) => {
          if (insertError) {
            console.error('[ContactForm] Failed to save submission:', insertError.message)
          }
        })
    } catch (dbError) {
      console.error('[ContactForm] Failed to save submission:', dbError)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Your message has been sent successfully'
      })
    }

  } catch (error: unknown) {
    logger.error('email', 'contact_form_error', 'Error processing contact form', error instanceof Error ? error : new Error(String(error)))

    return errorResponse({
      code: 'server_error',
      headers,
      message: `We couldn’t send your message right now. Please try again in a few minutes — if it keeps failing, email us at ${EMAIL_SECRETARY}.`,
    })
  }
}
