# QA Agent - Resumo por Aba (F1-F10)

**Versão:** 1.6.6  
**Propósito:** Gera specs Playwright a partir de requisitos, executa testes E2E e tria falhas com LLM.

---

## F1 - Chave

**O que configura:** API key do provedor LLM

**Funcionalidades:**
- Escolher provedor: Cursor, OpenAI, Claude (Anthropic), OpenRouter, Groq ou Custom (OpenAI-compatível)
- Validar API key antes de gravar
- Suporte a Base URL customizada para provedores OpenAI-compatíveis
- Grava `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL` no `.env`
- Lista modelos disponíveis para a chave fornecida

**Validações:**
- API key não pode estar vazia
- Base URL precisa expor `GET /v1/models` e `POST /v1/chat/completions` com Bearer (OpenAI-compatível)
- Chave precisa retornar pelo menos 1 modelo válido

**Evidências gravadas:** Provedor, máscara da chave, quantidade de modelos

---

## F2 - Modelo

**O que configura:** Modelo LLM específico para geração e triagem

**Funcionalidades:**
- Lista todos os modelos disponíveis na API key da F1
- Seleção com setas (Up/Down, PgUp/PgDn, Home/End)
- Grava `CURSOR_MODEL` e `LLM_MODEL` no `.env`
- Atualiza `data/settings.json` com a escolha

**Dependências:**
- Requer F1 configurada (API key válida)

**Validações:**
- Modelo precisa estar na lista retornada pela API

**Evidências gravadas:** ID do modelo escolhido

---

## F3 - Requisitos

**O que configura:** Origem dos requisitos (User Stories e Critérios de Aceite)

**Funcionalidades:**
- **Pasta local:** caminho absoluto ou relativo para `requisitos/` no disco
- **URL Git:** suporte a GitHub, Gitea, Forgejo, Codeberg, Azure DevOps, GitLab, Bitbucket
  - Formato: URL da pasta `requisitos/` no navegador ou `https://host/repo.git pasta/requisitos`
  - Clone shallow em `data/cache/git/`
  - Atualiza automaticamente a cada missão (git pull)
- **Token Git:** campo separado (Tab para alternar), grava `QA_GIT_TOKEN` no `.env`
  - Não cola o token na URL
  - Privacidade: token fica apenas no `.env` local

**Detecção de projeto:**
- Slug do projeto vem da pasta pai de `requisitos/` (ex: `cernova-centralXML/requisitos` → projeto `cernova-centralXML`)
- Cada projeto tem workspace isolado em `data/projects/<slug>/scripts/`

**Validações:**
- Pasta local precisa existir
- URL Git precisa ser clonável (com ou sem token, dependendo do repo)

**Evidências gravadas:** Caminho ou URL dos requisitos, token Git (se fornecido)

---

## F4 - URL

**O que configura:** URL base da aplicação sob teste

