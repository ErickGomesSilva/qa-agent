# Security Policy

## Supported versions

Report issues against the latest `main` branch.

## What not to report in public issues

Do **not** open a public issue for:

- leaked API keys, passwords, session cookies, or webhook URLs
- remote code execution or authentication bypass in this repo
- anything that would help attack a third-party application under test

Email or use GitHub **private vulnerability reporting** on this repository if it is enabled.

## Secrets

QA Agent stores secrets locally:

- `.env` — API keys, webhooks
- `data/settings.json` — paths and options
- `data/workspace/scripts/credenciais.md` (or `.json`) — application logins

These paths are gitignored. Never commit them. Never paste them into issues or pull requests.

The LLM API key never leaves the machine for the local Cursor agent runtime. Playwright credentials are injected as environment variables for the test process only.

## Disclosure

If you find a vulnerability:

1. Do not exploit it beyond a proof that it exists.
2. Give maintainers time to patch before public discussion.
3. Include steps to reproduce on a fresh clone, without real production credentials.
