# Design system

PitchPerfect uses a light canvas, one strong blue, deep navy for weight, plenty of space, and type that is friendly without being cute. It keeps the original project's palette and typography, so it reads as the same product under a new name and mark.

## Brand

- **Name:** PitchPerfect (one word, two capitals). Never "Pitch Perfect" or "pitchperfect" in UI copy.
- **Tagline:** "Practice your pitch. Get hired."
- **Logo:** `apps/web/public/brand/logo.svg` (wordmark + mark) and `mark.svg` (icon only). The mark is a rounded speech bubble whose tail forms an upward check/arrow, drawn in `--pp-blue` on light backgrounds and white on navy. Minimum mark size 20 px; clear space = height of the bubble's tail.
- **Favicons/PWA icons:** generated from `mark.svg` at build time into `apps/web/app/` (`icon.svg`, `apple-icon.png` 180 px) plus `public/icons/` 192 and 512 px; `manifest.webmanifest` with `theme_color #3f56d2`, `background_color #ffffff`.
- **Open Graph image:** `app/opengraph-image.tsx` (1200×630, navy gradient, wordmark, tagline).

## Tokens

Defined once as CSS variables in `apps/web/app/globals.css` and mapped into Tailwind (`@theme`).

| Token               | Value                                                                                                                                             | Use                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `--pp-blue`         | `#3f56d2`                                                                                                                                         | primary buttons, links, focus ring, highlights                          |
| `--pp-blue-600`     | `#3447b8`                                                                                                                                         | primary hover                                                           |
| `--pp-blue-50`      | `#eef1fc`                                                                                                                                         | selected/soft backgrounds, the "soft" section ground                    |
| `--pp-blue-100`     | `#dbe1fa`                                                                                                                                         | highlighter behind quoted words (`.pp-mark`), selection                 |
| `--pp-blue-300`     | `#6f82e6`                                                                                                                                         | light stop of the hero shader and its static fallback only              |
| `--pp-navy`         | `#2d3c90`                                                                                                                                         | headings on light, hero/footer backgrounds                              |
| `--pp-navy-900`     | `#1d275e`                                                                                                                                         | shader shadow stop, dark text on soft blue                              |
| `--pp-navy-300`     | `#737fbd`                                                                                                                                         | display-size text only (3.8:1 on white), e.g. inactive stage words      |
| `--pp-ink`          | `#212529`                                                                                                                                         | body text                                                               |
| `--pp-muted`        | `#6c757d`                                                                                                                                         | secondary text (≥ 4.5:1 on white; use `--pp-ink` on `--pp-surface-2`)   |
| `--pp-surface`      | `#ffffff`                                                                                                                                         | cards                                                                   |
| `--pp-surface-2`    | `#f8f9fa`                                                                                                                                         | page background                                                         |
| `--pp-border`       | `#e9ecef`                                                                                                                                         | borders, dividers                                                       |
| `--pp-success`      | `#1f8a5b`                                                                                                                                         | success, high scores (≥ 80)                                             |
| `--pp-warning`      | `#b7791f`                                                                                                                                         | mid scores (50–79), unverified badge                                    |
| `--pp-danger`       | `#c53030`                                                                                                                                         | errors, low scores (< 50), destructive actions                          |
| radius              | `12px` (inputs), `16px` (cards), `20px` (product windows), `999px` (buttons, pills)                                                               | buttons are fully round everywhere                                      |
| shadow              | `0 1px 2px rgb(16 24 40 / .06), 0 4px 12px rgb(16 24 40 / .06)`                                                                                   | app cards; public pages use no resting shadows                          |
| `--pp-shadow-float` | `0 32px 80px -24px rgb(13 19 56 / .55)`                                                                                                           | only a product window that overlaps a section edge, and the mobile menu |
| spacing             | 4-px scale; public sections `py-32` desktop / `py-20` mobile; public page column `1360px` with 16/24/32 px margins (`WRAP`); app content `1200px` |                                                                         |

Dark mode: not in v1 (documented in limits.md). Do not add partial dark styles.

## Art direction (public pages)

The public site is product-led and editorial. The pictures are the product's own screens, built
from the real components with fictional sample data (a practice room, the scorecard, an applicant
list, a lesson card, a job post, an interview invite). There are no stock photos, illustrations or
icon-card grids.

- **The idea:** the scorecard's evidence. Every score quotes words the student actually said, so the
  page keeps putting a sentence next to its proof. The home page's live piece, the evidence explorer,
  lets a visitor pick a rubric line and see the exact words it's based on marked in the transcript.
- **Signature details:** a word-sized voice pill (the practice room's mic and level meter on a
  slow grain shader) set just after "Get hired.", the highlighter mark on quoted words, the five
  call stages stacked in display type on the students page, and the staircase of verification
  steps on the employers page.
