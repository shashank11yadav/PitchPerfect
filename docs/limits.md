# Known limits (intentional for v1)

PitchPerfect is a portfolio-grade product. These are deliberate scope limits, each with the path forward.

| Limit                                       | Why                                                             | Path forward                                                        |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Legal pages are templates                   | Binding legal text needs a lawyer                               | Replace `/privacy` and `/terms` content before any real launch      |
| One employer user per company               | Teams need invites, roles, and ownership transfer               | Add `companymembers` with roles and invite tokens                   |
| Admin is a CLI, not a UI                    | Small operational surface                                       | Add an admin app behind SSO if moderation volume grows              |
| Voice depends on browser speech APIs        | No paid speech service in v1; Firefox has no speech recognition | Add server-side STT/TTS behind the coach with streaming audio       |
| No dark mode                                | Keep one polished theme                                         | Add a dark token set; components already use tokens only            |
| English only                                | Content, prompts, and rubric are English                        | Localize lessons + prompts; add a `locale` to attempts              |
| US states only for student location         | Demo audience is US-based                                       | Replace with country + region                                       |
| No GDPR data export                         | Not launching in the EU                                         | Add `GET /api/me/export` (JSON + résumé)                            |
| Rate limits are per instance store in Mongo | Fine for demo traffic                                           | Move to Redis (`REDIS_URL` already supported by the limiter config) |
| No payments or subscriptions                | Out of scope                                                    | —                                                                   |
| No messaging between employers and students | Email notifications cover interviews                            | Add threaded messages with moderation                               |
| Users under 18 can't sign up                | Protects minors' data and avoids consent flows                  | School programs would need guardian/school consent flows            |
