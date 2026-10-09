# Project managers via MCP (Plane and others)

[Português](mcp.pt-BR.md) · [Back to README](../README.md)

Besides a local folder and Git, requirements can come from a **project manager connected via MCP** (today: Plane). This page covers configuration, the contract rules, and what is not implemented yet.

## Contract rules

- An **approved** User Story in the manager is the **official contract**.
- An approved **Requirement Change** with an explicit relation superseding a rule (RN) or criterion (CA) alters the **effective contract**.
- Drafts and conflicts without an explicit relation are **never** resolved by guessing. The US is materialized with an "ambiguous contract" warning instead.

## Configure from F3 (TUI)

The **Requirements** tab has a **Local / Git / MCP** selector (keys 1/2/3 or ←→). With **MCP**:

1. Type the MCP server name, as declared in `mcp.json` (e.g. `plane`). See [`mcp.example.json`](../mcp.example.json).
2. **Enter** connects and lists the workspace's projects. Pick one with ↑↓.
3. **Enter** again **validates** the project: fetches all work items, keeps only those with the **`Requisitos`** label and groups them into **Epics** for you to review before saving. The label name is fixed today; it keeps out the `QA / E2E` items the tool writes back and `Desenvolvimento` tasks.
4. If the same US appears twice (e.g. an older `[V1]` re-import plus the current catalog), **the most recent `updated_at` wins**. The older one is dropped and counted in the summary (`N duplicate(s) dropped`). This is a fixed recency rule, never a content guess.
5. Once you confirm the Epics, F3 materializes the requirements into local Markdown and points `requisitosPath` at that folder. Map, roteiro, specs and audit then run exactly as with local/Git.
6. Press **R** on F3 (with MCP already validated) to reconnect and relist from scratch. That is how you refresh after changes in Plane.

**Title convention:** not every Plane workspace has Work Item Types enabled, so Epic / Feature / US are detected by title (`Épico:`, `Feature:`, `US_XXX`) when no native type exists. The **label** decides what counts as a requirement, not the title.

## Config file

F3 writes these optional fields to `data/settings.json`. Existing installs without them keep working unchanged.

```json
{
  "requirementSourceKind": "mcp",
  "mcpRequirementSource": {
    "server": "plane",
    "provider": "plane",
    "projectId": "...",
    "cycleId": "...",
    "defaultLabels": ["qa-agent"]
  }
}
```

The MCP server itself (URL, token) lives only in `mcp.json`, which is gitignored. No MCP token or secret is written to `data/`, reports, `run.json`, or logs.

## Materialized output

Each US becomes `US_<KEY>.md` with front matter (provider, project, cycle, external ID, revision, source URL) and one `### CA<n>` block per criterion, in the same format as local requirements (see [Requirement format](../README.md#requirement-format)). `SOURCE-MANIFEST.json` records provenance and content hashes, without secrets.

## Run scope

`RequirementRunScope` supports: full suite, a **specific US**, a **scenario** (US plus explicitly related dependencies/journeys, never the whole Feature/Epic), or a **Bug retest** (resolves the origin US and runs the smallest slice).

## Automatic Bug creation

- Only after triage classifies **PRODUTO**. The LLM never creates external items on its own.
- Deduplication by stable signature: provider + project + US + CA + behavior.
- If sync fails, the local finding (`PRODUTO.json`) is kept and `BUG-SYNC-PENDENTE.md` / `.json` is written for an idempotent retry. The tool never claims a Bug was created without provider confirmation.

## Architecture

- `src/requirements/`: normalized contract, effective contract, materialization, scope resolution.
- `src/project-managers/`: provider adapters, Bug sync and dedupe.
- A second adapter (Jira, Linear, Azure DevOps…) is registered in `src/project-managers/registry.ts` without touching the orchestrator or the F3 UI.

All of the above is unit-tested with fixtures, without live network access.

## Not implemented yet

- Dedicated CLI flags (`--requirements-source mcp ...`). Configure through F3 or `data/settings.json`.
- Cycle / release picker in F3.
- Provider picker when more than one adapter is registered. Only Plane exists, so F3 assumes `provider=plane`.
- Propagating the US / scenario / Bug scope into roteiro and generation. Only scope resolution itself is ready (`src/requirements/scope-resolver.ts`).
