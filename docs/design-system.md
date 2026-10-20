# Design system

PitchPerfect is clean, airy, and confident: a light canvas, one strong blue, deep navy for weight, generous whitespace, and type that feels friendly but professional. It keeps the palette and typography of the original project so it is recognizably the same product, with a new name and mark.

## Brand

- **Name:** PitchPerfect (one word, two capitals). Never "Pitch Perfect" or "pitchperfect" in UI copy.
- **Tagline:** "Practice your pitch. Get hired."
- **Logo:** `apps/web/public/brand/logo.svg` (wordmark + mark) and `mark.svg` (icon only). The mark is a rounded speech bubble whose tail forms an upward check/arrow, drawn in `--pp-blue` on light backgrounds and white on navy. Minimum mark size 20 px; clear space = height of the bubble's tail.
- **Favicons/PWA icons:** generated from `mark.svg` at build time into `apps/web/app/` (`icon.svg`, `apple-icon.png` 180 px) plus `public/icons/` 192 and 512 px; `manifest.webmanifest` with `theme_color #3f56d2`, `background_color #ffffff`.
- **Open Graph image:** `app/opengraph-image.tsx` (1200×630, navy gradient, wordmark, tagline).

## Tokens

Defined once as CSS variables in `apps/web/app/globals.css` and mapped into Tailwind (`@theme`).

| Token            | Value                                                                             | Use                                                                   |
| ---------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--pp-blue`      | `#3f56d2`                                                                         | primary buttons, links, focus ring, highlights                        |
| `--pp-blue-600`  | `#3447b8`                                                                         | primary hover                                                         |
| `--pp-blue-50`   | `#eef1fc`                                                                         | selected/soft backgrounds                                             |
| `--pp-navy`      | `#2d3c90`                                                                         | headings on light, hero/footer backgrounds                            |
| `--pp-navy-900`  | `#1d275e`                                                                         | hero gradient end, dark text on soft blue                             |
| `--pp-ink`       | `#212529`                                                                         | body text                                                             |
| `--pp-muted`     | `#6c757d`                                                                         | secondary text (≥ 4.5:1 on white; use `--pp-ink` on `--pp-surface-2`) |
| `--pp-surface`   | `#ffffff`                                                                         | cards                                                                 |
| `--pp-surface-2` | `#f8f9fa`                                                                         | page background                                                       |
| `--pp-border`    | `#e9ecef`                                                                         | borders, dividers                                                     |
| `--pp-success`   | `#1f8a5b`                                                                         | success, high scores (≥ 80)                                           |
| `--pp-warning`   | `#b7791f`                                                                         | mid scores (50–79), unverified badge                                  |
| `--pp-danger`    | `#c53030`                                                                         | errors, low scores (< 50), destructive actions                        |
| radius           | `12px` (controls), `16px` (cards), `999px` (pills)                                |                                                                       |
| shadow           | `0 1px 2px rgb(16 24 40 / .06), 0 4px 12px rgb(16 24 40 / .06)`                   | cards; stronger on hover                                              |
| spacing          | 4-px scale; sections `py-20` desktop / `py-12` mobile; content max width `1200px` |                                                                       |

Dark mode: not in v1 (documented in limits.md). Do not add partial dark styles.

## Typography

- **Poppins** (600/700) for headings, **Manrope** (400/500/600/700) for body and UI, both loaded with `next/font/google` (self-hosted at build, `display: swap`). There is no runtime request to Google.
- **Scale:** display 56/64, h1 40/48, h2 32/40, h3 24/32, h4 20/28, body 16/26, small 14/22, caption 12/18. Mobile display is 40/48.
- **Line length:** 60–75 characters for prose (lessons, legal pages).

## Layout and patterns

- **Public pages:**
  - Sticky translucent navbar: logo, Students, Employers, How it works, Jobs, then Sign in and a primary "Get started".
  - Hero: navy gradient, headline, subcopy, two CTAs, and a product visual. The visual is a real, static-rendered practice-room mock built from the actual components, not a stock image.
  - Sections alternate white and `--pp-surface-2`. Footer is navy with links and the legal pages.
