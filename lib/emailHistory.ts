/**
 * Email History Logger
 * Records all sent emails to the email_history table for audit and tracking
 */

import { EMAIL_SUBJECTS } from './siteConfig'

export type EmailType = 'bulk' | 'invite' | 'password_reset' | 'welcome' | 'contact_form'
export type EmailStatus = 'sent' | 'failed' | 'partial'

export interface EmailHistoryRecord {
  email_type: EmailType
  sent_by_id?: string
  sent_by_email?: string
  subject: string
  html_content?: string
  recipient_count: number
  recipient_list?: string[]
  recipient_groups?: string[]
  rank_filter?: string
  recipient_email?: string
  recipient_name?: string
  status: EmailStatus
  error_message?: string
  metadata?: Record<string, unknown>
}

/**
 * Record an email in the email_history table
 * Fire-and-forget - doesn't throw on failure to avoid blocking email sending
 */
export async function recordEmailHistory(record: EmailHistoryRecord): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      console.warn('[EmailHistory] Supabase credentials not configured, skipping email history recording')
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${url}/rest/v1/email_history`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        email_type: record.email_type,
        sent_by_id: record.sent_by_id || null,
        sent_by_email: record.sent_by_email || null,
        subject: record.subject,
        html_content: record.html_content || null,
        recipient_count: record.recipient_count,
        recipient_list: record.recipient_list || null,
        recipient_groups: record.recipient_groups || null,
        rank_filter: record.rank_filter || null,
        recipient_email: record.recipient_email || null,
        recipient_name: record.recipient_name || null,
        status: record.status,
        error_message: record.error_message || null,
        metadata: record.metadata || {},
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text()
      console.error('[EmailHistory] Failed to record email history:', text)
    }
  } catch (err) {
    // Silently fail - recording history should never break email sending
    if (err instanceof Error && err.name !== 'AbortError') {
      console.error('[EmailHistory] Failed to record email history:', err.message)
    }
  }
}

/**
 * Helper to record a bulk email send
 */
export function recordBulkEmail(params: {
  subject: string
  htmlContent: string
  recipientCount: number
  recipientList: string[]
  recipientGroups: string[]
  rankFilter?: string
  sentByEmail?: string
  status?: EmailStatus
  errorMessage?: string
}): Promise<void> {
  return recordEmailHistory({
    email_type: 'bulk',
    sent_by_email: params.sentByEmail || 'system',
    subject: params.subject,
    html_content: params.htmlContent,
    recipient_count: params.recipientCount,
    recipient_list: params.recipientList,
    recipient_groups: params.recipientGroups,
    rank_filter: params.rankFilter,
    status: params.status || 'sent',
    error_message: params.errorMessage,
  })
}

/**
 * Helper to record an invite email
 */
export function recordInviteEmail(params: {
  recipientEmail: string
  recipientName?: string
  htmlContent?: string
  sentById?: string
  sentByEmail?: string
  status?: EmailStatus
  errorMessage?: string
}): Promise<void> {
  return recordEmailHistory({
    email_type: 'invite',
    sent_by_id: params.sentById,
    sent_by_email: params.sentByEmail || 'system',
    subject: EMAIL_SUBJECTS.invite,
    html_content: params.htmlContent,
    recipient_count: 1,
    recipient_email: params.recipientEmail,
    recipient_name: params.recipientName,
    status: params.status || 'sent',
    error_message: params.errorMessage,
  })
}

/**
 * Helper to record a password reset email
 */
export function recordPasswordResetEmail(params: {
  recipientEmail: string
  htmlContent?: string
  sentById?: string
  sentByEmail?: string
  status?: EmailStatus
  errorMessage?: string
}): Promise<void> {
  return recordEmailHistory({
    email_type: 'password_reset',
    sent_by_id: params.sentById,
    sent_by_email: params.sentByEmail || 'system',
    subject: EMAIL_SUBJECTS.passwordReset,
    html_content: params.htmlContent,
    recipient_count: 1,
    recipient_email: params.recipientEmail,
    status: params.status || 'sent',
    error_message: params.errorMessage,
  })
}

/**
 * Helper to record a contact form email
 */
export function recordContactFormEmail(params: {
  senderName: string
  senderEmail: string
  category: string
  categoryLabel: string
  recipientEmail: string
  subject: string
  message: string
  htmlContent?: string
  status?: EmailStatus
  errorMessage?: string
}): Promise<void> {
  return recordEmailHistory({
    email_type: 'contact_form',
    sent_by_email: params.senderEmail,
    subject: params.subject,
    html_content: params.htmlContent,
    recipient_count: 1,
    recipient_email: params.recipientEmail,
    recipient_name: params.categoryLabel,
    status: params.status || 'sent',
    error_message: params.errorMessage,
    metadata: {
      sender_name: params.senderName,
      sender_email: params.senderEmail,
      category: params.category,
      category_label: params.categoryLabel,
      message: params.message,
    },
  })
}

/**
 * Helper to record a welcome/batch invite email
 */
export function recordWelcomeEmail(params: {
  recipientEmail: string
  recipientName?: string
  htmlContent?: string
  status?: EmailStatus
  errorMessage?: string
}): Promise<void> {
  return recordEmailHistory({
    email_type: 'welcome',
    sent_by_email: 'system',
    subject: EMAIL_SUBJECTS.invite,
    html_content: params.htmlContent,
    recipient_count: 1,
    recipient_email: params.recipientEmail,
    recipient_name: params.recipientName,
    status: params.status || 'sent',
    error_message: params.errorMessage,
  })
}
