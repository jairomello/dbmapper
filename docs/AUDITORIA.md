# Auditoria do DBMapper

Toda mutação do dicionário grava um evento append-only na tabela `events`, na
mesma transação da mudança. A tela **Auditoria** (`/audit`, restrita a `ADMIN`)
lista os eventos mais recentes primeiro e filtra por família: `project.`,
`model.`, `diagram.`, `user.`, `item.`, `agent.`, `api_key.` e `ddl.`.

A leitura também está disponível pela API:
`GET /api/events?action=...&projectId=...&limit=...` (ADMIN, limite máximo de 500
eventos).

## `ddl.baseline_captured`

- **Rótulo na tela de auditoria:** "Baseline de DDL capturado".
- **Família:** `ddl.` (seletor **DDL** na página de auditoria).
- **Sujeito:** `project` com o id do projeto.

Quando é emitido:

1. **Captura manual** — ao clicar em **Marcar banco como sincronizado** no
   diálogo **Gerar SQL**, que chama `PUT /api/projects/{id}/ddl/baseline`
   (`MEMBER`/`ADMIN`). O payload traz `source: "manual"`.
2. **Apply do import de SQL** — automaticamente em
   `POST /api/projects/{id}/imports/apply`, na mesma transação que grava o
   modelo. O payload traz `source: "import"`. Se o apply falhar, nem o modelo nem
   o baseline nem o evento são gravados.

O payload também resume a estrutura capturada:

```json
{
  "tables": 3,
  "columns": 10,
  "source": "manual"
}
```

A geração de DDL (`GET /api/projects/{id}/ddl`) é somente leitura: não grava
baseline, não altera o modelo e não emite evento.
