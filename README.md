# Officials Association Site

A public website and a members-only portal for a sports officials association, built on
Next.js 15, Supabase and Netlify Functions.

It assumes the shape of a real officials association: a roster of members with certification
levels and ranks, assignments and activity history, written evaluations, training events, a
document library, a newsletter, and an executive that has to publish news and rule
modifications without touching the code. The public site is what a league or a prospective
official sees. The portal behind the login is where the association runs itself.

This is a template, not a product. There is no hosted version, no support and no upgrade
path. You fork it, rebrand it, and it becomes your codebase.

**Read [Known gaps](#known-gaps) before you deploy this.** One of them is an authorisation
hole a stranger can walk through, and it is not fixed.

---

## Screenshots

These come from a local stack seeded with fictional demo data. The association, the people
and the documents in them do not exist. Regenerate the whole set with
`./scripts/screenshots/regenerate.sh` after a rebrand.

### Public site

| | |
|---|---|
| ![Home page](docs/screenshots/public-home.jpg) | ![About page](docs/screenshots/public-about.jpg) |
| Home: hero, tagline and the booking call to action. | About: the section the portal CMS writes, above the values grid. |
| ![News](docs/screenshots/public-news.jpg) | ![Contact form](docs/screenshots/public-contact.jpg) |
| News, built from the markdown in `content/news/`. | The contact form, routed by category to a role mailbox. |

### Members portal

![Portal dashboard](docs/screenshots/portal-dashboard.jpg)

The dashboard: announcements, upcoming events and scheduler updates. Which navigation items
and tiles appear depends on the signed-in member's role.

| | |
|---|---|
| ![Member directory](docs/screenshots/portal-members.jpg) | ![Public content admin](docs/screenshots/portal-public-content-admin.jpg) |
| The member directory, filtered by status, role, certification and city. | The public-content admin, which is the CMS. Training, resources, officials, executive team and page copy are edited here and published to the public site. News is drafted here and published as files. |

![Portal dashboard in dark mode](docs/screenshots/portal-dashboard-dark.jpg)

The portal ships a dark surface as a designed choice rather than an inverted stylesheet. It
is per-member and stored in `localStorage` under `portal-theme`.

![Configured services](docs/screenshots/portal-configured-services.jpg)

Quick links. The four tiles carrying an external-link icon (game assignments, film study,
member community, resource centre) render only when the matching value in
`lib/siteConfig.ts` is set. Leave one empty and the tile disappears instead of pointing at a
service you do not use.

### On a phone

Most members open this between games, on a phone.

| | |
|---|---|
| <img src="docs/screenshots/mobile-home.jpg" width="320" alt="Home page on a phone"> | <img src="docs/screenshots/mobile-portal-dashboard.jpg" width="320" alt="Portal dashboard on a phone"> |

---

## What's in it

### Public site

Everything a league or a prospective official sees. All of it is editable from the portal, so publishing does not mean a deploy.

Home, About with the executive team, and News. Training carries the certification pathway and a registration link per event. Resources is a document library with categories and access levels. Two recruitment pages, Become a referee and New officials. A "request officials" form feeds the service-request inbox in the portal, and a contact form routes by category to whichever mailbox you configure. Search covers every published page and article.

### Members portal

Behind the login, dark by default, with its own mobile layout.

The dashboard shows upcoming events, the latest announcement, the newsletter and scheduler updates. The member directory lists the roster with certification level, rank and contact details, filtered and searchable. Members edit their own profile, including emergency contact. There is a calendar of association events, plus the members' view of news and resources, which includes anything marked members-only.

### Admin

Content management covers public pages, training events, resources, the officials list and the executive team, with rich text and image upload. News is drafted in the same place but published from `content/news/`. Member management handles email invites, the accept-invite flow, and role and capability assignment. Two inboxes: service requests from the public form, and contact submissions.

### Optional modules

Eight features are on or off from one config block, and a disabled one is never built rather than hidden:

`evaluations` `statistics` `newsletter` `ruleModifications` `schedulerUpdates` `mail` `adminLogs` `adminEmailHistory`

A flag is not an access control. See [Optional modules](#optional-modules) for what it does and does not do.

### Underneath

Next.js 15, exported as a static site, with Netlify Functions behind it.

Supabase Postgres with 14 ordered migrations, row-level security on all 25 tables, and storage policies on five buckets. The chain refuses to run against a database that is not empty rather than half-applying to it.

Email goes through Resend, SMTP or Microsoft Graph, chosen by one environment variable. An unconfigured provider throws instead of silently dropping mail.

Roles are three structural rungs, member, executive and admin, plus capabilities that cut across them: evaluator, scheduler, instructor, assignor.

Rich text is Jodit, MIT licensed and self-hosted, so there is no editor account to create and no key to obtain.

386 tests, a type check, a lint job, a build that runs with no environment configured at all, and a link checker that fails on any dangling link in the export.

---

## This is a static export

`next.config.ts` sets `output: 'export'` for production builds. `npm run build` writes a
directory of HTML, CSS and JS to `out/`, and that is the whole front end. No Node server
renders pages on request.

Every page is prerendered at build time. No route uses `force-dynamic`, and adding one
breaks the build rather than degrading quietly. Pages ship with an empty state and fetch
from Supabase or from `/api/*` once they are in the browser, so first paint has no data in
it.

The backend is Netlify Functions. `netlify/functions/` holds 36 handlers, all running with
the Supabase service-role key, which makes them the place authorisation actually happens.
`netlify.toml` rewrites `/api/*` onto them.

The constraint that catches people out: a broken import or a wrong asset path ships as a
blank page or a silent 404, not a build failure. Look at the pages after a change. A green
build is not evidence. Dev mode renders dynamically, so something can work locally and still
be missing from the export.

`node scripts/check-exported-links.mjs` catches part of that after a build: it reads every
local `href` out of `out/` and fails on any that resolves to nothing. It is also why
switching a portal module off has to happen at build time rather than at request time, which
[Optional modules](#optional-modules) goes into.

`node scripts/check-news-render.mjs` is the news-specific companion. It fails if an article
file has no exported page, if the list links to anything other than those articles, or if a
body arrived as literal `##` characters instead of rendered markdown.

---

## Prerequisites

Node 18 or newer. `netlify.toml` pins `NODE_VERSION = "18"` for the deploy build, and the
no-env CI job runs on 22.

A Supabase project, free tier is enough to start. You need the project URL, the anon key and
the service-role key.

A Netlify account. The redirects, the functions and the build config are all Netlify
specific.

An email provider, because password resets, invitations and the contact form all send mail.
Pick one of Resend, SMTP or Microsoft Graph.

Docker and the Supabase CLI (already a devDependency) are optional. You only need them to
run a local database or to regenerate the screenshots.

---

## Supabase setup

### Migrations

`supabase/migrations/` holds fourteen files that build the whole schema: members, roles and
their RLS policies, portal content, evaluations, public content, invite tokens, email
history, logging, submissions, season stats, and the storage buckets with their policies.

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**The chain targets an empty database and refuses to run against anything else.** That is
not a convention written in a comment. The first migration opens with a preflight block that
raises before it has created, altered or dropped anything, if `public` already holds tables
the chain creates and the baseline stamp is absent. Because it is the first file, nothing
else has run either, so the database is left exactly as it was. There is no partially applied
state to unpick.

Applying the chain twice to the same database is a no-op rather than an error. What it will
not do is upgrade a database that got its schema somewhere else. If the guard fires, create
a fresh database, run the chain there, and move the data across. Do not hand-patch the old
one to get past the check.

To try it locally first:

```bash
npx supabase start
npx supabase db reset   # applies all fourteen against an empty database
```

### Storage buckets

The last migration in the chain creates five buckets and the policies that guard them. You do
not need to create anything in the dashboard.

| Bucket | Public | Reads | Writes |
|---|---|---|---|
| `email-images` | yes | anyone holding the object URL | admin, executive |
| `portal-resources` | no | any signed-in member | any signed-in member, but only the uploader or an admin or executive can change or remove an item |
| `newsletters` | no | any signed-in member | admin, executive |
| `training-materials` | no | any signed-in member | admin, executive |
| `evaluations` | no | whoever uploaded the file, plus admins and executives | any signed-in member |

`email-images` is public because those images are embedded in outgoing mail and the person
reading that mail in Gmail has no Supabase session. Public means anyone holding an object URL
can fetch the bytes. It does not mean the bucket can be browsed: listing goes through the same
policies as everything else, and no anonymous caller has a read policy anywhere in the file.
The other four are private, and for them RLS is the whole access model.

Every privilege check calls `public.is_admin_or_executive()`, the same helper the table
policies use, so storage and rows cannot drift apart when the role model changes. The
reasoning behind each bucket is written out at the top of
`supabase/migrations/20260810001400_storage_policies.sql`. Read that before you change one.

The migration is also what decides whether a bucket is public. Flip `portal-resources` to
public in the dashboard and the next `db push` flips it back. Change the migration instead.

`netlify/functions/upload-file.ts` holds the service-role key and bypasses all of this, so the
role check inside that function is still the only thing guarding the service-role path. The
policies protect the browser upload path in `lib/fileUpload.ts`, and they are what is left
underneath if someone makes a bucket public.

One thing they do not yet do is serve downloads. See [Known gaps](#known-gaps).

### Row-level security

The migrations enable RLS on every table and grant `anon`, `authenticated` and
`service_role` explicitly, so nothing relies on Supabase's legacy auto-exposure of new
tables. The shape is:

`members`. You can read your own row. Admins and executives can read everyone's. Nobody
writes this table from the browser: `authenticated` is granted SELECT and nothing else, so
every roster write goes through a function holding the service-role key. A trigger is the
second barrier, stopping an unprivileged session from setting or changing its own `role`,
`capabilities` or `user_id` on the day someone re-grants UPDATE.

`evaluations`. You can read the evaluations written about you. Admins, executives and anyone
holding the `evaluator` capability can read all of them. Admins, executives and evaluators can
write one; only admins and executives can edit or delete. `netlify/functions/evaluations.ts`
applies the same rule before a request reaches the database, and adds one thing a policy
cannot express: an evaluator may edit an evaluation they authored, which needs the author
joined back to the caller.

Public content (`public_news`, `public_training_events`, `public_resources`,
`public_pages`). Anyone can read the active rows, anonymous visitors included, because the
public site reads them straight from the browser. Admins and executives write.

Everything else is service-role only and reachable through the functions.

`public.structural_role(uid)` is the only function in the schema that reads `members.role`.
`public.is_admin(uid)` and `public.is_admin_or_executive(uid)` are thin wrappers over it, and
`public.has_capability(uid, cap)` answers the capability half. Those four are where the
policies ask who is calling.

### The role model

Two questions, deliberately kept in two columns.

**Structural role** is where someone sits: `member` < `executive` < `admin`. Ordered, one per
person.

**Capabilities** are what someone does: `evaluator`, `scheduler`, `instructor`, `assignor`,
`mentor`. Unordered, any number at once, independent of the ladder. A member can be an
evaluator. So can an executive.

Collapsing the two is what kept `evaluator` out of the database for so long. One ordered field
cannot say "a member, but also an evaluator" without inventing a rung for every combination,
and every new rung multiplies through every policy in the schema. Split apart, the policy is
one line: `has_capability(auth.uid(), 'evaluator')`.

`lib/roles.ts` is the definition. The UI, the Netlify Functions and the tests import from it,
and `__tests__/unit/config/roles.test.ts` reads
`supabase/migrations/20260810001500_role_model.sql` off disk and fails when the file and the
schema stop agreeing. That test is doing the real work here. The bug was never a missing
check; it was one idea written down in three places that could drift apart.

Two things you can change without writing SQL. Labels come from `NEXT_PUBLIC_ROLE_LABEL_*` and
`NEXT_PUBLIC_CAPABILITY_LABEL_*`, and nothing in SQL reads them, so calling your executives
"the board" is one line in `.env`. The capability list itself lives in `lib/roles.ts`: the
database constrains the shape of `members.capabilities` (lowercase identifiers, no duplicates)
and never its contents, and `has_capability()` compares whatever string it is handed, so
adding or renaming one needs no migration.

There is one exception, worth knowing before you rename anything. `evaluator` is written into
an RLS policy by hand, because a policy has to name the capability it is testing. Rename that
slug and the migration needs the new name too. The config test fails and says so rather than
letting the policy quietly stop matching.

The structural ladder is enumerated by a CHECK constraint, so renaming one of those three is a
migration. They are the org chart, so that should be rare.

`official` was the old name for `member`. It is still accepted on the way in, so an auth user
carrying `app_metadata.role = 'official'` resolves to a member, but it is no longer a value
the database will store.

### Auth configuration

Supabase Auth with email and password. In the dashboard:

Set **Site URL** to your production origin.

Add `<your origin>/auth/callback` to **Redirect URLs**. `getAuthCallbackUrl()` in
`lib/siteConfig.ts` builds that path and takes no arguments on purpose. Threading user input
into it turns the login flow into an open redirect through Supabase's allow-listed domain.

Turn off self-service signup, unless you have read [Known gaps](#known-gaps) and fixed the
role-resolution hole. With signup on, anyone can create an account and then grant themselves
admin.

Roles live in the auth user's `app_metadata` and are mirrored onto the roster row.
`app_metadata.role` is the structural rung (`member`, `executive`, `admin`) and
`app_metadata.capabilities` is an array of grants (`evaluator`, `scheduler`, `instructor`,
`assignor`, `mentor`). Only the service role can write `app_metadata`.

---

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. That file is the reference: every
variable this project reads is listed there with a comment saying what it does and what
happens if you leave it out. Duplicating it here would only let the two drift apart.

Two things worth repeating. Anything prefixed `NEXT_PUBLIC_` is compiled into the browser
bundle, so never put a secret behind that prefix. And on identity and branding values the
prefix is mandatory, not a house style: `lib/siteConfig.ts` explains why, but the short
version is that an unprefixed read resolves to `undefined` in the browser, so your server
render would carry the organisation's name while the client fell back to the placeholder.

Nothing is required to compile. `npm run build` succeeds with the environment completely
empty, and `.github/workflows/build-no-env.yml` checks that on every push, so a fork builds
before its owner has an account anywhere. What comes out is a site that talks to no database.
For a deploy people can actually use, the floor is `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; everything else falls back to a neutral placeholder.

---

## Local development

```bash
npm install
npx netlify dev
```

That gives you the site and the functions on one origin, with `/api/*` routed the way it is
in a deploy. Nearly every page needs it: the portal, resources, training and the contact
form all go through `/api`. `/news` does not, because it is built from files.

**It does not give you your data.** `netlify.toml` sets `[dev] command = "npm run dev"`, so
Netlify Dev starts the same `next dev` server and proxies it. `NODE_ENV` is `development` on
both paths, and `lib/api/client.ts` line 14 says:

```js
export const USE_MOCK_DATA =
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true' || process.env.NODE_ENV === 'development'
```

The member directory therefore renders fixtures out of `lib/mockData/` under `netlify dev`
exactly as it does under `npm run dev`, and setting `NEXT_PUBLIC_USE_MOCK_DATA=false` will not
turn that off, because the second clause is true on its own. You can point a fresh Supabase
project at this, open the member directory, watch it fill with people, and have learned
nothing about whether your wiring works. Those people are the fixtures.

To exercise the real thing, serve the production export:

```bash
npm run build
npx netlify dev --dir out --offline
```

`next build` runs under `NODE_ENV=production`, the fallback goes quiet, and every `/api` call
lands on a function talking to your database. That is the arrangement
`scripts/screenshots/regenerate.sh` uses, which is why the screenshots above show seeded rows
and not `lib/mockData/`. The cost is a rebuild per change: the export is static, so nothing
hot-reloads.

`npm run dev` on its own is the third option. Pages render on port 3000, `/api` is not there
at all, and the fixtures are still what you see. It is for styling.

To work against a local database instead of your Supabase project:

```bash
npx supabase start
npx supabase db reset
npx supabase status          # copy the API URL and keys into .env.local
```

Other scripts:

| Command | Does |
|---|---|
| `npm test` | Unit tests. 386 across 24 suites, no external services. |
| `npm run test:integration` | Integration tests against a real Supabase project. Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Creates and cleans up tagged rows and a couple of throwaway auth users. |
| `node scripts/check-exported-links.mjs` | Run after a build. Reads every local `href` out of `out/` and fails on any that resolves to nothing. |
| `npm run build` | The production static export, into `out/`. |
| `npx tsc --noEmit` | Type check. |
| `npm run lint` | ESLint, via `eslint.config.mjs` (`next/core-web-vitals`). Also runs as part of `npm run build`, since `next.config.ts` sets `eslint.ignoreDuringBuilds: false`. |

---

## Rebranding

`lib/siteConfig.ts` is the seam. Organisation name, short name, tagline, location, founding
year, member count, logo, colours, social links, external service links, mail domain and
portal feature labels all live there, and every one of them reads an optional
`NEXT_PUBLIC_*` variable before falling back to a placeholder.

So there are two ways to rebrand: edit the file, or set the variables. Setting the variables
keeps your diff against upstream empty, which matters if you ever want to pull changes down.

The shipped defaults are deliberately unfilled: "Your Officials Association", `example.org`,
empty social links. They are meant to look wrong on the rendered page so that anything you
missed is obvious. `example.org` is reserved by RFC 2606 and cannot belong to a real
organisation, so an unconfigured deploy cannot leak mail to a stranger.

### Colours

Set the five `NEXT_PUBLIC_BRAND_COLOR_*` variables. `tailwind.config.ts` imports
`BRAND_COLORS` and registers each as a `brand-*` utility, so `bg-brand-primary` follows
whatever you set. Tailwind generates its CSS at build time, so a colour change needs a
rebuild.

The portal's dark surfaces (`portal-bg`, `portal-surface`, `portal-border`, `portal-hover`,
`portal-accent`) are separate literals in `tailwind.config.ts`. They were picked as a set and
they are not a tint of your brand colour, so change them together or leave them alone.

### Assets

| Path | Used for |
|---|---|
| `public/images/logos/org-logo.png` | Header, footer, home-page hero, portal and auth screens. Override with `NEXT_PUBLIC_ORG_LOGO_URL`. Replace this one first: the placeholder has the initials "ROA" painted into the pixels, and no variable reaches them, so until you swap the file your own short name and the badge beside it disagree on every page. |
| `public/images/icons/` | Favicons, apple-touch icon, Android icons, web manifest. Paths are listed in `FAVICONS` in `lib/siteConfig.ts`. |
| `public/documents/` | Placeholder PDFs and spreadsheets: fee schedule, invoice policy, services agreement, scheduling templates. Replace with your own. |
| `content/` | Markdown seeded into the public site at build time. News articles, page copy, portal announcements, rule modifications, resource descriptions. |

Everything shipped in those directories is a neutral placeholder. None of it is anyone's
real document.

### What `lib/siteConfig.ts` does not reach

Some page copy is hardcoded, and no config change will touch it.

`components/ui/ElevateCTA.tsx` renders "200+ certified officials", "60+ years of excellence"
and "10,000+ games officiated annually" as literals on the home page.

`ORG_SPORT` defaults to `basketball` rather than to a placeholder, and deliberately so: page
copy under `app/` still names basketball certification levels and rulebooks in places no
config value reaches. Changing the variable is step one of a sport rebrand, not the whole
job.

The Blue Whistle Program pages (`app/new-officials/`, plus sections of
`app/become-a-referee/` and `app/about/`) describe a specific new-official initiative. Keep
it, rename it, or delete the route. The name is also a literal in the main navigation, at
`components/layout/Header.tsx` lines 110 and 153, so "Blue Whistles" sits on every public
page whether or not you keep the route behind it.

Grep for your old organisation's name after a rebrand. It is the only reliable check.

---

## Optional modules

Not every association wants the whole portal. Eight parts of it are switchable, in `MODULES`
in `lib/siteConfig.ts` or through the matching `NEXT_PUBLIC_MODULE_*` variables. Everything
ships on, so you can see what is there before deciding what to cut.

| Module | Route | What it is | What it needs | Why you might turn it off |
|---|---|---|---|---|
| `evaluations` | `/portal/evaluations` | Evaluators file reports on officials; executives read them and track who has been assessed. | The evaluations tables, plus members carrying the evaluator role. | Your association assesses people in person and nobody wants to retype it into a form. |
| `statistics` | `/portal/statistics` | Per-official game counts for a season, loaded from an Arbiter xlsx export. | The season-stats tables, and exports in the exact shape `lib/stats/arbiterGameInfo.ts` parses. | You do not use Arbiter. Note that nothing links to this route even when it is on, so it is the least missed of the eight. |
| `newsletter` | `/portal/newsletter` | A PDF archive with an in-page viewer, and the latest-issue widget on the dashboard. | Somewhere to upload the PDFs, and somebody willing to write them. | You do not publish one. |
| `ruleModifications` | `/portal/rule-modifications` | League-specific variations on the rulebook, written as markdown in `content/portal/rule-modifications/`. | Nothing beyond the content files. | Every league you serve plays the standard rules. |
| `schedulerUpdates` | `/portal/scheduler-updates` | Short notices from whoever assigns games, and the matching dashboard widget. | Nothing. | Your scheduler already reaches people by email, or through the assigning system's own announcements. |
| `mail` | `/portal/mail` | Compose and send to members, filtered by role. Admin and executive only. | A configured email provider (`EMAIL_PROVIDER` and its keys). | You send association mail from a list somewhere else. This is the first one to drop if you have not set up a provider. |
| `adminLogs` | `/portal/admin/logs` | Reader for the application log and audit trail. | The `logs` table and the `logs` function. | You would rather read them in the Supabase dashboard, where you can write a real query. |
| `adminEmailHistory` | `/portal/admin/email-history` | Every message the portal has sent, with delivery status. | The email-history table and its function. | Same reason, or you do not want a copy of the send history in the portal at all. |

### What "off" actually does

It stops the route being built. This is a static export, so there is no server standing by to
answer a request with a 404: a route is either sitting in `out/` as HTML or it does not
exist. Each optional route's page file is called `page.module-<key>.tsx` rather than
`page.tsx`, and `next.config.ts` only tells Next.js to treat that filename as a route when
the flag is on. Off, the file is never compiled, no chunk is emitted, and there is no
directory under `out/`. Netlify serves your 404 page to anyone who has the URL.

The navigation reads the same flags. `isRouteEnabled()` takes an href rather than a module
name, so the portal header, the dashboard tiles and the admin index all put the question to
one source instead of each keeping a list of their own. Two lists that have to agree is the
bug this design exists to avoid: a hidden link with a live route behind it is merely
confusing, but a live link with no route behind it is a 404 that a member finds for you.

Three things it does not do:

It is not access control. The Netlify Function and the Supabase table behind a disabled
module are untouched, and anyone who can authenticate can still reach the function directly.
Authorisation lives in `netlify/functions/` and in RLS, and that is where it stays. If you
need a capability gone rather than absent from the site, delete the function and revoke the
grants.

It is not a runtime switch. The flags are read once, while you build. Changing one means a
rebuild and a redeploy, and a browser holding the previous bundle keeps the previous
navigation until it reloads.

It does not delete anything. Rows stay in Supabase. Switch the module back on, rebuild, and
everything is where you left it.

One cosmetic oddity: the build summary reports a gated route's size as `0 B`. Next.js sizes
routes by looking for a file called `page`, and these are not called that. The chunk is built
and loaded like any other.

### Adding or removing one

To gate a route that is not on the list, add a key to `ModuleKey`, a flag to `MODULES` and an
entry to `PORTAL_MODULES` in `lib/siteConfig.ts`, then rename the route's `page.tsx` to
`page.module-<kebab-key>.tsx`. `__tests__/unit/config/modules.test.ts` fails if those four
drift apart, and the two `__tests__/unit/portal/moduleNav*.test.tsx` files fail if the
navigation stops asking.

To remove a route outright, delete its directory and every link to it, then rebuild and run
the link check:

```bash
npm run build && node scripts/check-exported-links.mjs
```

It pulls every `href` out of every exported page and asks the filesystem whether the target
resolves. It only sees prerendered markup, though, so it cannot check the portal navigation
at all: everything behind `AuthGuard` prerenders as a loading spinner. The two `moduleNav`
test files are what cover that half.

---

## Who gets into the portal

`app/portal/layout.tsx` wraps every portal page in one chain, and the order is load-bearing:

```
ThemeProvider → AuthProvider → AuthGuard → RoleProvider → MemberProvider → ToastProvider → MemberGuard
```

Two gates, asking different questions. `AuthGuard` asks whether somebody is logged in and
sends everyone else to the login page. `MemberGuard` asks whether that logged-in user has a
member record, and when they do not it renders the registration form inline instead of
redirecting.

The inline render is deliberate. Someone accepting an invitation and someone signing up on
their own both land on a portal route holding an account with no member row behind it, and
both get the same form in the same place. Redirecting would mean a separate registration
route, a way of remembering where they were going, and two flows to keep working instead of
one.

Leave the ordering alone. `RoleProvider` and `MemberProvider` both read the session that
`AuthProvider` establishes and `AuthGuard` has already vouched for, so moving either above
the guard gives you a provider reading a session that may not exist.

---

## Deploy

### Netlify

Connect the repository. There is almost nothing to fill in, because `netlify.toml` is
committed and **on Netlify the file overrides the dashboard**, not the other way round.
Whatever the toml sets is the value that runs, whatever the UI shows you: build command,
publish directory, functions directory, Node version, the `/api/*` rewrite, the security
headers.

| Setting | Value | Where it comes from |
|---|---|---|
| Build command | `npm install && npm run test:integration && npm run build` | `netlify.toml` |
| Publish directory | `out` | **you have to edit `netlify.toml`, see below** |
| Functions directory | `netlify/functions` | `netlify.toml` |
| Node version | 18 | `netlify.toml`, `NODE_VERSION` |

#### Fix the publish directory before your first deploy

`netlify.toml` as committed says:

```toml
publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

That pair configures a server-rendered Next.js site. This one is a static export.
`npm run build` writes the site to `out/`, and `.next/` holds build manifests, not servable
pages. Deploy it untouched and the build goes green while the deploy publishes a directory
with no pages in it.

Typing `out` into the dashboard's Publish directory field will not save you, because the toml
overrides it. Edit the file:

```toml
publish = "out"
```

and delete the `[[plugins]]` block, since the Next.js plugin has no server to adapt. It is a
defect in the template and it is the first thing to change after you fork.

The committed build command runs the integration tests, so a failing test fails the deploy,
and the build environment needs `SUPABASE_SERVICE_ROLE_KEY`. That gate is deliberate. Drop
`npm run test:integration` from the command if you would sooner not run tests against a live
project on every deploy.

### Environment variables in Netlify

Set everything your deploy needs under Site configuration, then Environment variables. At
minimum:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`, your production origin. There is no fallback. Netlify's own `URL`
  and `DEPLOY_PRIME_URL` are unprefixed, so they reach the build and the functions but never
  the browser bundle. To use Netlify's value, promote it in the build command:
  `NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-$URL}" npm run build`
- `EMAIL_PROVIDER` and its credentials
- `NEXT_PUBLIC_EMAIL_DOMAIN`, plus any `EMAIL_*` role mailbox you want to override

`NEXT_PUBLIC_*` variables are baked in at build time. Changing one needs a redeploy, not a
restart.

### Scheduled functions

`netlify/functions/scheduled-log-cleanup.ts` trims the log tables. Netlify scheduled
functions have to be configured in the dashboard; it will not run on its own.

---

## Known gaps

These are real and unfixed. An adopter finding them out later is the outcome this section
exists to prevent.

### Role resolution trusts user-writable metadata, and this is a blocker

`getPrincipal()` in `netlify/functions/_shared/handler.ts` reads the caller's role from
`app_metadata.role` first and falls back to `user_metadata.role`. `app_metadata` is
server-controlled. `user_metadata` is written by the user, with an ordinary authenticated
call to Supabase's `PUT /auth/v1/user`.

So any account that does not already carry a server-set `app_metadata.role`, which means
every self-signup and every invited user before an admin stamps a role on them, can make
itself an administrator of every Netlify Function:

```
signup  ->  PUT /auth/v1/user {"data": {"role": "admin"}}  ->  refresh the token
```

Verified against a local stack. After those three calls a brand-new account read the entire
member roster (names, emails, phone numbers, addresses, emergency contacts), every
evaluation, every contact submission and the system logs.

Row-level security is not the hole. The policies in `supabase/migrations/` are written
against `members.role` and `members.capabilities`, neither of which a user can change, and
they hold: a plain member querying PostgREST directly sees only their own member row and
their own evaluations. The hole is that the functions run with the service-role key, RLS
never applies to them, and their own role check is the only thing standing there.

The capabilities are reachable the same way. `getPrincipal()` takes the literal
`capabilities` key from `app_metadata` only, but it reads `role` and `roles` from
`user_metadata` too, and a capability slug sitting in either of those resolves to a member
holding that grant. Send `{"data": {"role": "evaluator"}}` in place of `admin` above and the
account reads every evaluation in the association, because `netlify/functions/evaluations.ts`
holds the same service-role key. Admin is still the worse outcome, but not because the
capability half is protected.

Until it is fixed, turn off self-service signup in Supabase Auth and set
`app_metadata.role` on every user through the service role. The fix itself is to stop
reading `user_metadata` for `role` and `roles`, in `getPrincipal()` in
`netlify/functions/_shared/handler.ts` and in `contexts/AuthContext.tsx`, which carries the
same fallback. Both fields feed the rung and the capability grants, so dropping the fallback
closes both. Tracked as PLAT-33.

### Downloads from the private buckets need signed URLs

The buckets and their policies ship in the migration chain, described under [Storage
buckets](#storage-buckets). The portal's download links do not go through them.
`lib/fileUpload.ts` builds a `getPublicUrl()` link after each upload and the row it writes
stores that string, so the resources list, the newsletter list and the evaluation attachments
all point at `/storage/v1/object/public/...`. That route only resolves for a public bucket,
which means `email-images` and nothing else. Every other download link in the portal comes
back 400.

The fix is `createSignedUrl()` at render time instead of `getPublicUrl()` at upload time.
Signed links expire, so storing one in `resources.file_url` moves the problem rather than
solving it. The policies already decide who may read a given object, so what is missing is the
code that asks for the link.

### `npm audit` still has ten production findings

`npm audit --omit=dev` used to report 42 vulnerabilities in production dependencies, 40 of
them high. Most of that came from two packages nothing in the app actually imports:
`decap-cms-app` (the CMS admin bundle, dead code since Decap CMS was pulled from this fork)
and `pdfjs-dist` / `react-pdf` (`PDFViewer.tsx` renders PDFs with a plain
`<object>`/`<iframe>`, not a PDF.js canvas; react-pdf was never wired up, and a 1.1MB
`public/pdf.worker.min.js` was shipping in every build without a single request for it).
Dropping both, then running `npm audit fix` for what it could resolve without a major bump,
took the count from 42 down to 10: 2 low, 8 high.

What's left, and why it's staying for now:

- **`next` → `postcss` / `sharp` (high).** The fix is Next 16, and this lane doesn't touch
  Next's major version. Both are build-time tools here: `output: 'export'` plus
  `images: { unoptimized: true }` means Next's sharp-based image server never runs in this
  app, and postcss only ever processes this repo's own Tailwind source, never
  user-supplied CSS. Not reachable from a request.
- **`@netlify/functions` → `@netlify/blobs`, `@netlify/dev-utils`, `image-size`, and,
  separately, `esbuild` / `@netlify/zip-it-and-ship-it` (high and low).** The fix is
  `@netlify/functions@5`, a major bump touching every one of the 12 function handlers that
  import `Handler` / `HandlerEvent` from it. That's enough surface to need its own lane,
  tested against a real deploy, rather than a drive-by fix here. Checked what actually runs,
  though: the package's deployed entry point (`dist/main.cjs`) only requires Node's own
  `process`, `stream` and `util`. Blobs, dev-utils and the esbuild-based bundler sit behind
  the package's `/dev` (local CLI) subpath, which nothing in this repo imports. None of it is
  reachable from a running function, only from local tooling.
- **`xlsx` (high, no fix available).** SheetJS stopped publishing patched versions to npm;
  the fix exists only on their own CDN, outside what `npm audit` can resolve.
  `lib/stats/readWorkbook.ts` is the only importer, runs entirely in the browser, and only
  ever parses a file the uploading portal member hands it themselves through
  `StatsUploadModal.tsx`. Worst case is a member attacking their own browser tab, not a
  public attack surface, but it's unresolved, and stays that way until SheetJS (or a
  maintained fork) publishes a real fix to npm.

### Stats ingestion assumes Arbiter xlsx exports

`lib/stats/arbiterGameInfo.ts` parses the Arbiter "Game Info" export by column header:
`GameID`, `SiteName`, `LevelName`, `HomeTeams`, `Officials` and the rest. Feed it another
assigning system's export and it will not find a header row at all.

That is deliberate. Half-abstracting it into a generic importer would have produced a
mapping layer nobody could configure and a parser that handled no real file correctly. If
you use a different assignor, replace that one module. It is pure, has no I/O, and is fully
unit-tested.

---

## Documented assumptions

Smaller things that are true about this codebase and will surprise you otherwise.

**News is files, not a table.** `/news` and every `/news/<slug>` page are built from
`content/news/*.md`. The list reads the same directory `generateStaticParams` walks, so a
card on the list always has a page behind it. That agreement is load-bearing: when the list
was fetched from the `public_news` table in the browser instead, an article written in the
portal CMS showed up in the list and 404ed when anyone clicked it. The table and its CMS
screen are still here, relabelled "News Drafts", because nothing on the public side reads
them. Publishing an article means committing a markdown file and deploying. To make the CMS
publish for real, the shape that works on a static export is generating those files from the
table during the build and rebuilding on publish. `node scripts/check-news-render.mjs` fails
if the list and the pages disagree.

**Article bodies are markdown, rendered at build.** `app/news/[slug]/page.tsx` runs the body
through `markdownToHtml()` and then `sanitizeHtml()` before any of it reaches the page. Raw
HTML in a content file is dropped rather than rendered, because `remark-html` runs with
`allowDangerousHtml` off, so a `<script>` pasted into an article produces nothing at all.
Sanitising happens on render and never on write. The suites under `__tests__/unit/security`
are there to keep it that way.

**Four npm scripts point at files that do not exist**: `dev:functions`
(`server/local-functions.js`, where the file on disk is `.ts`), `dev:cms` (Decap CMS was
removed and there is no `public/admin`), `test:supabase` and `test:buckets`. All four are
safe to delete on the day you fork: no code path calls them. `decap-cms-app` itself, the
large unused package `dev:cms` pointed at, is already gone from `dependencies` (see
[Known gaps](#known-gaps)).

**Mail addresses are derived, and derivable.** Setting `NEXT_PUBLIC_EMAIL_DOMAIN` moves all
eleven role mailboxes at once, and each one is `<role>@<your domain>`. The domain is public
by construction. Treat the naming scheme as guessable and override individually any role
whose real inbox you would rather not have derived.

**Feature gating works by presence.** A portal tile or an embedded form renders when its
value in `lib/siteConfig.ts` is non-empty and vanishes when it is not. There is no flag
registry and no per-member entitlement.

**Roles are two lists, not one.** The structural ladder (`member`, `executive`, `admin`) is
enumerated in the schema. Capabilities (`evaluator`, `scheduler`, `instructor`, `assignor`,
`mentor`) are a config list the database does not enumerate. Both are defined in
`lib/roles.ts`. See [The role model](#the-role-model).

---

## Licence and attribution

Licensed under the **PolyForm Noncommercial License 1.0.0**, which is source-available and
not OSI-approved open source. You may use, modify and run it for any noncommercial purpose,
which covers a volunteer-run officials association operating its own site. You may not use
it in a commercial product or service. Read [`LICENSE`](LICENSE) before you build anything
on it.

Attribution to **Joey Fisher, Synced Sport / Synced Tech** is required. Redistribution, in
whole or in part, has to carry [`NOTICE`](NOTICE) and a copy of the licence, unmodified.
