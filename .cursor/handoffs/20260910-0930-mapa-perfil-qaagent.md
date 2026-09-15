# Handoff — Fase mapa-por-perfil + roteiro estruturado no QA-Agent

## Metadados
- Data/hora: 2026-09-10 09:30 (UTC-4)
- Workspace: `c:\Users\egomes\Documents\Documentos\Requisitos Diversos\QA-Agent`
- Modelo/agente pretendido: Agent (implementar no `src/` do QA-Agent)
- Motivo: pedido do usuário (contexto cheio + plano congelado para o chat seguinte)

## Objetivo
Implementar no QA-Agent uma fase **antes** de gerar specs: Playwright mapeia a UI **por perfil** (F5), sonda HTTP 4xx, cruza com requisitos e monta um **roteiro estruturado (JSON)**. O gerador de specs lê **requisitos + mapa + roteiro**, não o dump de US sozinho. O mesmo pipeline serve **geral** e **focado** (filtro de escopo). Economizar LLM: mapa e sonda são Playwright; modelo só no join (se precisar) e na triagem de falha.

## Fonte / documentos de entrada
- Guias Central XML (já lidos): `c:\Users\egomes\cernova-centralXML\Portal-Rural\requisitos\GUIA-TELAS-CENTRAL-XML-ATUAL.md`, `GUIA-TESTE-MANUAL-POR-PERFIL.md`, `US-Detalhadas/Feature_ExperienciaPorPerfil.md` (`US_UXP_001`), `Feature_UploadSeguro.md` (`US_UPL_001` CA02), `Feature_ValidacaoOperacional.md`, `Feature_GestaoAcessos.md` (`US_ACL_003`)
- Bug comprovado: Produtor vê menu Documentos XML; `GET /documentos` exige só `OPERADOR_RURAL` em `cernova-centralXML/backend/internal/handler/nucleo.go` (~L27–33); front traduz `SEM_PERFIL` → “Seu perfil não permite acessar esta página.”
- Discord: parecer PRODUTO já enviado (`US_UXP_001` CA01 / P2-P3) via webhook do `.env` (não alterar URL; não logar segredo)
- Harness atual: `src/orchestrator.ts` gera **depois** explora com **um** login (`credPrimary`); `src/logic-explore.ts` ignora 4xx; grep padrão `@executavel`
- Specs ruins de referência (não apagar no primeiro PR se não for necessário): `data/workspace/scripts/tests/US_UXP_001.spec.ts` (`@rascunho`, só heading), `US_UPL_001.spec.ts` CA02 `test.skip(true)`
- Roteiro focado já rodado (workspace, gitignored): `data/workspace/scripts/playwright.roteiro.config.ts`, `tests/roteiro-*.spec.ts`, `run-roteiro.ts`, `helpers/roteiro.ts`, `credenciais.md`

## Já concluído
- [x] Diagnóstico: suíte gerada não exercita perfil de consulta; heading ≠ lista; skip eterno de permissão
- [x] Roteiro manual automatizado (sem mudar `src/`): P2/P3 falhou como PRODUTO; V1 skip por falta de linha
- [x] Confirmação nas US: P2/P3 corretos; bug é API
- [x] Notificação Discord enviada
- [x] Decisão de produto: fase mapa Playwright por perfil **antes** de gerar; roteiro JSON (não prosa LLM); mesmo pipeline geral/focado
- [x] Plano de implementação (este arquivo, seção “Plano congelado”)

## Em andamento
- Implementar o plano no código do QA-Agent (orquestrador + mapa + roteiro + prompt de generate + escopo)
- Nenhum arquivo de `src/` foi alterado ainda de propósito (pedido anterior: não mexer até ter plano)

## Pendente
1. Implementar mapa por perfil + sonda HTTP (Playwright)
2. Ligar no orquestrador **antes** de `runGenerateAgent`
3. Artefato `roteiro.json` (US ∩ mapa ∩ labels F5)
4. Generate lê mapa + roteiro; `loginAs(label)`; Entao observável; `@sem-ui` se mapa não tem tela
5. Escopo `geral` | `focado`
6. Jornada curta O1→P2→V1 como spec `@jornada` quando o escopo/dados permitirem
7. Se F5 tiver 1 acesso só: falhar alto (não gerar suíte fingindo cobertura de perfil)
8. Critério de aceite: com credenciais Central XML, o mapa (ou spec gerado) acusa PRODUTO no Produtor × `GET /documentos` / SEM_PERFIL — não heading verde
9. Não reenviar Discord neste PR salvo triagem PRODUTO real de uma run nova

