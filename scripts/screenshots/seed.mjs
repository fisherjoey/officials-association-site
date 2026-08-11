#!/usr/bin/env node
/**
 * Seed a LOCAL Supabase stack with fictional demo data for the README
 * screenshots.
 *
 * Everything this writes is invented. The association, the people, the emails
 * and the phone numbers do not exist:
 *
 *   - all mail is @example.org, reserved by RFC 2606 and unable to belong to
 *     anyone
 *   - all phone numbers are in the 555-01xx range, reserved for fiction
 *   - the association, its members and its documents are made up
 *
 * Keep it that way. These rows end up in images committed to a public repo, and
 * the secret scan reads text, not pixels.
 *
 * Refuses to run against anything but a loopback Supabase URL, because it
 * deletes every row in the tables it seeds.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service role key> \
 *   node scripts/screenshots/seed.mjs
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(url.replace(/\/$/, ''))) {
  console.error(`Refusing to seed ${url}: this script truncates tables and only runs against a local stack.`)
  process.exit(1)
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const PASSWORD = 'demo-portal-password'

/** Everyone in the screenshots. All invented. */
const PEOPLE = [
  { name: 'Alina Vosberg',    email: 'alina.vosberg@example.org',    role: 'admin',     level: 'Level 4', rank: 1,  login: true },
  { name: 'Marcus Trelane',   email: 'marcus.trelane@example.org',   role: 'executive', level: 'Level 4', rank: 2,  login: true },
  { name: 'Priya Ashworth',   email: 'priya.ashworth@example.org',   role: 'official',  level: 'Level 3', rank: 3,  login: true },
  { name: 'Tomas Kirilenko',  email: 'tomas.kirilenko@example.org',  role: 'official',  level: 'Level 3', rank: 4 },
  { name: 'Nadia Bellweather', email: 'nadia.bellweather@example.org', role: 'official', level: 'Level 2', rank: 5 },
  { name: 'Owen Castellanos', email: 'owen.castellanos@example.org', role: 'official',  level: 'Level 2', rank: 6 },
  { name: 'Grace Mbeki',      email: 'grace.mbeki@example.org',      role: 'official',  level: 'Level 2', rank: 7 },
  { name: 'Hugo Fenwick',     email: 'hugo.fenwick@example.org',     role: 'official',  level: 'Level 1', rank: 8 },
  { name: 'Simone Draeger',   email: 'simone.draeger@example.org',   role: 'official',  level: 'Level 1', rank: 9 },
  { name: 'Jonah Petrakis',   email: 'jonah.petrakis@example.org',   role: 'official',  level: 'Level 1', rank: 10 },
  { name: 'Rhea Sandoval',    email: 'rhea.sandoval@example.org',    role: 'official',  level: 'Level 2', rank: 11 },
  { name: 'Callum Ashgrove',  email: 'callum.ashgrove@example.org',  role: 'official',  level: 'Level 1', rank: 12, status: 'inactive' },
]

const phone = (i) => `(555) 01${String(20 + i).padStart(2, '0')}`

/** Dates are relative so a regenerated set never looks stale. */
const day = (offset) => {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}
const iso = (offset) => day(offset).toISOString()
const dateOnly = (offset) => iso(offset).slice(0, 10)

async function clearTables() {
  const tables = [
    'evaluations', 'member_activities', 'members',
    'public_news', 'public_training_events', 'public_resources', 'public_pages',
    'officials', 'executive_team',
    'announcements', 'calendar_events', 'newsletters', 'resources',
    'rule_modifications', 'scheduler_updates',
    'contact_submissions', 'osa_submissions',
  ]
  for (const table of tables) {
    const { error } = await db.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) throw new Error(`clearing ${table}: ${error.message}`)
  }
}

async function clearAuthUsers() {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  for (const user of data.users) {
    await db.auth.admin.deleteUser(user.id)
  }
}

