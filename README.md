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
| News, listed from the `public_news` table. | The contact form, routed by category to a role mailbox. |

### Members portal

![Portal dashboard](docs/screenshots/portal-dashboard.jpg)

The dashboard: announcements, upcoming events and scheduler updates. Which navigation items
and tiles appear depends on the signed-in member's role.

| | |
|---|---|
| ![Member directory](docs/screenshots/portal-members.jpg) | ![Public content admin](docs/screenshots/portal-public-content-admin.jpg) |
| The member directory, filtered by status, role, certification and city. | The public-content admin, which is the CMS. News, training, resources, officials, executive team and page copy are edited here and published to the public site. |

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

`supabase/migrations/` holds thirteen files that build the whole schema: members, roles and
their RLS policies, portal content, evaluations, public content, invite tokens, email
history, logging, submissions and season stats.

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
npx supabase db reset   # applies all thirteen against an empty database
```

### Storage buckets

Create four buckets by hand in the dashboard, all private:

| Bucket | Holds |
|---|---|
| `portal-resources` | The general document library. Any authenticated member can upload here. |
| `newsletters` | Newsletter PDFs. Admin and executive only. |
| `training-materials` | Clinic and course material. Admin and executive only. |
| `email-images` | Images embedded in outgoing mail. Admin and executive only. |

Who may write to which bucket is enforced in `netlify/functions/upload-file.ts`, on the
service-role path. See [Known gaps](#known-gaps): there are no storage policies in this
template.

Nothing checks your work here. `npm run test:buckets` was the script that would have, and it
is one of the four broken ones listed under [Documented
assumptions](#documented-assumptions). A bucket you forgot to create, or named slightly
differently, shows up as an upload failing in the portal weeks later. Read the four names
back off the dashboard before you move on.

### Row-level security

The migrations enable RLS on every table and grant `anon`, `authenticated` and
`service_role` explicitly, so nothing relies on Supabase's legacy auto-exposure of new
tables. The shape is:

`members`. You can read and update your own row. Admins and executives can read and update
everyone's. A trigger stops an unprivileged PostgREST session from setting or changing its
own `role` or `user_id`, even on its own row.

`evaluations`. You can read the evaluations written about you. Admins and executives can
read all of them and are the only ones who can write. That is the SQL layer. The function
layer is looser and it is the one the portal goes through: `netlify/functions/evaluations.ts`
also admits `evaluator` to read every evaluation and to create one, and lets an evaluator
edit an evaluation they wrote. The functions hold the service-role key, so no policy below
them applies. See [Documented assumptions](#documented-assumptions) on the roles that exist
only in the function layer.

Public content (`public_news`, `public_training_events`, `public_resources`,
`public_pages`). Anyone can read the active rows, anonymous visitors included, because the
public site reads them straight from the browser. Admins and executives write.

Everything else is service-role only and reachable through the functions.

`public.is_admin(uid)` and `public.is_admin_or_executive(uid)` are the single place the
policies ask whether a caller is privileged. They are the seam to change when your role
model grows.

### Auth configuration

Supabase Auth with email and password. In the dashboard:

Set **Site URL** to your production origin.

Add `<your origin>/auth/callback` to **Redirect URLs**. `getAuthCallbackUrl()` in
`lib/siteConfig.ts` builds that path and takes no arguments on purpose. Threading user input
into it turns the login flow into an open redirect through Supabase's allow-listed domain.

Turn off self-service signup, unless you have read [Known gaps](#known-gaps) and fixed the
role-resolution hole. With signup on, anyone can create an account and then grant themselves
admin.

Roles live in the auth user's `app_metadata.role` (`official`, `executive`, `admin`,
`evaluator`, `mentor`) and are mirrored onto `members.role`. Only the service role can write
`app_metadata`.

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
in a deploy. Nearly every page needs it: the portal, the news list, resources, training and
the contact form all go through `/api`.

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
| `npm test` | Unit tests. 356 across 23 suites, no external services. |
| `npm run test:integration` | Integration tests against a real Supabase project. Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Creates and cleans up tagged rows and a couple of throwaway auth users. |
| `npm run build` | The production static export, into `out/`. |
| `npx tsc --noEmit` | Type check. Use this one; `npm run lint` checks nothing, for the reason in [Known gaps](#known-gaps). |
| `node scripts/check-exported-links.mjs` | Run after a build. Reads every local `href` out of `out/` and fails on any that resolves to nothing. |

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

`getUserRole()` in `netlify/functions/_shared/handler.ts` reads the caller's role from
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
against `members.role`, which a user cannot change, and they hold: a plain official querying
PostgREST directly sees only their own member row and their own evaluations. The hole is
that the functions run with the service-role key, RLS never applies to them, and their own
role check is the only thing standing there.

Until it is fixed, turn off self-service signup in Supabase Auth and set
`app_metadata.role` on every user through the service role. The fix itself is to stop
reading `user_metadata` in `getUserRole()`, both in `netlify/functions/_shared/handler.ts`
and in `contexts/AuthContext.tsx`, which carries the same fallback. Tracked as PLAT-33.

### Supabase Storage ships with no policy layer

The migrations do not create a single storage policy. Buckets are private by default, so the
template is not leaking anything as shipped, and every upload and download goes through a
function holding the service-role key that enforces its own rules.

That is the whole protection. Make a bucket public and there is no row-level layer
underneath it: every object in that bucket becomes world-readable by URL. Write your own
policies before you do. Tracked as PLAT-36.

### `npm run lint` does not lint

The script runs `next lint`, but there is no ESLint configuration anywhere in the
repository, so it exits successfully having checked nothing. `next.config.ts` sets
`eslint.ignoreDuringBuilds: false` with a comment about lint errors failing the build, and
with no config to load that is inert too.

Use `npx tsc --noEmit` instead. A green build is not lint evidence. Tracked as PLAT-42.

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

**News is two systems.** `/news` lists rows from the `public_news` table, fetched in the
browser. `/news/[slug]` is prerendered at build from `content/news/*.md` through
`generateStaticParams`. An article you create in the portal CMS appears in the list
immediately and its page 404s, because that path was never in the export. Either rebuild on
publish, or move article bodies into the table and render them client-side.

**Article bodies are passed through as HTML.** `app/news/[slug]/page.tsx` sanitises
`article.content` and injects it directly, so the markdown files under `content/news/`
render with their `##` and `-` characters visible. Anything you write there should be HTML,
or the page needs `markdownToHtml()` from `lib/content.ts` wired into it.

**Four npm scripts point at files that do not exist**: `dev:functions`
(`server/local-functions.js`, where the file on disk is `.ts`), `dev:cms` (Decap CMS was
removed and there is no `public/admin`), `test:supabase` and `test:buckets`. `decap-cms-app`
is still in `dependencies` and nothing imports it. All five are safe to delete on the day you
fork: no code path calls them, and dropping `decap-cms-app` takes a large unused package out
of your install.

**Mail addresses are derived, and derivable.** Setting `NEXT_PUBLIC_EMAIL_DOMAIN` moves all
eleven role mailboxes at once, and each one is `<role>@<your domain>`. The domain is public
by construction. Treat the naming scheme as guessable and override individually any role
whose real inbox you would rather not have derived.

**Feature gating works by presence.** A portal tile or an embedded form renders when its
value in `lib/siteConfig.ts` is non-empty and vanishes when it is not. There is no flag
registry and no per-member entitlement.

**Roles are a fixed list**: `official`, `executive`, `admin`, `evaluator`, `mentor`, with
capability checks written inline in each function. `evaluator` and `mentor` have no SQL
grants of their own and exist only in the function layer.

---

## Licence and attribution

Licensed under the **PolyForm Noncommercial License 1.0.0**, which is source-available and
not OSI-approved open source. You may use, modify and run it for any noncommercial purpose,
which covers a volunteer-run officials association operating its own site. You may not use
it in a commercial product or service. Read [`LICENSE`](LICENSE) before you build anything
on it.

Attribution to **Joey Fisher, Synced Sport / Synced Tech** is required. Redistribution, in
whole or in part, has to carry [`NOTICE`](NOTICE) and a copy of the licence, unmodified.
