/**
 * Email Validation Utilities
 * Server-side email validation including DNS MX record lookup and disposable domain blocking
 */

import { promises as dns } from 'dns'

// Common disposable/temporary email domains
const DISPOSABLE_DOMAINS = new Set([
  // Major disposable email services
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'grr.la', 'guerrillamail.de',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'throwaway.email', 'throwaway.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'sharklasers.com', 'guerrillamail.info', 'spam4.me',
  'trashmail.com', 'trashmail.me', 'trashmail.net', 'trashmail.org',
  'mailnesia.com', 'maildrop.cc',
  'dispostable.com', 'discard.email',
  'fakeinbox.com', 'fakemail.net',
  'tempail.com', 'tempr.email', 'tempmailaddress.com',
  'burnermail.io', 'mailcatch.com',
  'getairmail.com', 'tmail.ws',
  'mohmal.com', 'getnada.com',
  'emailondeck.com', 'mintemail.com',
  'mailsac.com', 'harakirimail.com',
  'crazymailing.com', 'mailnator.com',
  '10minutemail.com', '10minutemail.net',
  'minutemail.com',
  'mytemp.email', 'tmpmail.net', 'tmpmail.org',
  'spamgourmet.com', 'spamgourmet.net',
  'mailexpire.com', 'tempinbox.com',
  'inboxbear.com', 'mailforspam.com',
  'safetymail.info', 'filzmail.com',
  'devnullmail.com', 'rmqkr.net',
  'jetable.org', 'trash-mail.com',
  'guerrillamail.biz', 'maildrop.gq',
  'emailfake.com', 'emkei.cz',
  'receiveee.com', 'disposableemailaddresses.emailmiser.com',
  'mailtemp.info', 'mailzilla.com',
  'tempomail.fr', 'ephemail.net',
  'dropmail.me', 'mailhazard.com',
  'owlpic.com', 'throwam.com',
  'incognitomail.org', 'mailnull.com',
  'binkmail.com', 'bobmail.info',
  'chammy.info', 'trashymail.com',
  'wegwerfmail.de', 'wegwerfmail.net',
  'einrot.com', 'sharklasers.com',
  'spamfree24.org', 'mytrashmail.com',
  'thankyou2010.com', 'tempmailer.com',
  'guerrillamail.com', 'mailcatch.com',
])

// Common email typos and their corrections
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.ca': 'gmail.com', // Not a typo, valid domain
  'gnail.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'htomail.com': 'hotmail.com',
  'outloo.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outllook.com': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaho.ca': 'yahoo.ca',
  'yaoo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
}

export interface EmailValidationResult {
  valid: boolean
  reason?: string
  suggestion?: string // For typo corrections
}

/**
 * Comprehensive server-side email validation
 * 1. Format validation
 * 2. Disposable domain check
 * 3. DNS MX record lookup
 */
export async function validateEmail(email: string): Promise<EmailValidationResult> {
  if (!email) {
    return { valid: false, reason: 'Email address is required' }
  }

  const trimmed = email.trim().toLowerCase()

  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(trimmed)) {
    return { valid: false, reason: 'Please enter a valid email address' }
  }

  const [, domain] = trimmed.split('@')
  if (!domain) {
    return { valid: false, reason: 'Please enter a valid email address' }
  }

  // Check for common typos
  const typoCorrection = DOMAIN_TYPOS[domain]
  if (typoCorrection) {
    const correctedEmail = trimmed.replace(`@${domain}`, `@${typoCorrection}`)
    return {
      valid: false,
      reason: `Did you mean ${correctedEmail}?`,
      suggestion: correctedEmail,
    }
  }

  // Check disposable email domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      reason: 'Please use a permanent email address. Temporary or disposable email addresses are not accepted.',
    }
  }

  // DNS MX record lookup — verify the domain can actually receive email
  try {
    const mxRecords = await dns.resolveMx(domain)
    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        reason: 'This email domain does not appear to accept emails. Please check your email address.',
      }
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'ESERVFAIL') {
      return {
        valid: false,
        reason: 'This email domain was not found. Please check your email address.',
      }
    }
    // For network errors (ETIMEOUT, etc.), don't block the submission
    // — better to let a valid email through than block it due to DNS issues
    console.warn(`[EmailValidation] DNS lookup warning for ${domain}:`, err)
  }

  return { valid: true }
}

/**
 * Quick check if an email domain is disposable (no async needed)
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1]
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false
}
