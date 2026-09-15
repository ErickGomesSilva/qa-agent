# Arquivo — fluxo de teste QA-Agent implementado (2026-09-10)

Handoff `PENDING.md` de 09:33 **consumido**. Implementação no `src/` concluída neste chat.

## Feito
- Mapa por perfil (`src/profile-map.ts`) antes do generate; HTTP 401/403; substitui o crawl de um login no run full
- Join heurístico (`src/roteiro.ts`) → `ROTEIRO.json`
- Escopo geral/focado (`src/escopo.ts`, `escopo.json` / `QA_ESCOPO_*`)
- Generate/skill: `loginAs`; heading ≠ consulta
- Aviso se F5 tem 1 acesso e US citam vários papéis
- `npm run typecheck` ok; `npm test` (join genérico) 5/5
- README.pt-BR descreve as fases

## Fora (de propósito)
- Reteste Portal-Rural / Produtor / Documentos XML
- Discord
- Segunda onda: massa mínima antes do mapa; jornadas amarradas a IDs de produto

## Join LLM
Não implementado: heurística cobre o aceite. Passo LLM só se o roteiro ficar pobre numa run real.