async function seedPeople() {
  const rows = []
  for (const [i, person] of PEOPLE.entries()) {
    let userId = null
    if (person.login) {
      const { data, error } = await db.auth.admin.createUser({
        email: person.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: person.name },
        app_metadata: { role: person.role },
      })
      if (error) throw new Error(`creating auth user ${person.email}: ${error.message}`)
      userId = data.user.id
    }
    rows.push({
      user_id: userId,
      name: person.name,
      email: person.email,
      phone: phone(i),
      certification_level: person.level,
      rank: person.rank,
      status: person.status || 'active',
      role: person.role,
      city: 'Riverbend',
      province: 'Example Region',
      postal_code: 'X0X 0X0',
      emergency_contact_name: 'Emergency Contact (demo)',
      emergency_contact_phone: phone(i + 40),
    })
  }
  const { data, error } = await db.from('members').insert(rows).select()
  if (error) throw new Error(`inserting members: ${error.message}`)
  return data
}

async function seedActivitiesAndEvaluations(members) {
  const byEmail = Object.fromEntries(members.map((m) => [m.email, m]))
  const evaluator = byEmail['marcus.trelane@example.org']

  const activities = members.slice(0, 8).flatMap((m, i) => ([
    {
      member_id: m.id,
      activity_type: 'game',
      activity_date: dateOnly(-7 - i),
      notes: 'Senior league, two-person crew.',
      activity_data: { league: 'Riverbend Senior League', position: 'Referee' },
    },
    {
      member_id: m.id,
      activity_type: 'training',
      activity_date: dateOnly(-21 - i),
      notes: 'Pre-season rules refresher.',
      activity_data: { hours: 3 },
    },
  ]))
  const { error: actErr } = await db.from('member_activities').insert(activities)
  if (actErr) throw new Error(`inserting activities: ${actErr.message}`)

  const evaluations = members.slice(2, 7).map((m, i) => ({
    member_id: m.id,
    evaluator_id: evaluator?.id ?? null,
    evaluation_date: dateOnly(-10 - i * 4),
    title: `Mid-season evaluation — ${m.name}`,
    file_name: `evaluation-${m.name.toLowerCase().replace(/\W+/g, '-')}.pdf`,
    file_url: '/documents/Officiating-Services-Agreement.pdf',
    notes: 'Placeholder evaluation record. Positioning and pre-game routine reviewed.',
  }))
  const { error: evalErr } = await db.from('evaluations').insert(evaluations)
  if (evalErr) throw new Error(`inserting evaluations: ${evalErr.message}`)
}

