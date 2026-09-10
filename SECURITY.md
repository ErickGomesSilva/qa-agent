# Security Policy

## Supported versions

Report issues against the latest `main` branch.

## What not to report in public issues

Do **not** open a public issue for:

- leaked API keys, passwords, session cookies, or webhook URLs
- remote code execution or authentication bypass in this repo
- anything that would help attack a third-party application under test

Email or use GitHub **private vulnerability reporting** on this repository if it is enabled.

## Secrets (never commit)

QA Agent stores secrets **only on your machine**:

| Path | Contents |
|---|---|
| `.env` | LLM API keys, webhooks, `QA_AGENT_TOKEN` |
| `data/settings.json` | Paths, model, locale, run options, active project slug |
| `data/projects/<slug>/scripts/credenciais.md` (or `.json`) | Application logins under test |
| `data/workspace/scripts/credenciais.md` | Legacy default project only |
| `data/projects/<slug>/scripts/.auth/` | Playwright session cookies |
| `data/runs/` | Run logs and Playwright output |
| `mcp.json` | Local MCP config (use `mcp.example.json` as template) |

These paths are in `.gitignore`. Never paste them into issues, pull requests, or chat logs.

Contributors: run `npm run security-check` before pushing. Git clones auto-enable a **pre-commit hook** (`.githooks/pre-commit`) that runs the same check on staged files.

Default install folders (also **outside** the git clone, but same rules apply):

- Windows: `%LOCALAPPDATA%\qa-agent`
- Linux / macOS: `~/.local/share/qa-agent`

The LLM API key is used from your machine for the local agent runtime. Playwright credentials are injected as environment variables for the test process only; they are not written to `run.json`.

## One-line installer (`install.ps1` / `install.sh`)

The README documents remote install:

```powershell
irm https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.sh | bash
```

That **downloads and executes** code from GitHub. Before piping to a shell:

1. Read the script on GitHub: [`install.ps1`](install.ps1), [`install.sh`](install.sh).
2. Prefer cloning the repo and running `node instalar.mjs` if you do not trust pipe-to-shell.
3. Pin a branch or tag with `QA_AGENT_BRANCH` if you need a fixed version.

The bootstrap script does **not** send your `.env` or credentials anywhere; it only downloads the public repository and runs the local installer.

## HTTP API (`npm run serve`)

Binds to `127.0.0.1` by default. Set `QA_AGENT_TOKEN` in `.env` so `POST /v1/runs` requires `Authorization: Bearer …`. Do not expose this port to the public internet without a reverse proxy and strong auth.

## Disclosure

If you find a vulnerability:

1. Do not exploit it beyond a proof that it exists.
2. Give maintainers time to patch before public discussion.
3. Include steps to reproduce on a fresh clone, without real production credentials.
