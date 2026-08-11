// Branded HTML email wrapper.
//
// Every organisation-specific string in here comes from lib/siteConfig.ts, so
// an adopter changes the name, tagline, location, logo and URLs in one place
// and every transactional email follows.

import {
  ORG_NAME,
  ORG_SHORT_NAME,
  ORG_TAGLINE,
  ORG_LOCATION,
  SITE_URL,
  ORG_LOGO_URL,
  PORTAL_FEATURES,
  getPortalUrl,
  getContactUrl,
  getCopyrightYear,
} from './siteConfig'

/**
 * Palette for the email wrapper.
 *
 * These live here rather than in siteConfig because siteConfig is a plain
 * text/URL configuration surface and mail clients need literal hex in inline
 * styles — no CSS variables, no Tailwind. Change these four values and the
 * whole email shell re-skins.
 */
export const EMAIL_BRAND = {
  /** Header and footer background. */
  shell: '#1f2937',
  /** Accent: rules, buttons, links. */
  accent: '#F97316',
  /** Table headings and other secondary emphasis. */
  secondary: '#003DA5',
  /** Page background behind the message card. */
  page: '#f5f5f5',
} as const

export interface EmailTemplateOptions {
  subject: string
  content: string
  previewText?: string
  previewMode?: boolean // When true, uses dark outer background for preview display
  external?: boolean // When true, hides Member Portal link and member-specific footer text
}

