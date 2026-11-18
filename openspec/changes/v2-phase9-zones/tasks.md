# Tasks

## 1. Backend: registro de zonas no documento de layout

- [ ] 1.1 Tabela `diagram_zones` em `apps/api/src/db/schema.ts` + migração (`bun run db:generate`) aplicada em DB temporário — verificação: `bun test apps/api/src/tests/migration.test.ts` verde e `PRAGMA table_info('diagram_zones')` lista `name`, `tab_order`, `members_json`.
- [ ] 1.2 Leitura/escrita do documento completo `{zones, layouts}` em `ports.ts`/`adapter.ts` (transação única; membros desconhecidos rejeitados; exclusão de zona devolve membros a `Principal`) — verificação: teste do adapter cobre roundtrip, rejeição de membro inexistente, devolução de membros e atomicidade (falha = nada gravado).
- [ ] 1.3 Estender o zod do `PUT /diagram` (campo `zones` opcional, nome único por projeto) mantendo compatibilidade com o documento sem `zones` — verificação: teste de rota aceita documento legado (Fase 7) e novo, rejeita nome duplicado com envelope, segue gravando só `diagram.layout_saved`.

## 2. Abas de zonas no canvas

- [ ] 2.1 Barra de abas no modo diagrama: zona ativa, `+` criar (com nome), renomear, excluir com confirmação (`Principal` protegida) e reordenar por arrasto — verificação: teste de componente cobre criar, renomear, excluir com devolução de tabelas e reordenação persistida.
- [ ] 2.2 Troca de zona restaura posições/viewport/zoom da zona e a troca não emite requisição — verificação: teste cobre alternância com layouts distintos por zona e zero PUTs na troca.

## 3. Atribuição de tabelas

- [ ] 3.1 Mover tabela entre zonas (menu de contexto do card e ação na árvore) com persistência no documento — verificação: teste cobre a remoção da zona de origem, presença na destino e um único PUT.
- [ ] 3.2 Tabelas novas/importadas nascem em `Principal`; tabela sem zona aparece só em `Principal` — verificação: teste cobre criação, import e renderização por zona.

## 4. Chaves entre zonas derivadas

- [ ] 4.1 Faixa "Chaves entre modelos" no card para relationships cross-zone e "Chaves estrangeiras" para as internas, derivadas na renderização — verificação: teste cobre os dois casos (2 zonas, 1 relationship cruzando) sem nenhum campo novo no servidor.

## 5. Export, contagem e docs

- [ ] 5.1 Export PNG e SVG do diagrama via `html-to-image` (dep nova + lock commitado), sem requisições de save — verificação: teste afirma geração dos dois formatos e zero chamadas de rede; `bun run check` verde com a dep.
- [ ] 5.2 Contagem `N tabelas` no cabeçalho do modo diagrama (tabelas não-`REMOVED`, sem teto) — verificação: teste afirma a contagem após criar e excluir tabelas.
- [ ] 5.3 Atualizar `README.md` (zonas, export) e conferir docs 04–09 — verificação: fluxos do README reproduzidos batem com a UI.

## 6. E2e de zonas

- [ ] 6.1 E2e Playwright: login → diagrama → criar zona → mover tabela → trocar de aba (layout preservado) → exportar — verificação: `bun run test:e2e` verde com o cenário novo.

## 7. Validate

- [ ] 7.1 `bun run check` e `bun run test:e2e` — verificação: exit 0 nos dois.
- [ ] 7.2 `openspec validate v2-phase9-zones --strict` — verificação: exit 0.

## 8. Archive

- [ ] 8.1 `openspec archive v2-phase9-zones --yes` após o ok do Jairo (só depois do archive da Fase 7, que promove `diagram-canvas`), marcar o checkbox e commitar — verificação: `openspec list` sem o change e `openspec/specs/diagram-zones` existente.
