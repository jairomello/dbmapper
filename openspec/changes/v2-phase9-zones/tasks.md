# Tasks

## 1. Backend: registro de zonas no documento de layout

- [x] 1.1 Tabela `diagram_zones` em `apps/api/src/db/schema.ts` + migração (`bun run db:generate`) aplicada em DB temporário — verificação: `bun test apps/api/src/tests/migration.test.ts` verde e `PRAGMA table_info('diagram_zones')` lista `name`, `tab_order`, `members_json`.
- [x] 1.2 Leitura/escrita do documento completo `{zones, layouts}` em `ports.ts`/`adapter.ts` (transação única; membros desconhecidos rejeitados; exclusão de zona devolve membros a `Principal`) — verificação: teste do adapter cobre roundtrip, rejeição de membro inexistente, devolução de membros e atomicidade (falha = nada gravado).
- [x] 1.3 Estender o zod do `PUT /diagram` (campo `zones` opcional, nome único por projeto) mantendo compatibilidade com o documento sem `zones` — verificação: teste de rota aceita documento legado (Fase 7) e novo, rejeita nome duplicado com envelope, segue gravando só `diagram.layout_saved`.

## 2. Abas de zonas no canvas

- [x] 2.1 Barra de abas no modo diagrama: zona ativa, `+` criar (com nome), renomear, excluir com confirmação (`Principal` protegida) e reordenar por arrasto — verificação: teste de componente cobre criar, renomear, excluir com devolução de tabelas e reordenação persistida.
- [x] 2.2 Troca de zona restaura posições/viewport/zoom da zona e a troca não emite requisição — verificação: teste cobre alternância com layouts distintos por zona e zero PUTs na troca.

## 3. Atribuição de tabelas

- [x] 3.1 Mover tabela entre zonas (menu de contexto do card e ação na árvore) com persistência no documento — verificação: teste cobre a remoção da zona de origem, presença na destino e um único PUT.
- [x] 3.2 Tabelas novas/importadas nascem em `Principal`; documento de layout sem `zones` (Fase 7) é lido como "todas em `Principal`" e a primeira escrita materializa os membros — verificação: teste cobre criação, import e leitura do documento legado.
- [x] 3.3 Arrastar tabela da árvore para o canvas (`dragstart`/`drop` + `screenToFlowPosition`): adiciona à aba ativa na posição do drop, move de zona quando necessário e só grava um PUT; `VIEWER` não arrasta — verificação: teste de componente cobre drop em coordenada esperada, troca de zona e gating por papel.
- [x] 3.4 Ação "Remover do diagrama" por card: tira da zona sem alterar o modelo, mantém na árvore marcada como "fora do diagrama" e oferece "Adicionar à aba atual" — verificação: teste afirma que o payload do modelo não muda e que o documento de layout perde só o membro/posição.
- [x] 3.5 Localizar tabela/coluna da árvore no diagrama: troca para a aba da zona antes de centralizar, destaca o card e trata tabela sem zona (ação de adicionar ou mensagem para `VIEWER`) — verificação: teste cobre tabela em outra zona, na mesma zona e sem zona.
- [x] 3.6 Tabela sem zona: `VIEWER` vê o diagrama sem os controles de adição/remoção (só leitura) — verificação: teste de papel como no restante do canvas.

## 4. Chaves entre zonas derivadas

- [x] 4.1 Faixa "Chaves entre modelos" no card para relationships cross-zone e "Chaves estrangeiras" para as internas, derivadas na renderização — verificação: teste cobre os dois casos (2 zonas, 1 relationship cruzando) sem nenhum campo novo no servidor.

## 5. Export, contagem e docs

- [x] 5.1 Export PNG e SVG do diagrama via `html-to-image` (dep nova + lock commitado), sem requisições de save — verificação: teste afirma geração dos dois formatos e zero chamadas de rede; `bun run check` verde com a dep.
- [x] 5.2 Contagem `N tabelas` no cabeçalho do modo diagrama (tabelas não-`REMOVED`, sem teto) — verificação: teste afirma a contagem após criar e excluir tabelas.
- [x] 5.3 Atualizar `README.md` (zonas, export) e conferir docs 04–09 — verificação: fluxos do README reproduzidos batem com a UI.

## 6. E2e de zonas

- [x] 6.1 E2e Playwright: login → diagrama → criar zona → arrastar tabela da árvore para a aba → remover do diagrama (tabela continua na árvore) → localizar por outra zona (troca de aba) → exportar — verificação: `bun run test:e2e` verde com o cenário novo.

## 7. Validate

- [x] 7.1 `bun run check` e `bun run test:e2e` — verificação: exit 0 nos dois.
- [x] 7.2 `openspec validate v2-phase9-zones --strict` — verificação: exit 0.

## 8. Archive

- [ ] 8.1 `openspec archive v2-phase9-zones --yes` após o ok do Jairo (só depois do archive da Fase 7, que promove `diagram-canvas`), marcar o checkbox e commitar — verificação: `openspec list` sem o change e `openspec/specs/diagram-zones` existente.