async function seedPublicContent() {
  const news = [
    {
      title: 'Registration opens for the coming season',
      slug: 'registration-opens',
      published_date: iso(-2),
      author: 'Riverbend Officials Association Executive',
      excerpt: 'Returning and new officials can now register for the season. Clinics start in three weeks.',
      body: '<p>Registration is open for returning and new officials. Fees, clinic dates and the certification pathway are all listed on the training page.</p><p>New officials should book an entry clinic before their first assignment.</p>',
      featured: true,
      priority: 10,
      tags: ['registration', 'season'],
      active: true,
    },
    {
      title: 'Rules refresher: what changed this year',
      slug: 'rules-refresher',
      published_date: iso(-9),
      author: 'Education Committee',
      excerpt: 'A short walkthrough of the rule changes taking effect this season and how they will be called.',
      body: '<p>Three rule changes take effect this season. Each is covered in the refresher clinic, and the summary sheet is in the members portal under Resources.</p>',
      priority: 5,
      tags: ['rules', 'education'],
      active: true,
    },
    {
      title: 'Mentorship pairings for new officials',
      slug: 'mentorship-pairings',
      published_date: iso(-18),
      author: 'Riverbend Officials Association Executive',
      excerpt: 'Every official in their first season is paired with a mentor for on-court feedback.',
      body: '<p>First-year officials are paired with a mentor who attends two of their games and files a short written report afterwards.</p>',
      priority: 0,
      tags: ['mentorship'],
      active: true,
    },
  ]
  const { error: newsErr } = await db.from('public_news').insert(news)
  if (newsErr) throw new Error(`inserting public_news: ${newsErr.message}`)

  const training = [
    {
      title: 'Entry-level certification clinic',
      slug: 'entry-level-clinic',
      event_date: iso(14),
      start_time: '18:00',
      end_time: '21:00',
      location: 'Riverbend Community Centre, Court 2',
      event_type: 'certification',
      description: 'Two evenings covering mechanics, the rulebook and game management for officials in their first season.',
      instructor: 'Marcus Trelane',
      max_participants: 24,
      current_registrations: 11,
      requirements: 'Whistle, running shoes, a copy of the rulebook.',
      active: true,
      priority: 10,
    },
    {
      title: 'Pre-season rules refresher',
      slug: 'preseason-refresher',
      event_date: iso(26),
      start_time: '19:00',
      end_time: '21:00',
      location: 'Riverbend Community Centre, Meeting Room A',
      event_type: 'refresher',
      description: 'Mandatory for all returning officials. Covers this season’s rule changes and the points of emphasis.',
      instructor: 'Alina Vosberg',
      max_participants: 60,
      current_registrations: 38,
      active: true,
      priority: 5,
    },
    {
      title: 'Advanced positioning workshop',
      slug: 'advanced-positioning',
      event_date: iso(45),
      start_time: '09:00',
      end_time: '15:00',
      location: 'Northside Sportsplex',
      event_type: 'workshop',
      description: 'Three-person mechanics, rotation timing and off-ball coverage, on court with video review.',
      instructor: 'Priya Ashworth',
      max_participants: 18,
      current_registrations: 6,
      active: true,
    },
  ]
  const { error: trainErr } = await db.from('public_training_events').insert(training)
  if (trainErr) throw new Error(`inserting public_training_events: ${trainErr.message}`)

  const resources = [
    {
      title: 'Officiating services agreement',
      slug: 'officiating-services-agreement',
      category: 'Forms',
      description: 'The agreement leagues and tournaments sign when booking officials through the association.',
      file_url: '/documents/Officiating-Services-Agreement.pdf',
      last_updated: iso(-30),
      access_level: 'public',
      featured: true,
      priority: 10,
      active: true,
    },
    {
      title: 'Fee schedule',
      slug: 'fee-schedule',
      category: 'Policies',
      description: 'Game fees by level and travel, effective this season.',
      file_url: '/documents/Fee-Schedule.pdf',
      last_updated: iso(-30),
      access_level: 'public',
      priority: 5,
      active: true,
    },
    {
      title: 'League scheduling template',
      slug: 'league-scheduling-template',
      category: 'Forms',
      description: 'Spreadsheet leagues fill in when requesting officials for a full season.',
      file_url: '/documents/League-Scheduling-Template.xlsx',
      last_updated: iso(-60),
      access_level: 'public',
      active: true,
    },
    {
      title: 'New official handbook',
      slug: 'new-official-handbook',
      category: 'Guides',
      description: 'What to expect in your first season: certification, assignments, pay and mentorship.',
      external_link: 'https://example.org/handbook',
      last_updated: iso(-12),
      access_level: 'public',
      active: true,
    },
  ]
  const { error: resErr } = await db.from('public_resources').insert(resources)
  if (resErr) throw new Error(`inserting public_resources: ${resErr.message}`)

  const { error: pageErr } = await db.from('public_pages').insert([{
    page_name: 'about',
    title: 'About the association',
    content: [
      '<h2>Our history</h2>',
      '<p>Riverbend Officials Association was founded in 1994 by a handful of officials who wanted the local game to have consistent, trained officiating. It has run continuously since.</p>',
      '<p>The association now has around 240 active officials working everything from youth recreational leagues to provincial competition, and it runs the training, certification and evaluation those officials need.</p>',
      '<h2>How we work</h2>',
      '<p>Officials are certified against the national standard, assigned through the association, and evaluated at least once a season. Leagues and tournaments book through a single request form rather than approaching officials directly.</p>',
    ].join(''),
    meta_description: 'History, mission and structure of the Riverbend Officials Association.',
    last_edited_by: 'alina.vosberg@example.org',
    active: true,
  }])
  if (pageErr) throw new Error(`inserting public_pages: ${pageErr.message}`)

  const executive = [
    { name: 'Alina Vosberg',  position: 'President',            email: 'president@example.org', priority: 10, active: true, bio: 'Level 4 official, on the executive since 2016.' },
    { name: 'Marcus Trelane', position: 'Vice President',       email: 'secretary@example.org', priority: 9,  active: true, bio: 'Runs the education and certification program.' },
    { name: 'Grace Mbeki',    position: 'Treasurer',            email: 'treasurer@example.org', priority: 8,  active: true, bio: 'Handles fees, invoicing and the annual budget.' },
    { name: 'Hugo Fenwick',   position: 'Assignor',             email: 'scheduler@example.org', priority: 7,  active: true, bio: 'Assigns officials across every league the association serves.' },
    { name: 'Rhea Sandoval',  position: 'Member Services',      email: 'memberservices@example.org', priority: 6, active: true, bio: 'First point of contact for members and new applicants.' },
  ]
  const { error: execErr } = await db.from('executive_team').insert(executive)
  if (execErr) throw new Error(`inserting executive_team: ${execErr.message}`)
}

