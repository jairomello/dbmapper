# Proposal

## Why

O DBMapper já importa DDL e edita o dicionário, mas não fecha o ciclo: o que é
modelado no canvas não volta para o banco. O produto de referência gera SQL a
partir do diagrama (`docs/analysis/05` §4: "fechar o ciclo
import→editar→exportar") e essa é a peça que falta para o DBMapper ocupar o
lugar do ERWin no fluxo de trabalho do dia a dia.

## What Changes

- **Nova capability `schema-ddl`**: geração de script SQL a partir do modelo,
  em dois modos:
  - **script completo** — `CREATE TABLE` de todas as tabelas não-`REMOVED` com
    colunas, `PRIMARY KEY` e `FOREIGN KEY`;
  - **migração** — `ALTER` calculado contra o *baseline* do banco (tabelas/colunas
    criadas, removidas, com tipo alterado e FKs adicionadas/removidas).
- **Baseline por projeto**: capturado automaticamente no *apply* do import de
  SQL (a estrutura importada é a verdade do banco) e por ação explícita
  "Marcar banco como sincronizado" depois de aplicar o script. Sem baseline, só
  o modo "script completo" fica disponível.
- **Dialetos** `postgres` (default) e `mysql`, com conversão dos tipos comuns do
  modelo; tipos desconhecidos são emitidos como estão e listados como aviso no
  preview.
- **Renomeações só com mapeamento explícito** — mesmo padrão do wizard de
  atualização (`model-update-wizard`); sem mapeamento, o par vira `DROP`+`CREATE`
  e o preview avisa sobre perda de dados.
- **Preview no workspace**: seletor de dialeto/modo, script em área somente
  leitura, avisos, lista de operações destrutivas, copiar e baixar `.sql`.
- **Rotas novas**: `GET /api/projects/{id}/ddl` (geração, sem escrita) e
  `PUT /api/projects/{id}/ddl/baseline` (`MEMBER`+), com evento
  `ddl.baseline_captured` no `events`.

**Non-goals:** conectar e executar no banco alvo (nunca guardar credenciais de
banco), introspecção de banco vivo, índices/views/triggers/sequences (fora do
contrato v1), exposição via MCP/API key, e geração de código de aplicação.

## Capabilities

### New Capabilities

- `schema-ddl`: contrato de geração do DDL (script completo e migração por
  dialeto), captura e leitura do baseline, mapeamento de renomeações, avisos e
  operações destrutivas, e a superfície HTTP/UI correspondente.

### Modified Capabilities

- `audit-log`: novo evento `ddl.baseline_captured` entra na cobertura de
  mutações auditadas.
- `model-import`: o *apply* de um import de SQL passa a capturar/atualizar o
  baseline do projeto na mesma transação.

## Impact

- **Backend**: pacote puro `packages/ddl` (sem deps novas), tabela
  `schema_baselines` (migração aditiva) via `schema.ts` + `ports.ts` +
  `adapter.ts`, rotas em `apps/api/src/routes`, zod de query, evento novo.
- **Import**: `POST /import/apply` grava baseline junto do modelo (mesma
  transação) sem mudar o contrato de resposta.
- **Frontend**: diálogo "Gerar SQL" (dialeto, modo, preview, copiar/baixar) e
  ação "Marcar como sincronizado"; sem nova rota de app.
- **Contrato**: export v1 intacto — o DDL é derivado, não persistido no modelo.
- **Testes**: unitários do pacote (snapshots de SQL por dialeto e diff),
  integração de rotas/baseline/auditoria, componente do diálogo, e2e do fluxo.
