/**
 * Provider selection and the failure messages an adopter will actually see.
 *
 * The point of these tests is that misconfiguration is loud. A silent no-op
 * here would mean password reset returns 200, the member waits for mail that
 * never arrives, and nothing records that the send did not happen — so every
 * unconfigured path must throw, and the throw must name the variable to set.
 */

import {
  checkEmailConfiguration,
  createEmailProvider,
  EmailConfigurationError,
  getEmailProvider,
  recipientBatchSize,
  resetEmailProviderCache,
  resolveEmailProviderName,
} from '@/lib/email'

const env = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  overrides as NodeJS.ProcessEnv

const GRAPH_ENV = {
  MICROSOFT_TENANT_ID: 'tenant',
  MICROSOFT_CLIENT_ID: 'client',
  MICROSOFT_CLIENT_SECRET: 'secret',
}

beforeEach(() => {
  resetEmailProviderCache()
})

describe('EMAIL_PROVIDER is unset', () => {
  it('throws, naming the variable and every valid value', () => {
    let thrown: unknown
    try {
      resolveEmailProviderName(env({}))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(EmailConfigurationError)
    const message = (thrown as Error).message
    expect(message).toContain('EMAIL_PROVIDER')
    expect(message).toContain('resend')
    expect(message).toContain('smtp')
    expect(message).toContain('graph')
    // and it points at what each one needs
    expect(message).toContain('RESEND_API_KEY')
    expect(message).toContain('SMTP_HOST')
    expect(message).toContain('MICROSOFT_TENANT_ID')
  })

  it('throws rather than silently doing nothing when only some Graph vars are present', () => {
    expect(() =>
      resolveEmailProviderName(env({ MICROSOFT_TENANT_ID: 'tenant' }))
    ).toThrow(EmailConfigurationError)
  })

  it('falls back to graph, with a warning, when a pre-existing Graph deployment has all three vars', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(resolveEmailProviderName(env(GRAPH_ENV))).toBe('graph')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toContain('EMAIL_PROVIDER')
    } finally {
      warn.mockRestore()
    }
  })
})

describe('EMAIL_PROVIDER is set to something unknown', () => {
  it('throws, quoting the bad value and listing the valid ones', () => {
    expect(() => resolveEmailProviderName(env({ EMAIL_PROVIDER: 'sendgrid' }))).toThrow(
      /Unknown EMAIL_PROVIDER "sendgrid".*resend, smtp, graph/
    )
  })

  it('does not fall back to graph even when the Graph credentials are present', () => {
    expect(() =>
      resolveEmailProviderName(env({ EMAIL_PROVIDER: 'sendgrid', ...GRAPH_ENV }))
    ).toThrow(EmailConfigurationError)
  })

  it('accepts a value with stray case and whitespace', () => {
    expect(
      resolveEmailProviderName(env({ EMAIL_PROVIDER: '  Resend ' }))
    ).toBe('resend')
  })
})

describe('a selected provider whose own credentials are missing', () => {
  it.each([
    ['resend', {}, 'RESEND_API_KEY'],
    ['smtp', {}, 'SMTP_HOST'],
    ['graph', {}, 'MICROSOFT_TENANT_ID'],
    ['graph', { MICROSOFT_TENANT_ID: 't', MICROSOFT_CLIENT_ID: 'c' }, 'MICROSOFT_CLIENT_SECRET'],
  ])('EMAIL_PROVIDER=%s fails loudly and names %s', (provider, extra, expected) => {
    let thrown: unknown
    try {
      createEmailProvider(env({ EMAIL_PROVIDER: provider, ...(extra as object) }))
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(EmailConfigurationError)
    expect((thrown as Error).message).toContain(expected)
    expect((thrown as Error).message).toContain(provider)
  })

  it('rejects half-configured SMTP credentials', () => {
    expect(() =>
      createEmailProvider(env({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_USER: 'u' }))
    ).toThrow(/SMTP_PASSWORD/)
    expect(() =>
      createEmailProvider(env({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_PASSWORD: 'p' }))
    ).toThrow(/SMTP_USER/)
  })

  it('rejects a non-numeric SMTP_PORT', () => {
    expect(() =>
      createEmailProvider(env({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_PORT: 'five' }))
    ).toThrow(/SMTP_PORT/)
  })
})

describe('a fully configured provider', () => {
  it.each([
    ['resend', { RESEND_API_KEY: 'k' }],
    ['smtp', { SMTP_HOST: 'smtp.example.test' }],
    ['graph', GRAPH_ENV],
  ])('EMAIL_PROVIDER=%s builds that adapter', (provider, extra) => {
    const built = createEmailProvider(env({ EMAIL_PROVIDER: provider, ...(extra as object) }))
    expect(built.name).toBe(provider)
  })

  it('memoises the provider for identical configuration', () => {
    const config = env({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' })
    expect(getEmailProvider(config)).toBe(getEmailProvider(config))
  })

  it('rebuilds when the configuration changes', () => {
    const first = getEmailProvider(env({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k1' }))
    const second = getEmailProvider(env({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k2' }))
    expect(first).not.toBe(second)
  })
})

describe('checkEmailConfiguration', () => {
  it('reports the resolved provider when configuration is complete', () => {
    expect(checkEmailConfiguration(env({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' }))).toEqual({
      configured: true,
      provider: 'resend',
    })
  })

  it('reports the failure instead of throwing, so a handler can answer 503', () => {
    const status = checkEmailConfiguration(env({}))
    expect(status.configured).toBe(false)
    if (!status.configured) {
      expect(status.error).toContain('EMAIL_PROVIDER')
    }
  })
})

describe('recipientBatchSize', () => {
  it('gives each transport a batch size inside its own recipient limit', () => {
    expect(recipientBatchSize('graph')).toBe(500)
    expect(recipientBatchSize('resend')).toBe(50)
    expect(recipientBatchSize('smtp')).toBe(100)
  })
})
