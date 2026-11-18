# Proposal

## Why

A Fase 7 entregou o canvas de visualização; sem edição, o modelador continua
inútil para autorar. Esta Fase 8 torna o canvas a superfície de edição
estrutural — criar/excluir tabelas e colunas, criar relacionamentos — mantendo
as regras do produto: contrato v1 intacto, save via `PUT` existente, auditoria
inalterada e `VIEWER` sem direito de escrita.

## What Changes

- **Criar/excluir tabela** pelo canvas (menu de contexto nas coordenadas do
  cursor e botão da toolbar) e **criar/excluir coluna** no card.
- **Criar relacionamento** arrastando entre cards ou pelo modo `1:n`, com
  **auto-criação da coluna FK** (`<tabela_destino>_id`, nome editável): o
  cliente compõe coluna + relationship num **único** `PUT /api/projects/:id`
  — o backend não cria coluna sozinho e o PUT já é atômico (probe, doc 07 §3).
- **Popover de coluna** com os campos que o modelo v1 tem (nome, tipo/tamanho,
  PK, FK) e validações inline (obrigatório, duplicado); descrição/termos/revisão
  continuam no painel do editor.
- **Fila de comandos única** com `reverse_action` (padrão do doc 05 §2):
  serializa os PUTs (um em voo), alimenta **undo/redo** e dirige o indicador
  `Salvando...`/`Salvo às: HH:MM`.
- **VIEWER**: todos os controles de edição ocultos (o `PUT` já responde 403).

## Capabilities

### New Capabilities

- `diagram-editing`: edição estrutural do modelo pelo canvas — criação e
  exclusão de tabelas/colunas/relacionamentos (com coluna FK auto-criada),
  popover de coluna, validações, undo/redo, fila de save e restrição por papel.

### Modified Capabilities

- _None._ Nenhuma requirement existente muda: o `PUT /api/projects/:id`, a
  spec `semantic-editor` (descrições/termos/revisão seguem no painel do
  editor), `audit-log` (ações já cobertas por `project.saved`) e
  `project-api` permanecem como estão.

## Impact

- **Frontend**: novos componentes de edição no `apps/web` (popover, menu de
  contexto, fila de comandos, indicador de save), composição de payload de
  `PUT`, gating por papel; testes de componente e e2e novo.
- **Backend**: nenhum — reusa `PUT /api/projects/:id` (atómico, validado por
  zod) e `requireRole('MEMBER')` já existente.
- **Contrato**: payload de modelo v1 inalterado (coluna + relationship já são
  parte dele); export congelado segue intacto.
- **Fora do escopo**: flags `NN/UQ/AI/UUID` (decisão 4), zonas/abas (Fase 9),
  export de imagem, edição de descrição/termos pelo canvas.
