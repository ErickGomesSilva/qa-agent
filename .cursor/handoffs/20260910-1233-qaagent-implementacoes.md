# Handoff — QA Agent (mapa, projetos, F3 Git, token)

## Metadados
- Data/hora: 2026-09-10 12:33 (America/New_York)
- Workspace: `c:\Users\egomes\Documents\Documentos\Requisitos Diversos\QA-Agent`
- GitHub: https://github.com/ErickGomesSilva/qa-agent (`main`)
- Wiki: https://github.com/ErickGomesSilva/qa-agent/wiki
- Modelo/agente pretendido: Agent (mesmo clone; `qaagent` no PATH aponta para esta pasta)
- Conversation: sessão de implementação QA Agent (mapa por perfil → projetos → docs/wiki → F3 remoto + token)
- Motivo: pedido do usuário (handoff das implementações + área de transferência)

## Objetivo
Registrar o que já está em `main` e instalado neste PC, para o próximo chat não reimplementar nem retestar Portal-Rural.

## Fonte / documentos de entrada
- Código: `src/profile-map.ts`, `src/roteiro.ts`, `src/escopo.ts`, `src/impediments.ts`, `src/projects.ts`, `src/clean.ts`, `src/req-source.ts`, `src/setup.ts`, `src/tui/app.ts`, `src/wizard.ts`, `src/i18n.ts`, `src/orchestrator.ts`
- Docs: `README.md`, `README.pt-BR.md`, `SECURITY.md`, `CONTRIBUTING.md`, `.env.example`
- Skill generate: `templates/qa-e2e-requisitos/SKILL.md`
- Wiki clone (quando atualizar): `%LOCALAPPDATA%\Temp\qa-agent.wiki` — página `QA‐Agent.md` (hífen Unicode U+2010)

## Já concluído

### Commits em `main` (já pushed)
- `a096e24` — Mapa Playwright **por cada login F5** (menu, controles, HTTP 401/403) **antes** do generate; join requisitos ∩ mapa ∩ F5 → `ROTEIRO.json`; generate usa `loginAs`; heading ≠ consulta; escopo geral/focado; `PROBLEMAS.md`; F9 visão **5**.
- `c0e6943` — Produtos em `data/projects/<slug>/`; `--clean` / `qaagent-clean`; `--help` `--project` `--projects`; Chromium marker `data/.chromium-ok`; legado `data/workspace` só no `default`.
- `7777669` — Docs alinhadas (mapa, projetos, `--clean`, wiki).
- `9742412` — F3 aceita pasta local **ou** URL Git (GitHub, Gitea/Forgejo/Codeberg, Azure DevOps, GitLab, Bitbucket, SSH, `repo.git pasta`). Clone em `data/cache/git/`; refresh a cada missão; slug remoto = nome do repo.
- `aac6579` — Token Git **na F3** (Tab, campo mascarado) → `QA_GIT_TOKEN` no `.env` da ferramenta. Enter vazio **mantém** o token. `QA_GIT_TOKEN` tem prioridade sobre PAT por host.

### Comportamento (não relitigar)
- Discord/webhook: dispara só em classe **PRODUTO** (= bug confirmado na aplicação). Não dispara TESTE / MASSA / AMBIENTE / INCONCLUSIVO. O texto da TUI foi corrigido (não é “filtro de produto de negócio”).
- Join do roteiro é **heurístico** (sem LLM no join).
- Instalador local: `node instalar.mjs` neste clone; PATH = `...\QA-Agent\bin`. Abrir terminal novo após instalar.

### Testes
- `npm test` inclui `roteiro`, `impediments`, `projects`, `req-source` (parse de URLs, sem rede).

## Em andamento
Nada em código aberto nesta sessão. Handoff é só continuidade.

## Pendente (não fazer a menos que o usuário peça)
- Segunda onda: massa antes do mapa completo; jornadas genéricas.
- Join do roteiro com LLM (hoje só heurística).
- Não retestar Portal-Rural / Produtor / Documentos XML; não demos Discord; não commitar `data/`, `.env`, credenciais, `.cursor/handoffs/`.

## Decisões tomadas
- Generate lê `ROTEIRO.json`; crawl de um login **não** dirige generate.
- Um acesso F5 + vários papéis nas US = aviso de cobertura de permissão incompleta.
- Artefatos gerados por produto em `data/projects/<slug>/`; `--clean` não apaga `.env`, `settings.json`, `credenciais.md`.
- Requisitos remotos: Git no PATH; token centralizado na ferramenta (`QA_GIT_TOKEN`), não na URL.
- Wiki: manter filename `QA‐Agent.md` (U+2010).

## Ambiguidades em aberto
- Nenhuma bloqueante. Próximo trabalho só se o usuário pedir (ex. join LLM, massa-antes-mapa).

## Arquivos de saída
- Este handoff: `.cursor/handoffs/PENDING.md`
- Cópia: `.cursor/handoffs/20260910-1233-qaagent-implementacoes.md`

## Instrução para o próximo agente
Retomar deste arquivo. Não recomeçar o produto. Código e wiki já estão no GitHub `main` (`aac6579` + wiki `0f893be`). Se o usuário pedir feature nova, parta do código atual. Ao ~80% de contexto, novo handoff (skill continuidade-handoff).