- **App (student and employer):**
  - Desktop: left sidebar with icon + label, a top bar with page title and account menu, and content in cards.
  - Mobile: a bottom tab bar (max 5 items) and a top bar.
- **Practice room:**
  - A persona card (AI badge, name, title, company type, personality chips).
  - A transcript panel (student right in blue, partner left in white, captions always visible).
  - A bottom control dock: a large push-to-talk button with level meter, an editable interim transcript, a send button, a type toggle, a voice picker, mute, and End session.
  - Progress along the top: stage stepper, turns left, time left.
- **Scorecard:**
  - An overall score ring (animated count-up; colour by band).
  - Seven rubric bars, each with its justification and quoted evidence.
  - Strengths and improvements in two columns.
  - A "Stronger version" before/after card.
  - Actions: Practice again, Share with an application, Delete.

## Components (`apps/web/components/`)

Each component is implemented once:

- **Primitives:** `Button` (primary/secondary/ghost/danger; sizes sm/md/lg; `loading`), `Field` (label + control + hint + error; wraps Input/Textarea/Select), `Checkbox`, `RadioGroup`, `Badge`, `Card`, `Tabs`, `Modal` (focus trap, Esc, return focus), `Toast` (aria-live polite), `Skeleton`, `EmptyState`, `Pagination`, `DataTable`.
- **Navigation:** `Navbar` (public), `AppShell` (sidebar/topbar/bottom tabs, links passed in by role), `Footer`.
- **Domain:** `SkillCard`, `LessonContent`, `JobCard`, `JobDetails` (actions slot), `JobForm` (with `RichTextEditor`), `ApplicationRow`, `StatusPill`, `PersonaCard`, `TranscriptBubble`, `MicButton`, `ScoreRing`, `RubricBar`, `Scorecard`, `QuotaMeter`, `ConsentDialog`, `SafeHtml`.

## Accessibility (WCAG 2.2 AA)

- Every input has a visible `<label>`. Errors are linked with `aria-describedby` and announced.
- Focus is always visible (2 px `--pp-blue` ring with offset). Tab order is logical. A skip link goes to main content.
- All interactions work with a keyboard. In the practice room, Space holds-to-talk when focus is on the mic button, and Enter sends.
- New partner replies are announced via an `aria-live="polite"` region. Speaking can be muted, and captions are always shown.
- Colour is never the only signal: score bands also have labels, and status pills have text.
- `prefers-reduced-motion` disables count-ups and transitions.
- Contrast is checked with axe in Playwright (`@axe-core/playwright`) on every public page and the main app pages. There must be zero serious or critical violations.

## SEO checklist (public pages)

- Use the `generateMetadata`/`metadata` export on every page:
  - `title` uses the template `%s · PitchPerfect`.
  - Unique `description` of 140–160 characters.
  - `alternates.canonical` built from `SITE_URL`.
  - `openGraph` and `twitter` card.
- `app/sitemap.ts` lists static public pages plus active jobs of verified companies. `app/robots.ts` allows public pages and disallows `/app`, `/employer`, `/api`.
- JSON-LD via a `JsonLd` component:
  - `Organization` and `WebSite` on `/`.
  - `FAQPage` on `/` and `/how-it-works`.
  - `JobPosting` on `/jobs/[slug]` (verified companies only), with `title`, `description`, `datePosted`, `validThrough`, `employmentType`, `hiringOrganization`, `jobLocation` or `jobLocationType: TELECOMMUTE`, and `baseSalary` when present.
- Semantic structure: one `h1` per page, ordered headings, `<main>`, `<nav>`, `<footer>`, descriptive link text, and `alt` on every meaningful image.
- Performance:
  - Public pages are server-rendered per request with minimal client JS, and use `next/image` for images.
  - No layout shift from fonts (`next/font`).
  - Lighthouse ≥ 90 in all four categories, checked in CI with `@lhci/cli` against `next start`.
- `noindex` on the app, employer, auth, and unverified-company job pages.
