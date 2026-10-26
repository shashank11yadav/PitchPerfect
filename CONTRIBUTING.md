# Contributing

## Before you start

1. Read [docs/architecture.md](docs/architecture.md) and [docs/conventions.md](docs/conventions.md).
2. If you'll touch auth, data access, uploads, HTML, or the practice partner, read [docs/security.md](docs/security.md) and [docs/practice-partner.md](docs/practice-partner.md) too.
3. Set up locally with the README's quick start.

## Workflow

1. Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
2. Write the failing test first, then the code, then refactor.
3. Keep the change focused. One concern per pull request.
4. Before pushing, run:
   ```bash
   npm run format && npm run lint && npm run typecheck && npm test && npm run check:dead
   ```
   Run `npm run e2e` too if the change affects a user journey, and `npm run e2e:pages` if it affects the static demo. The pre-commit hook checks formatting of staged files and runs gitleaks when it is installed.
5. Open a PR with a summary, screenshots for UI changes, test evidence, and the security considerations if any apply. For prompt or model changes, also include the eval results.

## Definition of done

- [ ] Tests cover the happy path, validation, auth, role, and ownership (api), or loading/empty/error states (web)
- [ ] No new lint errors, type errors, duplication above threshold, unused code, or unused deps
- [ ] Accessible: labels, keyboard, focus, contrast (axe clean for touched pages)
- [ ] No secrets, personal data, or real people/companies in code, fixtures, or screenshots
- [ ] Docs updated if behavior, endpoints, env vars, or limits changed

## Commit messages

Conventional commits: `type(scope): summary`. The types are `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf` and `security`. The scopes are `web`, `api`, `coach`, `partner`, `shared`, `e2e`, `repo`, and `deps` for dependency updates.

## Dependency updates

Dependabot opens weekly pull requests for npm (grouped into one) and for GitHub Actions. It skips semver-major bumps of `@types/node`, which follows the Node 22 runtime in `.nvmrc`, and of `typescript`; do those by hand. Merge its pull requests with "Rebase and merge": a squash merge adds a co-author trailer to the commit.

The api resolves one MongoDB driver: an `overrides` entry in the root `package.json` makes `mongodb-memory-server-core` use the root `mongodb` devDependency, which matches the driver mongoose pins. Bump `mongodb` together with mongoose, and check that `npm ls mongodb` shows a single version.
