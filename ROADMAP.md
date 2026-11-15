# Roadmap — DBMapper v2

Plano de evolução em **7 fases, uma de cada vez**. Regra combinada com Jairo em
14/11/2026: **ao terminar cada fase, parar e esperar o ok para iniciar a
próxima** — sem pressa, vamos aos poucos. Design e decisões:
[`docs/analysis/03-proposta-evolucao-v2.md`](./docs/analysis/03-proposta-evolucao-v2.md).

| #   | Fase                     | Entrega verificável                                                                                                                       | Change OpenSpec      | Status                 |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------- |
| 0 | **Scaffold** | Monorepo Bun (apps/api, apps/web, apps/mcp, packages/), Biome, Drizzle + primeira migração, gates `check`, `bun test` rodando | `v2-phase0-scaffold` | ✅ concluída em 14/11/2026 |
| 1   | **Domínio + import**     | Schema SQLite completo; parser e diff do v1 portados com testes; API de projeto + import SQL com preview/apply; export JSON v1-compatível | `v2-phase1-domain-import` | ✅ concluída em 14/11/2026 |
| 2   | **Auth + multi-usuário** | Login/logout, usuários, papéis `ADMIN/MEMBER/VIEWER`, rotas protegidas                                                                    | `v2-phase2-auth` | ✅ concluída em 14/11/2026 |
| 3   | **UI React**             | Árvore, editor de metadados, wizard de atualização, barra de status — specs v1 como critérios de aceitação                                | a criar ao liberar   | ⏳ aguardando          |
| 4   | **Agente interno**       | Provider LLM, geração em lote de sugestões, fila de aprovação na UI, auditoria                                                            | a criar ao liberar   | ⏳ aguardando          |
| 5   | **MCP + opencode**       | Tools MCP, API key, **skill**, documentação; teste ponta-a-ponta com opencode conectado                                                   | a criar ao liberar   | ⏳ aguardando          |
| 6   | **Polish**               | DBViewer como rota read-only, auditoria completa, preparação para deploy (notebook → labapps → Vultr `jairo.tools`)                       | a criar ao liberar   | ⏳ aguardando          |

## Como funciona

- Este roadmap é o plano-mãe. Cada fase vira **um change OpenSpec** com seus
  artefatos (`proposal.md`, `design.md`, `specs/`, `tasks.md`) — criado **quando
  a fase for liberada**, para não especular design de fases futuras.
- Implementação delegada ao opencode, com revisão antes de aplicar no share
  (fluxo da skill `trabalhar-projetos`).
- Ao terminar a fase: marcar ✅ nesta tabela, commit de encerramento, **parar e
  esperar o ok** do Jairo para a próxima.
- Fora do roadmap (backlog pós-v2): desenhador de modelo ER, versionamento do
  modelo com scripts de migration/rollback, JSON do dicionário sincronizado no
  repositório do sistema — ver §10 da proposta.

## Histórico

- 14/11/2026 — análise da v1, análise do Azy Board e proposta aprovadas;
  reorganização do repositório (`legacy/`); roadmap e change da Fase 0 criados.
