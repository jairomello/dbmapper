# Proposal

## Why

O uso real do workspace revelou três atritos de usabilidade: não é possível
renomear um projeto depois de criado (dois projetos ficaram com o mesmo nome na
galeria); o rótulo "Somente leitura" no card da galeria parece status da conta e
não um link para o viewer; e o seletor de zona repetido abaixo de cada tabela na
árvore é poluído e enganoso — o modelo atual força cada tabela a uma única zona,
enquanto o uso esperado (como no produto de referência) é a mesma tabela
aparecer em várias abas/visões do diagrama.

## What Changes

- **Renomear projeto**: nova rota `PATCH /api/projects/:id` com `{ name }` para
  `MEMBER`/`ADMIN`, evento de auditoria `project.renamed` e edição na galeria
  (lápis no card) e no workspace (nome clicável + ação no menu).
- **Rótulo da galeria**: "Somente leitura" vira "Abrir visualização" no card e
  "Visualização" no menu do workspace; o selo da página do viewer permanece.
- **Zonas como visões múltiplas**: uma tabela pode pertencer a várias zonas; a
  remoção de uma zona afeta só aquela visão. O backend deixa de rejeitar membros
  repetidos entre zonas e a exclusão de uma zona devolve à `Principal` apenas as
  tabelas que não estão em nenhuma outra.
- **Sem combo na árvore**: o seletor de zona por linha sai. A árvore passa a
  arrastar tabelas para uma **aba** (adiciona àquela zona) ou para o canvas
  (adiciona à aba ativa); tabelas fora de toda zona ganham apenas um marcador
  discreto. A **ficha do item** (modo diagrama) ganha a seção "Zonas do
  diagrama" com checkboxes, e o menu do card oferece "Adicionar a ..." por zona
  e "Remover desta aba".
- **Chaves entre modelos** continuam derivadas, agora relativas à aba ativa:
  relationship com a outra ponta fora da aba ativa aparece na faixa própria.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `diagram-zones` (delta MODIFIED): associação muitos-para-muitos entre tabelas
  e zonas, entrada por arrasto na aba/canvas, remoção por aba e gestão na ficha;
  construtos de "Zonas" na árvore são removidos.
- `project-api` (delta ADDED): renomear projeto via `PATCH`.
- `project-gallery` (delta ADDED): renomear na galeria e rótulo do link do
  viewer.
- `workspace-appearance` (delta ADDED): renomear no workspace e ação no menu.
- `audit-log` (delta ADDED): evento `project.renamed`.

## Non-goals

- Editar descrição do projeto, duplicar/excluir projeto ou renomear tabelas.
- Zonas no viewer ou persistência de zonas fora do documento de layout.

## Impact

- **Backend**: `PATCH /api/projects/:id` (rota, zod, repositório, auditoria),
  remoção da validação de exclusividade de membros em `validation.ts` e
  `adapter.ts`, ajuste da devolução de membros ao excluir zona.
- **Frontend**: `projectsApi.rename`, diálogo de rename reutilizável, galeria,
  cabeçalho/menu do workspace, `zones.ts`/`useDiagramZones` multi-zona,
  `SemanticTree`, `ZoneTabs`, `DiagramCanvas`, `MetadataEditor`.
- **Specs/docs**: `diagram-zones`, `project-api`, `project-gallery`,
  `workspace-appearance`, `audit-log` e `README.md`.
- **Contrato**: JSON v1 e rotas existentes intactos; migrações inalteradas.