**Funcionalidades:**
- Normaliza e valida URL (http:// ou https://)
- Grava em `data/settings.json`
- Usada pelo Playwright e crawlers para abrir o sistema

**Validações:**
- Protocolo precisa ser `http://` ou `https://`
- URL precisa ser válida (não quebra `new URL()`)

**Evidências gravadas:** URL completa

---

## F5 - Login

**O que configura:** Credenciais de acesso (1 a 10 contas)

**Funcionalidades:**
- **Modo manual:** até 10 contas inline na TUI
  - Campo label (opcional): mapeia perfil/rótulo (ex: ADMIN, REVOKED)
  - Tipo de autenticação: e-mail ou CPF
  - Login e senha por acesso
  - Grava em `scripts/credenciais.md` (formato próprio)
- **Modo arquivo:** importa de `.md` ou `.json`
  - Caminho relativo ou absoluto
  - Formato: igual ao `templates/credenciais.example.md`
  - Campos: `url`, `autenticacao`, `email`/`cpf`, `senha`, label opcional
  
**Multi-acesso:**
- Mapa de perfil (F8) executa um crawl Playwright por cada login
- Roteiro associa CAs aos perfis corretos (join com labels da F5)
- Specs usam `loginAs({ profile: "ADMIN" })` conforme mapeamento

**Validações:**
- Pelo menos 1 acesso completo (login + senha não vazios)
- Arquivo precisa existir e ser parseável

**Evidências gravadas:** Quantidade de acessos, labels/logins, caminho do arquivo (se modo arquivo)

---

## F6 - Webhook

**O que configura:** Notificação externa quando bug de PRODUTO é confirmado

**Funcionalidades:**
- URL do webhook: Discord, Slack, Teams ou genérico
- Auto-detecta provedor pela URL
- Grava `WEBHOOK_URL`, `WEBHOOK_PROVIDER` (e `DISCORD_WEBHOOK_URL` se Discord) no `.env`
- Notifica apenas quando triagem classifica como **PRODUTO** (não TESTE, MASSA, AMBIENTE, INCONCLUSIVO)
- Opcional: pode ficar vazio (nenhum) ou desligado

**Validações:**
- URL precisa ser válida (começa com `https://`)
- Webhook Discord: começa com `https://discord.com/api/webhooks/`
- Webhook Slack: formato `https://hooks.slack.com/...`
- Webhook Teams: formato `https://...webhook.office.com/...`

**Evidências gravadas:** Provedor, máscara da URL ou "desligado"

---

## F7 - Opções

**O que configura:** Flags de execução e comportamento da rodada

**Funcionalidades:**
- **Rodar tudo (SIM/NÃO):** atalho que liga/desliga k6, massa, jornada, headed de uma vez
- **Auto-resume (TESTE):** se TESTE com correção de locator, retoma Playwright automaticamente (até 5×)
- **k6 após Playwright:** executa load test k6 se a suíte Playwright passar
- **Seguir após PRODUTO:** continua a suíte ao invés de parar no primeiro bug confirmado
- **Retestar quarentena:** roda apenas specs marcados com `★` (flaky/stuck)
- **Massa em runtime:** gera massa dinamicamente com LLM (`dados.json` + `gerarComAgente: true`)
- **Jornada no navegador:** crawl visual pós-Playwright, grava screenshots e video (`.webm`)
- **Navegador visível (headed):** Playwright roda com janela aberta + gravação de vídeo
- **Grep Playwright:** filtro de specs (padrão: `@executavel`; `-` roda tudo)
- **Idioma:** pt-BR ou en-US (muda strings da TUI/CLI)

**Gravação:**
- `.env`: flags individuais (`K6_ENABLED`, `MASSA_GENERATE_ENABLED`, `TOUR_ENABLED`, etc.)
- `data/settings.json`: estado completo (permite sincronizar entre TUI e CLI)

**Evidências gravadas:** Estado de cada flag, grep, idioma, "Rodar tudo"

---

## F8 - Missão

**O que faz:** Executa a rodada completa de testes

**Funcionalidades:**
- **Enter:** inicia rodada
- **R:** regenerar - força novo mapa/roteiro + reescrita de todos os specs
- **P ou Esc:** pausa no próximo checkpoint, grava `CONTINUAR.md` com guia de retomada
- **Ctrl+C:** encerra o processo

**Fases da rodada:**
1. **Sincronizar requisitos** (git pull se origem for remota)
2. **Mapa por perfil** (Playwright, sem LLM):
   - Um crawl por login da F5
   - Registra menu, controles, HTTP 401/403
   - Grava `scripts/falhas/MAPA-PERFIL.json`
   - Fingerprint: URL, F5, escopo, profundidade - se igual à rodada anterior, reutiliza o mapa
3. **Join** requisitos ∩ mapa ∩ labels F5:
   - Gera `scripts/falhas/ROTEIRO.json` (`us`, `ca`, `perfil`, `onde`, `fazer`, `esperado`, `specHint`)
   - Fingerprint: inclui hashes dos CAs - se só requisitos mudaram, refaz roteiro (reutiliza mapa)
4. **Generate** (LLM):
   - Lê roteiro + mapa + requisitos
   - Gera/atualiza specs em `scripts/tests/` (tags: `@executavel`, `@rascunho`, `@massa`, `@sem-ui`)
   - Usa `loginAs({ profile })` por linha do roteiro
   - Consulta ≠ heading (não prova apenas heading)
   - Auditoria pós-geração
5. **Logic agent** (LLM):
   - Lê RNs dos requisitos + achados do crawler
   - Escreve/atualiza `logica-rn.spec.ts`
6. **Jornada** (opcional, se TOUR_ENABLED):
   - Navegação real no navegador
   - Screenshots + video
   - Markdown de jornada
7. **Massa** (opcional, se MASSA_GENERATE_ENABLED):
   - Lê `massa/dados.json`
   - Campos `gerarComAgente: true` disparam geração por LLM
8. **Playwright** (`--max-failures=1`):
   - Roda specs filtrados por grep
   - Na falha: coleta evidências (screenshot, video, trace, log, HTML, erro)
9. **Triagem** (LLM na falha):
   - Classifica: TESTE / PRODUTO / MASSA / AMBIENTE / INCONCLUSIVO
   - TESTE com correção de locator: retoma Playwright (loop até 5×)
   - PRODUTO: notifica webhook (se configurado), opcionalmente continua suíte
   - Grava `scripts/falhas/TRIAGEM.json` e `PENDENTE.md`
10. **k6** (opcional, se K6_ENABLED e suíte passou):
    - Executa `scripts/k6/smoke.js`
    - Grava relatório HTML
11. **Relatórios finais:**
    - `COBERTURA-RESUMO-*.md` por projeto
    - `PROBLEMAS.md`: bloqueios de massa/perfil, falhas Playwright, produto, HTTP 4xx, CAs sem spec, stubs
    - `MATRIZ.json` / `MATRIZ.md`: histórico de resultados por CA
    - `JORNADA.md` + screenshots (se jornada rodou)

**Desfechos:**
- **Sucesso total:** suíte passou, k6 ok (se ligado)
- **Triagem PRODUTO:** bug confirmado, webhook disparado
- **Triagem TESTE:** spec corrigido, Playwright retomado
- **Triagem MASSA/AMBIENTE/INCONCLUSIVO:** suíte para, relatório gravado
- **Erro fatal:** agente quebrou, limite de loops, infra - grava `FALHA-FATAL.md` + `.json`
- **Pausa do usuário (P/Esc):** grava `CONTINUAR.md`, Enter retoma

**Guia de retomada (sempre):**
- `RETOMAR.md` + `.json` gravados ao fim de **qualquer** rodada
- Bloco "Como retomar" exibido na telemetria F8
- Diz o que pode reaproveitar (mapa/roteiro/specs) e o que fazer no próximo Enter (quase sempre **sem R**)

**Telemetria ao vivo:**
- Log estruturado com cores (fase, tool, erro, beat, texto LLM)
- Progresso de crawl, generate, logic, triagem, Playwright
- F10 mostra detalhes do LLM (tools, rounds, texto streamed)

---

## F9 - Consulta

**O que faz:** Visualiza relatórios e resultados de rodadas anteriores

**Funcionalidades:**
- **1 - Relatórios:** lista todos os `.md` em `scripts/falhas/`
  - COBERTURA-RESUMO, PROBLEMAS, TRIAGEM, PENDENTE, FALHA-FATAL, RETOMAR, CONTINUAR, JORNADA, MATRIZ
  - Enter abre o relatório selecionado no terminal (scroll com setas, Q ou Enter fecha)
  - Setas navegam na lista
  - Atualiza automaticamente quando novos arquivos são criados
  
- **2 - Matriz:** histórico de execuções por CA
  - Formato: CA | total execuções | passou | falhou | nunca rodou | stuck (★) | produto | N/A
  - Fonte: `scripts/falhas/MATRIZ.json`
  - Persiste entre rodadas (acumula histórico)
  
- **3 - Quarentena:** lista CAs marcados como flaky (★)
  - Specs que falharam/passaram intermitentemente
  - F7 → "Retestar quarentena" roda apenas esses specs
  
- **4 - Jornadas:** screenshots e vídeos de navegação
  - Lista arquivos `.png` e `.webm` em `scripts/falhas/jornada/`
  - Gerados na fase de jornada (TOUR_ENABLED)
  
- **5 - Problemas:** resumo consolidado de bloqueios
  - Fonte: `scripts/falhas/PROBLEMAS.md` / `.json`
  - Categorias:
    - Bloqueio: falta perfil, massa ou UI
    - Produto: bugs confirmados
    - Falha: erros Playwright (timeout, seletor, etc.)
    - Aviso: HTTP 4xx no mapa, CAs sem spec, stubs

**Navegação:**
- Setas movem seleção
- Enter abre/visualiza item selecionado
- Esc ou Q fecha visualização
- Tab alterna entre sub-abas (1-5)

---

## F10 - Agente

**O que faz:** Telemetria ao vivo do LLM (separada do log geral da F8)

**Funcionalidades:**
- **Feed de eventos:**
  - Phase: início de fase (generate, lógica, triagem, massa)
  - Tool: chamadas de ferramentas (read_file, list_dir, write_file, etc.)
  - Text: texto streamed do LLM
  - Beat: rounds, agentId, runId
  - Meta: provedor, modelo, sessão iniciada
  - Info: sessão encerrada com duração
  - Error: falhas do agente ou API

- **Indicadores de sessão:**
  - Status ATIVA (latão): agente LLM está processando neste momento
  - Status ENCERRADA (muted): última sessão terminou, duração exibida (ex: `42s`)
  - Heading da aba reflete status em tempo real

- **Navegação:**
  - Setas (Up/Down): scroll manual no feed
  - End: volta ao modo "seguir ao vivo" (auto-scroll para últimas linhas)
  - C: limpa o feed (zera buffer de eventos)

- **Buffer:**
  - Ring buffer de 500 eventos
  - Persiste durante toda a execução do TUI
  - Cada fase (generate, logic, triagem) é uma **sessão isolada** - inicia, processa, encerra

**Clarificação:**
- Quando você vê animação rodando mas "SESSÃO ENCERRADA", significa:
  - Agente LLM já foi descarregado
  - Outras etapas estão rodando (Playwright, crawlers, jornada)
  - Animação visual ≠ agente ativo

---

## Comandos CLI Extras

**Principais:**
- `qaagent --plain` - modo texto (sem TUI)
- `qaagent --plain --audit-only` - só auditoria de cobertura (sem Playwright)
- `qaagent --plain --deepen-stubs` - LLM reescreve specs `@rascunho`
- `qaagent --plain --unblock-massa` - tenta desbloquear CAs `@massa`
- `qaagent --plain --tour` - só jornada no navegador
- `qaagent --plain --load-only` - só k6 (load test)
- `qaagent --clean` - apaga specs/relatórios/massa gerados (projeto atual)
- `qaagent --clean --all --yes` - limpa todos os projetos + `data/runs`
- `qaagent --projects` - lista projetos em `data/projects/`
- `qaagent --project Nome` - roda missão para projeto específico
- `qaagent --reconfigure` - refaz wizard de configuração

**Atalhos:**
- `qaagent-audit` = `--audit-only`
- `qaagent-deepen` = `--deepen-stubs`
- `qaagent-unblock` = `--unblock-massa`
- `qaagent-massa` = gera massa via LLM
- `qaagent-tour` = `--tour`
- `qaagent-k6` = `--load-only`
- `qaagent-reports` = CLI para listar/abrir relatórios
- `qaagent-clean` = `--clean`

---

## Reuso de Artefatos (Cache)

**MAPA-PERFIL.json:**
- Fingerprint: URL, F5, escopo, profundidade de crawl
- Reutilizado se fingerprint igual à rodada anterior
- Invalidado por: mudança em URL, F5, escopo, crawl ou tecla **R**

**ROTEIRO.json:**
- Fingerprint: inclui hashes dos CAs + fingerprint do mapa
- Reutilizado se só o mapa foi reutilizado e CAs não mudaram
- Refaz só roteiro se: requisitos/CAs mudaram mas mapa é válido
- Invalidado por: mapa invalidado ou mudança nos CAs

**Specs Playwright:**
- Se `scripts/tests/` já tem arquivos, geração é pulada
- Exceção: tecla **R** (regenerate) força reescrita total

**Quando usar R (regenerate):**
- UI da app mudou (sem alterar URL/requisitos)
- Quer forçar novo mapa mesmo sem mudança em F4/F5
- Specs antigos estão desatualizados
- Suspeita de cache inválido

---

## Vários Projetos

**Estrutura:**
- `data/projects/<slug>/scripts/` - workspace isolado por produto
- Slug vem da pasta pai de `requisitos/` ou `QA_PROJECT` no `.env`
- Cada projeto tem: specs, massa, credenciais, relatórios próprios
- `.env` e `data/settings.json` são globais (compartilhados)

**Lista:** `qaagent --projects`

**Executar:** `qaagent --project Nome`

**Migração:**
- Instalação antiga em `data/workspace` continua válida apenas no projeto `default` (se a pasta existir)

---

## Segredos e Segurança

**Arquivos sensíveis (não commitar):**
- `.env` - API keys, tokens Git, webhooks
- `data/` - cache, projetos, runs
- `credenciais.md` / `credenciais.json` - logins
- `mcp.json` - configuração MCP (se usar)

**Gitignore:**
- Todos os arquivos acima já estão no `.gitignore`
- Template: `.env.example`

**Privacidade:**
- Credenciais ficam apenas na máquina local
- Git clone shallow em `data/cache/git/`
- Token Git gravado em `.env` (não na URL)
- Webhook URL mascarada em logs

---

## Licença e Cobrança

**Licença:** MIT

**Cobrança:**
- `CURSOR_API_KEY` / `LLM_API_KEY` cobra seu plano pessoal
- Geração de specs e triagem consomem runs de agente
- Playwright, k6, jornada, crawlers não consomem créditos LLM

**Repositório:** https://github.com/ErickGomesSilva/qa-agent
