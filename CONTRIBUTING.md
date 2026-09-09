# Contributing

Thanks for helping. QA Agent is a local CLI: requirements → Playwright → LLM triage. Keep that loop honest — Playwright is the oracle, not the model.

## Setup

- Node.js **22.13+**
- One-line install (documented in README): `install.ps1` / `install.sh` on GitHub raw
- In-repo install: `node instalar.mjs` (or `./instalar`, `instalar.ps1`, `instalar.cmd`)

```bash
git clone <this-repo>
cd qa-agent
node instalar.mjs
# dev without PATH: npm install && npm run typecheck
```

Do not commit `.env`, `data/`, or credential files.

## Security checklist (before opening a PR)

- [ ] `git status` shows no `.env`, `data/`, `credenciais.md`, `credenciais.json`, or `mcp.json`
- [ ] No API keys, webhook URLs, passwords, or session cookies in diff
- [ ] Customer requirements and run artifacts stay out of the repo (`data/` is gitignored)
- [ ] Screenshots or logs in the PR are redacted

If you develop from the one-line install path (`%LOCALAPPDATA%\qa-agent` or `~/.local/share/qa-agent`), that folder is **not** this git repo — do not copy its `.env` or `data/` into the clone.

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