async function seedPortalContent() {
  const announcements = [
    {
      title: 'Season assignments go live Monday',
      content: 'First-half assignments are published in the assigning system on Monday morning. Check your availability before then — changes after publication have to go through the assignor.',
      type: 'announcement',
      category: 'scheduling',
      priority: 'high',
      author: 'Hugo Fenwick',
      audience: ['official', 'executive', 'admin'],
      date: iso(-1),
      expires: iso(30),
    },
    {
      title: 'Refresher clinic attendance is mandatory',
      content: 'Every returning official has to attend one refresher clinic before their first assignment. Two dates are on the calendar.',
      type: 'notice',
      category: 'education',
      priority: 'normal',
      author: 'Marcus Trelane',
      audience: ['official'],
      date: iso(-6),
    },
  ]
  const { error: annErr } = await db.from('announcements').insert(announcements)
  if (annErr) throw new Error(`inserting announcements: ${annErr.message}`)

  const events = [
    {
      title: 'Entry-level certification clinic',
      type: 'training',
      description: 'Evening one of two.',
      location: 'Riverbend Community Centre, Court 2',
      instructor: 'Marcus Trelane',
      max_participants: 24,
      start_date: iso(14),
      end_date: iso(14),
      created_by: 'alina.vosberg@example.org',
    },
    {
      title: 'Executive meeting',
      type: 'meeting',
      description: 'Monthly executive meeting. Agenda circulated the week before.',
      location: 'Online',
      start_date: iso(7),
      end_date: iso(7),
      created_by: 'alina.vosberg@example.org',
    },
    {
      title: 'Riverbend Invitational',
      type: 'tournament',
      description: 'Three-day tournament, crews of three.',
      location: 'Northside Sportsplex',
      start_date: iso(35),
      end_date: iso(37),
      created_by: 'hugo.fenwick@example.org',
    },
  ]
  const { error: evErr } = await db.from('calendar_events').insert(events)
  if (evErr) throw new Error(`inserting calendar_events: ${evErr.message}`)

  const { error: nlErr } = await db.from('newsletters').insert([
    {
      title: 'The Whistle — season opener',
      date: dateOnly(-4),
      description: 'Assignments, the new rule changes, and three officials on what they learned in their first season.',
      file_name: 'the-whistle-season-opener.pdf',
      file_url: '/documents/Invoice-Policy.pdf',
      file_size: 482000,
      is_featured: true,
      uploaded_by: 'alina.vosberg@example.org',
    },
    {
      title: 'The Whistle — off-season edition',
      date: dateOnly(-95),
      description: 'Year in review, the AGM summary, and next season’s certification calendar.',
      file_name: 'the-whistle-off-season.pdf',
      file_url: '/documents/Fee-Schedule.pdf',
      file_size: 391000,
      uploaded_by: 'alina.vosberg@example.org',
    },
  ])
  if (nlErr) throw new Error(`inserting newsletters: ${nlErr.message}`)

  const { error: rsErr } = await db.from('resources').insert([
    {
      title: 'Two-person mechanics manual',
      description: 'Positioning, coverage and rotation for two-person crews.',
      category: 'Training Materials',
      resource_type: 'document',
      file_url: '/documents/Officiating-Services-Agreement.pdf',
      file_name: 'two-person-mechanics.pdf',
      original_name: 'two-person-mechanics.pdf',
      file_size: 1240000,
      mime_type: 'application/pdf',
      access_level: 'members',
      is_featured: true,
      active: true,
      uploaded_by: 'marcus.trelane@example.org',
    },
    {
      title: 'Game report form',
      description: 'Filed after any ejection or incident.',
      category: 'Forms',
      resource_type: 'document',
      file_url: '/documents/Invoice-Policy.pdf',
      file_name: 'game-report-form.pdf',
      original_name: 'game-report-form.pdf',
      file_size: 210000,
      mime_type: 'application/pdf',
      access_level: 'members',
      active: true,
      uploaded_by: 'alina.vosberg@example.org',
    },
    {
      title: 'Fee schedule',
      description: 'Game fees by level, plus travel and tournament rates.',
      category: 'Policies',
      resource_type: 'document',
      file_url: '/documents/Fee-Schedule.pdf',
      file_name: 'fee-schedule.pdf',
      original_name: 'fee-schedule.pdf',
      file_size: 180000,
      mime_type: 'application/pdf',
      access_level: 'members',
      active: true,
      uploaded_by: 'grace.mbeki@example.org',
    },
  ])
  if (rsErr) throw new Error(`inserting resources: ${rsErr.message}`)

  const { error: rmErr } = await db.from('rule_modifications').insert([
    {
      slug: 'riverbend-youth-league',
      title: 'Riverbend Youth League',
      category: 'League',
      summary: 'Running clock in the first three quarters, no full-court press once a team leads by 20.',
      content: '<p>The youth league runs a modified game. Quarters one to three use a running clock stopped only for timeouts and injuries. Full-court pressing stops when a team leads by twenty or more.</p>',
      approved_by: 'Riverbend Officials Association Executive',
      effective_date: dateOnly(-40),
      date: iso(-40),
      priority: 10,
      active: true,
    },
    {
      slug: 'riverbend-invitational',
      title: 'Riverbend Invitational',
      category: 'Tournament',
      summary: 'Pool play uses 8-minute quarters; bracket play reverts to the standard rulebook.',
      content: '<p>Pool games are shortened to eight-minute quarters with one timeout per half. Bracket games follow the standard rulebook with no modifications.</p>',
      approved_by: 'Riverbend Officials Association Executive',
      effective_date: dateOnly(-15),
      date: iso(-15),
      priority: 5,
      active: true,
    },
  ])
  if (rmErr) throw new Error(`inserting rule_modifications: ${rmErr.message}`)

  const { error: suErr } = await db.from('scheduler_updates').insert([
    {
      title: 'Availability deadline is Friday',
      content: 'Set your availability in the assigning system before Friday. Anything left blank is treated as unavailable for the first block of games.',
      author: 'Hugo Fenwick',
      date: iso(-3),
    },
    {
      title: 'Turnbacks now need 72 hours notice',
      content: 'Turning back an assignment inside 72 hours means calling the assignor directly rather than releasing it in the system.',
      author: 'Hugo Fenwick',
      date: iso(-12),
    },
  ])
  if (suErr) throw new Error(`inserting scheduler_updates: ${suErr.message}`)
}

async function main() {
  console.log(`Seeding ${url} with fictional demo data.`)
  await clearAuthUsers()
  await clearTables()
  const members = await seedPeople()
  await seedActivitiesAndEvaluations(members)
  await seedPublicContent()
  await seedPortalContent()
  console.log(`Seeded ${members.length} members. Portal logins use the password: ${PASSWORD}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
