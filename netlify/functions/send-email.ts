import { createHandler, supabase, errorResponse } from './_shared/handler'
import { generateEmailTemplate } from '../../lib/emailTemplate'
import { recordBulkEmail } from '../../lib/emailHistory'
import {
  checkEmailConfiguration,
  recipientBatchSize,
  sendEmail,
  type EmailProviderName,
} from '../../lib/email'
import { EMAIL_ANNOUNCEMENTS } from '../../lib/siteConfig'

/**
 * Normalize URLs in HTML content to ensure they have proper protocols.
 */
function normalizeUrlsInHtml(html: string): string {
  return html.replace(
    /href="(?!(https?:\/\/|mailto:|tel:|#|\/))/gi,
    'href="https://'
  )
}

export interface EmailRequest {
  subject: string
  recipientGroups: string[]
  customEmails: string[]
  htmlContent: string
  rankFilter?: string
}

interface MemberRecord {
  email: string
  role: string
  certification_level?: string
  rank?: number
}

/**
 * Fan a bulk send out over the configured provider.
 *
 * Recipients stay in BCC and the visible `to` is the announcements mailbox —
 * moving them into `to` would disclose every member's address to every other
 * member. Batch size comes from the provider so the caller does not have to
 * know whose limit applies.
 */
async function sendBulkEmail(
  provider: EmailProviderName,
  toAddresses: string[],
  subject: string,
  htmlContent: string
): Promise<void> {
  const batchSize = recipientBatchSize(provider)
  for (let i = 0; i < toAddresses.length; i += batchSize) {
    await sendEmail({
      from: EMAIL_ANNOUNCEMENTS,
      to: EMAIL_ANNOUNCEMENTS,
      bcc: toAddresses.slice(i, i + batchSize),
      subject,
      html: htmlContent,
    })
  }
}

// Get member emails from Supabase based on recipient groups
async function getRecipientEmails(
  recipientGroups: string[],
  customEmails: string[],
  rankFilter?: string
): Promise<string[]> {
  const emails = new Set<string>()

  customEmails.forEach(email => {
    if (email && email.includes('@')) {
      emails.add(email.toLowerCase())
    }
  })

  if (recipientGroups.length === 0) {
    return Array.from(emails)
  }

  // Paginate — PostgREST defaults to 1000 rows. Once the membership
  // grows past 1000, an unpaginated fetch would silently miss everyone
  // beyond row 1000 and the bulk send would stop including them.
  //
  // Note on `rank`: a bare `rank` identifier collides with the SQL
  // `rank()` ordered-set aggregate and PostgREST returns
  // "WITHIN GROUP is required for ordered-set aggregate rank". The
  // alias form `member_rank:rank` sidesteps the collision — column
  // selected as `member_rank` in the response, sourced from the `rank`
  // column on the table. Whole bulk-email feature was silently broken
  // before this aliasing was added.
  const PAGE = 1000
  const members: Array<{ email: string | null, role: string | null, certification_level: string | null, member_rank: number | null }> = []
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from('members')
      .select('email, role, certification_level, member_rank:rank')
      .range(start, start + PAGE - 1)
    if (error) {
      console.error('Failed to fetch members:', error.message)
      return Array.from(emails)
    }
    if (!data || data.length === 0) break
    members.push(...data)
    if (data.length < PAGE) break
  }

  for (const member of members) {
    if (!member.email) continue

    let shouldInclude = false

    for (const group of recipientGroups) {
      if (group === 'all') { shouldInclude = true; break }
      if (group === 'officials' && member.role === 'official') { shouldInclude = true; break }
      if (group === 'executives' && member.role === 'executive') { shouldInclude = true; break }
      if (group === 'admins' && member.role === 'admin') { shouldInclude = true; break }
      if (group === 'evaluators' && member.role === 'evaluator') { shouldInclude = true; break }
      if (group === 'mentors' && member.role === 'mentor') { shouldInclude = true; break }
      if (group.startsWith('level') && member.certification_level) {
        const levelNum = group.replace('level', '')
        if (member.certification_level.includes(levelNum)) { shouldInclude = true; break }
      }
    }

    if (shouldInclude && rankFilter) {
      // Members with no rank set are excluded when a rankFilter is in
      // play — the caller is asking for "rank ≥ N" specifically.
      if (member.member_rank === null || member.member_rank === undefined) {
        shouldInclude = false
      } else {
        const threshold = parseInt(String(rankFilter).replace('+', ''), 10)
        if (Number.isNaN(threshold) || member.member_rank < threshold) {
          shouldInclude = false
        }
      }
    }

    if (shouldInclude) {
      emails.add(member.email.toLowerCase())
    }
  }

  return Array.from(emails)
}