- **Pictures don't repeat:** each page shows its own moment of the product. Home has Maya's
  objection call, how it works the same call two minutes in, students a different buyer in
  discovery, and employers a different job's applicants.
- **Composition:** one 12-column grid, with the structure varied section by section: stacked
  heading and lead over a full-width piece, a two-column with the visual first, a pinned list, a
  compact two-column list, a full-width statement. Only the major beats of a page get a title-size
  heading; the rest use the section step. Neighbouring sections never share a ground (white, soft
  blue, navy, and brand blue only for the closing call to action), and sections are told apart by
  ground, never by rules or shadows.
- **House rules:** no labels above headings, no index numbers (order is shown by position or a real
  `<ol>`), no gradients except the shader and its fallback, no glass, no emoji, headings at most two
  lines at every width, running text in full ink at 16 px or more, one primary button per screen with
  the second action as a plain text link.

## Typography

- **Poppins** (600/700) for headings, **Manrope** (400/500/600/700) for body and UI, both loaded with `next/font/google` (self-hosted at build, `display: swap`). There is no runtime request to Google.
- **Scale (app):** display 56/64, h1 40/48, h2 32/40, h3 24/32, h4 20/28, body 16/26, small 14/22, caption 12/18. Mobile display is 40/48.
- **Scale (public pages):** a few steps far apart, all fluid: `hero` clamp(32px, 7.4vw, 112px), `title` clamp(34px, 5vw, 72px) for page and section titles, `section` clamp(30px, 3.6vw, 52px), `statement` clamp(19px, 1.6vw, 24px) and `lede` 18/28, plus body and small. Display steps use tight tracking (-0.03 to -0.045em) and leading near 1. Captions at 12 px appear only inside product fragments.
- **Line length:** 60–75 characters for prose (lessons, legal pages).

## Layout and patterns

- **Public pages:**
  - Sticky plain white bar: logo, Students, Employers, How it works, Jobs, then Sign in and a primary "Sign up".
  - Home hero: flat navy, the tagline at hero size with the voice pill inline after "Get hired." (word-sized on desktop, at least 40 px tall on phones), one lead sentence, "Start practicing" plus an "I'm hiring" text link, and the practice room rising out of the navy into the white section below.
  - Inner page heroes: flat navy, the title on the left and the lead at the opposite end of its baseline.
  - The close of every page is a brand-blue band; the footer is navy with the logo, links and legal line.
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

## Motion

- **Hero shader:** Paper Shaders' grain gradient in the brand blues, mounted with the core `ShaderMount` into a `<span>` (so the voice control can sit inline in the h1), loaded with a dynamic import after the text renders. `components/marketing/grain-gradient.ts` builds the uniforms, so the chunk carries only that shader. The WebGL 2 support probe releases its context straight away. Under reduced motion, without WebGL 2, on the server and while it loads, the same strip is a static CSS gradient (`.pp-shader-fallback`). The library pauses it off screen and in hidden tabs. It needs no workers, blobs or eval, so the CSP is unchanged.
- **Entrances:** `components/motion/in-view.tsx` (adapted from Motion Primitives) staggers a section's parts in as it first scrolls into view: 24 px rise with opacity, 700 ms, ease-out `cubic-bezier(.22,1,.36,1)`. Server HTML and anything already on screen render finished, so nothing waits for scripts and nothing flickers; `useEntryReveal` decides.
- **Streamed reply:** in the public previews, the last partner reply arrives letter by letter (`text-effect.tsx`), over a transparent copy that keeps its space and gives screen readers the sentence once. The live practice room shows the reply exactly as it streams (the api sends it in bursts while it checks the text) and then swaps in the checked final text; it adds no typing effect of its own.
- **Feedback:** buttons scale to 0.97 on press (`.pp-press`); text links show their underline on hover (`.pp-link`); the voice meters breathe.
- **Reduced motion:** every one of these is off. The global rule also cuts CSS transitions and animations to 0.01 ms.

## Accessibility (WCAG 2.2 AA)

- Every input has a visible `<label>`. Errors are linked with `aria-describedby` and announced.
- Focus is always visible (2 px `--pp-blue` ring with offset). Tab order is logical. A skip link goes to main content.
- All interactions work with a keyboard. In the practice room, Space holds-to-talk when focus is on the mic button, and Enter sends.
- New partner replies are announced via an `aria-live="polite"` region. Speaking can be muted, and captions are always shown.
- Colour is never the only signal: score bands also have labels, and status pills have text.
- `prefers-reduced-motion` disables count-ups, entrances, the streamed reply, the shader and transitions.
- The score ring shows its final value on the server and when it is already on screen; it only counts up from 0 if it was still off screen after hydration.
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
