# Proposal

## Why

O canvas da Fase 7 é um modelo de tela única; o produto de referência e a nossa
proposta (docs 04 §1.2, 04 §3.3, 06 §1) mostram valor em **agrupar tabelas em
abas/zonas** (ex.: módulo de pessoas × permissionamento), distinguir
**chaves entre modelos** das internas, e levar o diagrama para fora da tela
(PNG/SVG + contagem no cabeçalho). Esta é a última fase do modelador visual.

## What Changes

- **Abas/zonas**: barra `Principal` + `+` (criar com nome), renomear, excluir
  (tabelas voltam para `Principal`; `Principal` não é excluível) e reordenar
  por arrasto; cada zona tem seu próprio layout (posições/viewport/zoom).
- **Atribuição de tabelas**: toda tabela pertence a exatamente uma zona
  (default `Principal`); mover via menu/árvore; tabelas novas nascem em
  `Principal`.
- **Persistência no documento de layout**: zonas, ordem e membros entram no
  **mesmo** `PUT /api/projects/:id/diagram` — nenhuma rota ou evento de
  auditoria novo (ação continua `diagram.layout_saved`); tabela nova
  `diagram_zones` via migração aditiva.
- **"Chaves entre modelos" derivada**: relationship com extremidades em zonas
  diferentes aparece na faixa própria do card; as internas ficam em "Chaves
  estrangeiras" — sem dado novo armazenado (docs 05 §3.7, 06 §1).
- **Export PNG/SVG** do diagrama (cliente) e **contagem de tabelas** no
  cabeçalho do modo diagrama (sem teto artificial — decisão 6 do doc 09).

## Capabilities

### New Capabilities

- `diagram-zones`: agrupamento de tabelas em abas/zonas — criação/gestão de
  zonas, atribuição e movimentação de tabelas, layout por zona, chaves entre
  zonas derivadas e composição atômica do documento de layout.

### Modified Capabilities

- `diagram-canvas` (delta ADDED): export PNG/SVG do diagrama e contagem de
  tabelas no cabeçalho. **Depende** do archive da Fase 7
  (`v2-phase7-diagram`), que promove a capability `diagram-canvas` — validar
  esta fase antes do archive da 7 avisa que o alvo ainda não existe (INFO);
  a ordem 7→8→9 do roadmap garante o archive correto.

## Impact

- **Backend**: migração `diagram_zones` + `ports.ts`/`adapter.ts` (ler/gravar
  zonas no documento de layout) + schema zod do `PUT /diagram` estendido;
  nenhum endpoint novo, nenhum evento novo.
- **Frontend**: barra de abas no modo diagrama, mover tabelas, faixa de chaves
  entre modelos, export via `html-to-image`, contagem no cabeçalho.
- **Contrato**: export v1 intacto; `audit-log` sem delta (ação já coberta).
- **Fora do escopo**: edição estrutural (Fase 8), diagrama no viewer, zonas no
  modelo de dados (zonas são agrupamento visual, não schema — doc 06 §1).