## Decisões tomadas
- **Não** gerar roteiro em prosa só a partir de US (inventa tela inexistente)
- Mapa = Playwright por **cada** label do F5; LLM fora do crawl
- 403/401 em rota do próprio app, no perfil que a US autoriza = PRODUTO (explore hoje ignora 4xx — mudar nesse recorte)
- Heading da página **não** prova consulta; precisa de lista, empty da lista, ou recusa explícita
- CA que cita perfil → `loginAs`; senão `@massa` de verdade (credencial ausente), nunca `test.skip(true)` genérico
- Recorte geral vs focado = **filtro** do mesmo pipeline, não dois motores
- Jornada / efeito colateral / massa mínima são a segunda onda do mesmo plano (implementar esqueleto + mapa + join + generate na primeira entrega; jornada O1–P2–V1 se couber no mesmo PR sem inflar)
- Não commitar `data/`, `.env`, `credenciais.md`
- Continuar **sem** quebrar a CLI/TUI existente: fase nova no fluxo de run normal; flag/env para escopo

## Ambiguidades em aberto
- Join US×mapa: heurística determinística primeiro; **um** passo LLM só se o join ficar pobre (não gerar spec direto das US)
- Nomes exatos de env (`QA_SCOPE`, arquivo `scripts/escopo.json`) — implementar com um mecanismo claro e documentar no README.pt-BR (seção curta)
- Tour headed (`TOUR_ENABLED`) pode permanecer depois do mapa; não substitui o mapa por perfil

## Arquivos de saída
- `.cursor/handoffs/PENDING.md` (este)
- `.cursor/handoffs/20260910-0930-mapa-perfil-qaagent.md` (cópia)
- `.cursor/handoffs/CONTINUAR.txt`

## Instrução para o próximo agente
Retomar do item "Em andamento": **implementar o plano congelado abaixo**. Não recomeçar o teste manual da Central XML. Não redesenhar o produto. Ler este arquivo e o skill continuidade-handoff. Ao ~80% de contexto, novo handoff.

---

## Plano congelado (implementar)

### Problema
Ordem atual em `src/orchestrator.ts`: generate a partir de `requisitos/` → explore com `credPrimary` → Playwright `@executavel`. Specs de experiência saem `@rascunho` ou skip. Permissão não usa F5. 4xx ignorado. Bug Produtor/Documentos XML passa em heading e falha só no roteiro focado.

### Pipeline alvo (run normal)

```
sync requisitos
ensureChromium
[1] mapa por perfil (Playwright) → scripts/falhas/MAPA-PERFIL.json
[2] se 1 acesso no F5 e requisitos citam vários perfis: log + status explícito (não inventar cobertura)
[3] join requisitos ∩ mapa ∩ F5 → scripts/falhas/ROTEIRO.json
[4] generate-agent lê ROTEIRO.json + MAPA + requisitos (prompt em src/prompt-generate.ts)
[5] audit / massa (existente) / Playwright / triagem (existente; Discord só PRODUTO)
```

Explore/crawler atual (`runLogicExplore`) **não** some: ou passa a ser multi-acesso, ou o mapa novo o substitui no caminho de generate. Não deixar dois crawls redundantes no mesmo run (custo). Preferir **substituir** o explore de um login pelo mapa multi-perfil neste fluxo.

### Artefato MAPA-PERFIL.json (exemplo de contrato)

```json
{
  "version": 1,
  "baseUrl": "http://…",
  "perfis": [
    {
      "label": "produtor",
      "loginMasked": "produtor@…",
      "rotas": [
        {
          "path": "/app/documentos",
          "heading": "Documentos",
          "menu": ["Visão geral", "Documentos XML", "Pendências", "Livro Caixa"],
          "controles": { "Enviar XML": "ausente", "Validar operação": "ausente" },
          "http": [{ "method": "GET", "url": "/documentos", "status": 403, "codigo": "SEM_PERFIL" }]
        }
      ],
      "recusasVisiveis": ["Seu perfil não permite acessar esta página."]
    }
  ]
}
```