export function generateEmailTemplate(options: EmailTemplateOptions): string {
  const { subject, content, previewText, previewMode, external } = options
  const outerBgColor = previewMode ? EMAIL_BRAND.shell : EMAIL_BRAND.page

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${subject}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <!--[if mso | IE]>
  <style>
    /* Force Outlook to respect background colors */
    .email-container { background-color: #ffffff !important; }
  </style>
  <![endif]-->
  <style>
    /* Prevent dark mode color inversion in Outlook/Windows Mail */
    :root {
      color-scheme: light;
      supported-color-schemes: light;
    }
    /* Dark mode meta override */
    [data-ogsc] body,
    [data-ogsb] body {
      background-color: ${outerBgColor} !important;
    }
    /* Force light mode on content area */
    [data-ogsc] .email-content,
    [data-ogsb] .email-content {
      background-color: #ffffff !important;
      color: #333333 !important;
    }
    /* Outlook.com dark mode overrides */
    [data-ogsc] h1, [data-ogsc] h2, [data-ogsc] h3,
    [data-ogsb] h1, [data-ogsb] h2, [data-ogsb] h3 {
      color: ${EMAIL_BRAND.shell} !important;
    }
    [data-ogsc] p, [data-ogsc] li, [data-ogsc] td,
    [data-ogsb] p, [data-ogsb] li, [data-ogsb] td {
      color: #333333 !important;
    }
    [data-ogsc] a, [data-ogsb] a {
      color: ${EMAIL_BRAND.accent} !important;
    }
    /* Base styles - these serve as fallbacks for email clients that support <style> */
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: ${outerBgColor};
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    /* Content typography */
    h1 {
      color: ${EMAIL_BRAND.shell};
      font-size: 24px;
      margin-top: 0;
      margin-bottom: 16px;
      font-weight: 700;
      line-height: 1.3;
    }
    h2 {
      color: ${EMAIL_BRAND.shell};
      font-size: 20px;
      margin-top: 24px;
      margin-bottom: 12px;
      font-weight: 600;
      border-bottom: 2px solid ${EMAIL_BRAND.accent};
      padding-bottom: 8px;
    }
    h3 {
      color: ${EMAIL_BRAND.shell};
      font-size: 18px;
      margin-top: 20px;
      margin-bottom: 10px;
      font-weight: 600;
    }
    p {
      margin: 0 0 16px 0;
      font-size: 16px;
      line-height: 1.6;
    }
    ul, ol {
      margin: 0 0 16px 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 8px;
      font-size: 16px;
      line-height: 1.5;
    }
    a {
      color: ${EMAIL_BRAND.accent};
      text-decoration: underline;
    }
    strong {
      color: ${EMAIL_BRAND.shell};
      font-weight: 600;
    }
    /* Tables in content */
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background-color: ${EMAIL_BRAND.secondary};
      color: #ffffff;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
    }
    td {
      padding: 10px 12px;
      border: 1px solid #E5E7EB;
      font-size: 14px;
    }
    blockquote {
      border-left: 4px solid ${EMAIL_BRAND.accent};
      background-color: #FFF7ED;
      padding: 12px 16px;
      margin: 16px 0;
      font-style: italic;
    }
    /* Button - mobile-friendly with larger tap target */
    .button {
      display: inline-block;
      padding: 14px 28px;
      min-height: 44px;
      background-color: ${EMAIL_BRAND.accent};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 16px 0;
      text-align: center;
    }
    /* Responsive adjustments for clients that support media queries */
    @media only screen and (max-width: 480px) {
      h1 {
        font-size: 22px !important;
      }
      h2 {
        font-size: 18px !important;
      }
      .button {
        display: block !important;
        width: 100% !important;
        padding: 16px 20px !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div>` : ''}

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${outerBgColor};">
    <tr>
      <td style="padding: 20px 10px;">
        <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; margin: 0 auto; background-color: #ffffff;" align="center">

          <!-- Header -->
          <tr>
            <td style="background-color: ${EMAIL_BRAND.shell}; padding: 24px 20px; border-bottom: 3px solid ${EMAIL_BRAND.accent}; text-align: center;">
              <img src="${ORG_LOGO_URL}" alt="Logo" style="max-width: 70px; height: auto; display: inline-block; margin-bottom: 12px;">
              <h1 style="color: #ffffff; margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.3;">${ORG_NAME}</h1>
              <p style="color: #ffffff; margin: 0; font-size: 14px; font-weight: 500; opacity: 0.95;">${ORG_TAGLINE}</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td class="email-content" style="padding: 30px 20px; color: #333333; background-color: #ffffff; font-size: 16px; line-height: 1.6;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${EMAIL_BRAND.shell}; color: #D1D5DB; padding: 30px 20px; text-align: center; font-size: 14px; line-height: 1.7; border-top: 3px solid ${EMAIL_BRAND.accent};">
              <p style="margin: 0 0 10px 0; font-weight: 600; color: #ffffff;">${ORG_NAME}</p>
              <p style="margin: 0 0 15px 0;">${ORG_LOCATION}</p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 20px auto;">
                <tr>
                  <td style="padding: 0 8px;">
                    <a href="${SITE_URL}" style="color: ${EMAIL_BRAND.accent}; text-decoration: none; font-size: 14px;">Website</a>
                  </td>
                  ${external ? `
                  <td style="padding: 0 8px;">
                    <a href="${getContactUrl()}" style="color: ${EMAIL_BRAND.accent}; text-decoration: none; font-size: 14px;">Contact Us</a>
                  </td>
                  ` : `
                  <td style="padding: 0 8px;">
                    <a href="${getPortalUrl()}" style="color: ${EMAIL_BRAND.accent}; text-decoration: none; font-size: 14px;">Member Portal</a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="${getContactUrl('general')}" style="color: ${EMAIL_BRAND.accent}; text-decoration: none; font-size: 14px;">Contact Us</a>
                  </td>
                  `}
                </tr>
              </table>

              ${external ? `
              <p style="margin: 20px 0 10px 0; font-size: 13px; color: #9ca3af;">
                You are receiving this email because you submitted a request through our website.
              </p>
              ` : `
              <p style="margin: 20px 0 10px 0; font-size: 13px; color: #9ca3af;">
                You are receiving this email because you are a member of ${ORG_NAME}.
              </p>
              `}

              <p style="margin: 0; font-size: 13px; color: #9ca3af;">
                &copy; ${getCopyrightYear()} ${ORG_NAME}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Rendered examples, used to eyeball the wrapper without sending mail.
 *
 * The copy is deliberately generic and built from siteConfig — these used to
 * carry one organisation's name, city, venues and a named individual.
 */
export const sampleEmails = {
  announcement: generateEmailTemplate({
    subject: 'Upcoming training session',
    previewText: `An upcoming training session from ${ORG_SHORT_NAME}...`,
    content: `
      <h1>Upcoming training session</h1>

      <p>Hello,</p>

      <p>${ORG_NAME} is running a <strong>certification clinic</strong> next month.</p>

      <h2>Details</h2>
      <ul>
        <li><strong>Date:</strong> To be confirmed</li>
        <li><strong>Time:</strong> To be confirmed</li>
        <li><strong>Location:</strong> ${ORG_LOCATION}</li>
      </ul>

      <p style="text-align: center;">
        <a href="${getPortalUrl()}" class="button">Register</a>
      </p>

      <p>Space is limited, so register early.</p>

      <p>Best regards,<br>
      <strong>${ORG_SHORT_NAME}</strong></p>
    `
  }),

  newsletter: generateEmailTemplate({
    subject: `${PORTAL_FEATURES.newsletter}`,
    previewText: `Your latest update from ${ORG_SHORT_NAME}...`,
    content: `
      <h1>${PORTAL_FEATURES.newsletter}</h1>

      <p>Welcome to this edition of ${PORTAL_FEATURES.newsletter}.</p>

      <h2>What's new</h2>
      <ul>
        <li><strong>New members:</strong> a warm welcome to everyone who joined this month</li>
        <li><strong>Season:</strong> the next season is being scheduled now</li>
        <li><strong>Rules:</strong> the latest rule modifications are posted in the portal</li>
      </ul>

      <h2>${PORTAL_FEATURES.resources}</h2>
      <p>${PORTAL_FEATURES.resourcesDescription}.</p>

      <p style="text-align: center;">
        <a href="${getPortalUrl()}" class="button">Visit the portal</a>
      </p>

      <p>Best regards,<br>
      <strong>${ORG_SHORT_NAME}</strong></p>
    `
  }),

  reminder: generateEmailTemplate({
    subject: 'Reminder: upcoming assignment',
    previewText: 'You have an upcoming assignment...',
    content: `
      <h1>Assignment reminder</h1>

      <p>Hi there,</p>

      <p>A reminder about your upcoming assignment:</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #f9fafb; border: 2px solid #e5e7eb;">
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Date:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">See the portal calendar</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">Time:</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">See the portal calendar</td>
        </tr>
        <tr>
          <td style="padding: 12px; font-weight: 600;">Venue:</td>
          <td style="padding: 12px;">See the portal calendar</td>
        </tr>
      </table>

      <p><strong>Please arrive 30 minutes early.</strong></p>

      <p>If you have a conflict, <a href="${getContactUrl('scheduling')}">contact the scheduler</a> as soon as you can.</p>

      <p style="text-align: center;">
        <a href="${getPortalUrl()}" class="button">View the schedule</a>
      </p>

      <p>Best regards,<br>
      <strong>${ORG_SHORT_NAME}</strong></p>
    `
  })
}
