# Changelog

All notable changes to QA Agent. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow `package.json`.

The repository has no release tags yet: each version below is mapped from the `package.json` version at the time of the commit, and the date is the commit date.

## [Unreleased] — 1.9.0

### Added
- F8 mission stages selected with keys **1–4**: Full, Map+route, Scripts, Tests. **R** on Map+route recrawls; on Scripts rewrites specs without a crawl.
- CLI flags `--map-roteiro`, `--scripts-only`, `--tests-only` for the same stages in plain mode.

### Changed
- The tool is no longer tied to a specific product. The generated login helper (`helpers/auth.ts`) finds the login fields generically, and `E2E_LOGIN_PATH`, `E2E_HOME_PATH` and `E2E_CONTEXT` replace the hard-coded `/app` route, page headings and default context. **Existing projects:** the helper is rewritten on the next run; if your app needs a specific context after login, set `E2E_CONTEXT`.
- The context-picker screen is detected by a generic heading ("select/choose company, account, workspace…") in the profile map, the tour and the specs.
- Roles cited in requirements are also detected from phrases like "perfil X", "papel X" or "role X"; domain-specific role names were removed from the built-in list.
- Examples and test fixtures use neutral names.
- README (EN and pt-BR) restructured with the same sections: quickstart, requirement format, stages, generated files, glossary, CLI reference, troubleshooting.
- MCP / Plane details moved to `docs/mcp.md` and `docs/mcp.pt-BR.md`.

## [1.8.0] — 2026-09-16

### Added
- Configure the MCP requirements source (Plane) directly from F3: list projects, validate Epics, filter by the `Requisitos` label, keep the most recent `updated_at` for duplicated US.

## [1.7.0] — 2026-09-16

### Added
- Project managers connected via MCP (Plane) as a requirements source and as the destination of Bugs confirmed by triage.
- Version number shown in the TUI and in `--plain`; `--help` and `--version`.

## [1.6.6] — 2026-09-15

### Changed
- Clearer visual feedback for active / ended LLM agent session on F10.

## [1.6.5] — 2026-09-13

### Added
- "How to resume" guidance (`RETOMAR.md`) after every run outcome.

## [1.6.4] — 2026-09-13

### Added
- F10 tab with live LLM agent telemetry.

### Fixed
- CLI help now mentions F1–F10.
- `install.ps1` parse error on Windows PowerShell caused by Unicode dashes.

## [1.6.3] — 2026-09-13

### Fixed
- F2 model list scrolling; lighter TUI paint cost.

## [1.6.2] — 2026-09-11

### Fixed
- Triage can read Playwright logs; the run stops cleanly on infrastructure errors.

## [1.6.1] — 2026-09-11

### Added
- Pause mid-run (P / Esc) with a `CONTINUAR.md` resume guide.

## [1.6.0] — 2026-09-11

### Added
- Reuse of map and roteiro by input fingerprint.
- Automatic summary of fatal errors (`FALHA-FATAL.md`).

## [1.5.0] — 2026-09-09 to 2026-09-10

### Added
- Traceability matrix, quarantine retest, and continue-after-PRODUTO runs.
- Cross-platform one-line installer (Windows, Linux, macOS).
- Pre-commit `security-check` for secrets and sensitive paths.
- Per-profile UI map before generating specs, with detailed run blockers (`PROBLEMAS.md`).
- One folder per product under `data/projects/<slug>/` and `qaagent --clean`.
- F3 accepts a local folder or a Git URL; private-repo token saved in the tool `.env`.

### Changed
- Hardened `.gitignore`; docs synced with F9 consult and security.

## [1.4.0] — 2026-09-09

### Added
- Claude, OpenRouter, Groq, and custom OpenAI-compatible APIs on F1/F2.

## [1.3.0] — 2026-09-08

### Added
- First public release as an MIT-licensed local CLI, with install docs.

### Changed
- TESTE cases stuck after five retries are skipped instead of aborting the suite.
