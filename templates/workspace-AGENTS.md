# Paredes — workspace QA-Agent

- Playwright é o oráculo. Não declare CA como passou sem o runner.
- Não invente critério de aceite. Leia o Dado/Quando/Então no requisito.
- Não hardcode URL, usuário, CPF ou senha. Use `e2eEnv()` (`BASE_URL`, `E2E_LOGIN` / `E2E_EMAIL` / `E2E_CPF`, `E2E_SENHA`).
- Não altere a aplicação sob teste. Só este workspace (`requisitos/`, `scripts/`).
- Discord só em classe PRODUTO, depois de `scripts/falhas/PENDENTE.md`.
- Não continue a suíte inteira depois da primeira falha — o orquestrador decide retomar.
