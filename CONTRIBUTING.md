# Contributing

Thanks for helping. QA Agent is a local CLI: requirements → Playwright → LLM triage. Keep that loop honest — Playwright is the oracle, not the model.

## Setup

- Node.js **22.13+**
- Windows is the primary install path (`instalar.ps1`); Linux/macOS can run `npm install` and `npx playwright install chromium`

```bash
git clone <this-repo>
cd qa-agent
cp .env.example .env
npm install
npm run typecheck
```

Do not commit `.env`, `data/`, or credential files.

## How we work

- Prefer a small pull request with one intent (bugfix, docs, feature).
- Run `npm run typecheck` before opening a PR.
- Do not add credentials, customer requirements, or run artifacts from `data/`.
- Do not weaken skip/massa honesty: if a CA cannot be asserted in the UI, keep it `@rascunho`, `@massa`, or `@sem-ui` with a reason.
- TUI strings go through `src/i18n.ts` (pt-BR **and** en-US).

## Useful commands

| Command | Purpose |
|---|---|
| `npm start` | TUI / CLI |
| `npm run typecheck` | TypeScript |
| `npm run audit` | Coverage audit |
| `npm run tour` | Headed browser tour |
| `npm run generate-massa` | Fill `dados.json` |

## Code of conduct

Be respectful. Harassment and personal attacks are not acceptable. Maintainers may close PRs or issues that ignore this.