- Entrar com `loginAs` / mesmo fluxo de `templates/workspace/helpers/auth.ts` (não duplicar seletor frágil no core; reutilizar tryLogin + contexto).
- Por perfil: itens de menu (role link), botões visíveis nas rotas do escopo, toasts/empty/erro.
- Interceptar responses same-origin; registrar 401/403 (+ body `codigo` se JSON).
- Escopo focado: só paths/labels informados; geral: links do menu após contexto.

### Artefato ROTEIRO.json

Cada caso: `us`, `ca`, `perfil` (label F5), `onde` (path ou nome de menu), `fazer`, `esperado` (`visivel` | `ausente` | `http-ok` | `http-recusa` | `sem-ui` | `massa`), `specHint`.

Regra de join (determinística, prioridade):
- US/CA cita perfil e o label existe no F5 → caso com esse `loginAs`
- CA exige tela e mapa **não** tem controle/rota → `sem-ui` (não spec clicável)
- CA autoriza consulta e mapa tem menu **e** http 403/SEM_PERFIL → caso `esperado: http-ok` (vai falhar = PRODUTO) **não** marcar passado por heading
- CA de recusa de ação (upload/validar) → assert controle `ausente` **e** não pular a consulta da mesma tela

### Generate (`src/prompt-generate.ts` + skill workspace)

Obrigar:
- Fonte primária dos `test()`: `ROTEIRO.json`; requisitos só para texto do Entao/RN
- `loginAs(page, label)` com o `perfil` da linha
- Não assertar só `getByRole('heading')` quando o esperado for lista/consulta
- `@executavel` só com Entao observável; `@sem-ui` / `@massa` conforme roteiro
- Proibido `test.skip(true)` genérico de “precisa de outro usuário”

Ajustar `templates/qa-e2e-requisitos/SKILL.md` **e** a cópia que `ensureWorkspace` publica, para o agente de generate obedecer (isso é template do produto, não “app do cliente”).

### Escopo geral vs focado

- Env ou `data/workspace/scripts/escopo.json`: `{ "modo": "geral" | "focado", "labels": ["produtor","validador"], "paths": ["/app/documentos"] }`
- Focado = menos rotas no mapa e menos linhas no roteiro; **mesmas** regras de sonda HTTP e `loginAs`
- README.pt-BR: parágrafo de como apontar o escopo

### Segunda prioridade (mesmo PR se couber; senão TODO no código)

- Setup massa mínimo (1 XML) antes do mapa “cheio”, para não marcar Validar como ausente por lista vazia
- Uma jornada `@jornada` O1 → P2 → V1 quando houver labels `operador`, `produtor`, `validador` e mock XML
- Assert de efeito: upload não implica caixa (se a tela Financeiro existir no mapa)

### Fora deste PR
- Reescrever os 100+ `US_*.spec.ts` já gerados no `data/workspace` (gitignored; próxima **run** com regenerate)
- Corrigir o backend Central XML (`nucleo.go`) — bug do produto, outro repo
- Novo Discord “de teste”
- Tour como substituto do mapa

### Aceite
1. Typecheck / testes unitários do join se houver função pura (mapa + CAs fixture → ROTEIRO com caso Produtor documentos http-ok)
2. Run focado (se URL/creds ainda no `.env`): mapa do `produtor` registra 403/SEM_PERFIL em documentos **ou** spec `@executavel` falha nesse Entao
3. Com 1 login só + US citando Produtor e Operador: run **não** declara cobertura de permissão
4. `src/` do qaagent muda; `data/` continua gitignored

### Arquivos prováveis a tocar
- `src/orchestrator.ts` (ordem)
- `src/logic-explore.ts` ou novo `src/profile-map.ts`
- `src/prompt-generate.ts`, `src/prompt.ts`
- `src/config.ts` / `src/i18n.ts` (escopo, logs de fase)
- `templates/qa-e2e-requisitos/SKILL.md`
- `README.pt-BR.md` (curto)
- Testes unitários em `src/` se o repo já tiver padrão; senão funções puras testáveis no join
