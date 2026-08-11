/**
 * The branded email wrapper takes every organisation-specific string from
 * lib/siteConfig, so changing the config changes every transactional email.
 * These tests read the config rather than hardcoding an organisation's name —
 * they keep passing after PLAT-20 replaces the values.
 */

import { generateEmailTemplate, sampleEmails, EMAIL_BRAND } from '@/lib/emailTemplate'
import {
  ORG_NAME,
  ORG_TAGLINE,
  ORG_LOCATION,
  ORG_LOGO_URL,
  SITE_URL,
  getPortalUrl,
  getContactUrl,
  getCopyrightYear,
} from '@/lib/siteConfig'

const render = (overrides = {}) =>
  generateEmailTemplate({
    subject: 'Subject line',
    content: '<p>Body copy</p>',
    ...overrides,
  })

describe('generateEmailTemplate', () => {
  it('renders the caller’s subject and content', () => {
    const html = render()
    expect(html).toContain('<title>Subject line</title>')
    expect(html).toContain('<p>Body copy</p>')
  })

  it('takes its organisation identity from siteConfig', () => {
    const html = render()
    expect(html).toContain(ORG_NAME)
    expect(html).toContain(ORG_TAGLINE)
    expect(html).toContain(ORG_LOCATION)
    expect(html).toContain(`src="${ORG_LOGO_URL}"`)
    expect(html).toContain(`href="${SITE_URL}"`)
    expect(html).toContain(String(getCopyrightYear()))
  })

  it('uses the shared palette rather than scattered literals', () => {
    const html = render()
    expect(html).toContain(EMAIL_BRAND.shell)
    expect(html).toContain(EMAIL_BRAND.accent)
    expect(html).toContain(EMAIL_BRAND.page)
  })

  it('links the member portal for internal mail', () => {
    const html = render()
    expect(html).toContain(getPortalUrl())
    expect(html).toContain('you are a member of')
  })

  it('hides the member portal for external mail', () => {
    const html = render({ external: true })
    expect(html).not.toContain(`href="${getPortalUrl()}"`)
    expect(html).toContain(getContactUrl())
    expect(html).toContain('submitted a request through our website')
  })

  it('renders preview text only when supplied', () => {
    expect(render({ previewText: 'Peek at this' })).toContain('Peek at this')
    expect(render()).not.toContain('max-height:0px')
  })

  it('darkens the outer background in preview mode', () => {
    expect(render({ previewMode: true })).toContain(`background-color: ${EMAIL_BRAND.shell};`)
  })
})

describe('sampleEmails', () => {
  const samples = Object.entries(sampleEmails)

  it('renders all three samples', () => {
    expect(samples.map(([key]) => key).sort()).toEqual(['announcement', 'newsletter', 'reminder'])
  })

  it.each(samples)('%s is built from siteConfig, not a hardcoded organisation', (_key, html) => {
    expect(html).toContain(ORG_NAME)
    expect(html).toContain(getPortalUrl())
  })
})