export const handler = createHandler({
  name: 'send-email',
  methods: ['POST'],
  auth: 'admin',
  handler: async ({ event, logger, user }) => {
    const requestBody: EmailRequest = JSON.parse(event.body || '{}')
    const { subject, recipientGroups, customEmails, htmlContent, rankFilter } = requestBody

    logger.info('email', 'send_email_start', `Sending bulk email: ${subject}`, {
      metadata: { subject, recipientGroups, customEmailCount: customEmails?.length || 0, rankFilter }
    })

    // Validation
    if (!subject?.trim()) {
      return errorResponse({
        code: 'invalid_input',
        message: 'Please add a subject for this email.',
        fields: { subject: 'Subject is required' },
      })
    }
    if (!htmlContent?.trim()) {
      return errorResponse({
        code: 'invalid_input',
        message: 'Please add some content to the email.',
        fields: { htmlContent: 'Email content is required' },
      })
    }
    if ((!recipientGroups || recipientGroups.length === 0) && (!customEmails || customEmails.length === 0)) {
      return errorResponse({
        code: 'invalid_input',
        message: 'Please choose at least one recipient or recipient group.',
      })
    }
    if (rankFilter !== undefined && rankFilter !== '') {
      const cleaned = String(rankFilter).replace('+', '')
      if (cleaned === '' || Number.isNaN(parseInt(cleaned, 10))) {
        return { statusCode: 400, body: JSON.stringify({ error: 'rankFilter must be a number (optionally with a trailing +)' }) }
      }
    }

    const emailConfig = checkEmailConfiguration()
    if (!emailConfig.configured) {
      logger.error('email', 'send_email_config_error', emailConfig.error)
      return errorResponse({ code: 'service_unavailable' })
    }

    try {
      const recipientEmails = await getRecipientEmails(
        recipientGroups || [],
        customEmails || [],
        rankFilter
      )

      if (recipientEmails.length === 0) {
        return errorResponse({
          code: 'invalid_input',
          message: 'None of the selected groups had any active members. Please pick a different set of recipients.',
        })
      }

      logger.info('email', 'send_email_recipients', `Found ${recipientEmails.length} recipients`, {
        metadata: { recipientCount: recipientEmails.length, recipientGroups }
      })

      const normalizedContent = normalizeUrlsInHtml(htmlContent)
      const emailHtml = generateEmailTemplate({
        subject,
        content: normalizedContent,
        previewText: subject
      })

      await sendBulkEmail(emailConfig.provider, recipientEmails, subject, emailHtml)

      await recordBulkEmail({
        sentByEmail: user!.email,
        subject,
        htmlContent: emailHtml,
        recipientCount: recipientEmails.length,
        recipientList: recipientEmails,
        recipientGroups: recipientGroups || [],
        rankFilter,
        status: 'sent',
      })

      await logger.audit('EMAIL_SENT', 'email', null, {
        actorId: user!.id,
        actorEmail: user!.email,
        newValues: { subject, recipientCount: recipientEmails.length, recipientGroups },
        description: `Bulk email sent: "${subject}" to ${recipientEmails.length} recipients`
      })

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          recipientCount: recipientEmails.length,
          message: `Email sent successfully to ${recipientEmails.length} recipients`
        })
      }
    } catch (error: any) {
      await recordBulkEmail({
        sentByEmail: user!.email,
        subject: requestBody.subject || 'Unknown',
        htmlContent: requestBody.htmlContent || '',
        recipientCount: 0,
        recipientList: [],
        recipientGroups: requestBody.recipientGroups || [],
        rankFilter: requestBody.rankFilter,
        status: 'failed',
        errorMessage: error.message || 'Unknown error',
      })

      // Re-throw so the shared handler logs it and returns generic error
      throw error
    }
  }
})
