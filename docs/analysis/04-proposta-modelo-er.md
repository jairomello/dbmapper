# Proposta — Modelador ER visual para o DBMapper (canvas + abas/zonas)

> Análise das referências em `~/shared/modelo/` (5 PNG + 2 MP4, 18/11/2026).
> Sistema de referência: editor de "Modelo de dados" do **Mad.Builder**
> (`app.madbuilder.com.br`, v4.2, framework Adianti — identificado pelo HTML
> salvo; ver `05-avaliacao-madbuilder-html.md`). As capturas tinham sido
> atribuídas a "Builder Ensino", provavelmente o mesmo produto white-label.
> Vídeos analisados por extração de frames (ffmpeg); áudio não transcrito —
> não há ASR nesta VM.

## 1. O que o sistema de referência faz (detalhado)

### 1.1 Layout em zonas
- **Top bar escura** com breadcrumb do projeto e contagem de tabela:
  `Curso Micro ERP > Micro ERP > 10 / 500 tabelas`.
- **Activity bar** esquerda estreita (ícones de view/ferramenta, ativo em laranja).
- **Painel de lista** com busca (`Buscar`) e árvore de tabelas; cada item tem
  seta de expansão, ícone de pasta/tabela e ícones de status (olho = visibilidade,
  cadeado = permissão, quadrado vermelho = excluir, quadrado cinza = ver).
- **Canvas** claro com grade pontilhada, minimapa no canto superior direito.

### 1.2 Abas = zonas do modelo
- Barra de abas acima do canvas: aba ativa **`Principal`** (ícone de lápis),
  aba **`Permission`** (cadeado) e botão **`+`** para criar nova aba/zona.
- Cada aba é uma zona/sub-modelo com seu próprio conjunto de tabelas no canvas.
- Existem "Modelos do template" (Permission, Communication, Tag) que se
  vinculam a modelos próprios (ícone de corrente = relacionamento entre modelos).
- Rodapé de cada card tem duas faixas colapsáveis: **"Chaves entre modelos"**
  (cinza/azul, relações que saem da zona) e **"Chaves estrangeiras"** (rosa, FKs
  internas), cada uma com `+` e seta `»`.

### 1.3 Cards de tabela (entidades)
- **Header** azul: nome da tabela + ícone de grade.
- **Corpo** branco: colunas com ícones — chave amarela = PK, FK vermelha/círculo;
  ex.: `id int`, `nome varchar(255)`.
- **Footer**: faixas de chaves (acima) + toggle `Exibir campos` / `Exibir relações`
  + ícone de excluir.
- Selecionado: handles de resize (quadradinhos) e menu flutuante
  (`+` adicionar, engrenagem = configurações, lixeira = excluir).

### 1.4 Relacionamentos
- Linhas entre cards com **roteamento ortogonal** e **notação crow's foot**
  (traço = um, garra = muitos); tracejadas em algumas views, sólidas em outras.
- **Handles azuis** nas bordas (topo/baixo/esquerda/direita) de cada card:
  arrasta de um handle até outra tabela para criar a relação.
- Diálogo de criação: `Campo` + `Tabela` (destino) e cardinalidade
  **`1:N`, `1:1`, `N:1`, `N:M`**.
- **Propriedades do relacionamento** (popover): `Nome`, `Tipo de relacionamento`
  (`Um para Muitos (1:MM)`, `Muitos para Um (MM:1)`, `Um para Um (1:1)`,
  `Muitos para Muitos (MM:MM)`), `Modelo origem`, `Modelo destino`,
  `Chave estrangeira`, botões `Salvar` / `Cancelar` / `Excluir`.

### 1.5 Edição de coluna (popover)
- Variantes observadas nos vídeos:
  - `Nome`, `Tipo` (VARCHAR), `Tamanho` (255), `Valor padrão` (NULL), `Label`,
    checkboxes **`NN` (not null), `UQ` (unique), `AI` (auto-incremento), `UUID`,
    `FK`**, e flags de usabilidade **`Coluna visualizável`, `Exibida em listas`,
    `Utilizada em filtros`**.
  - Validações inline: dica `Obrigatório quando o tipo for VARCHAR` e erro
    vermelho **`A tabela pode ter apenas uma coluna visualizável. A coluna
    "nome" já está marcada como visível.`** e **`Campo obrigatório`**.
  - Ação `Excluir coluna` (link vermelho).

### 1.6 Ferramentas do canvas
- Zoom `+ / −`, lupa, **desfazer/refazer**, select, **Adicionar uma nova tabela**
  (tooltip), indicador `1:n`, minimapa, fullscreen, check de salvar.
- Menu de contexto por tabela (`+`, engrenagem, lixeira).
- Contagem de tabelas no breadcrumb (`10 / 500`) e estado de permissão
  (`Somente leitura`).

## 2. Gap em relação ao DBMapper

| Já existe no v2 | Não existe (alvo desta proposta) |
|---|---|
| Modelo relacional completo (tabelas, colunas, FKs, relationships) | **Canvas visual ER** (nada gráfico hoje) |
| Árvore semântica + editor de metadados + wizard de atualização | **Abas/zonas do modelo** |
| Cobertura, revisão, fonte (humano/IA/MCP), auditoria | **Layout persistido** (posições/zoom) |
| Import SQL server-side, export v1, galeria, viewer read-only | **Criar/editar relacionamentos pelo canvas** (handles + cardinalidade) |
| Agente (sugestões), MCP, chaves, deploy docker | Minimapa/zoom/undo-redo, menu de contexto, contagem |

O backlog §10.1 da proposta v2 já previa isto: *"Desenhador de modelo ER —
antes de implementar, pesquisar boa biblioteca open source já existente"*.
Esta proposta é a resposta a essa pesquisa.

## 3. Decisões técnicas propostas

### 3.1 Biblioteca do canvas — recomendação: **React Flow (`@xyflow/react`, MIT)**
- Nodes customizáveis (perfeitos para o card ER com header/corpo/footer),
  **handles** nas bordas (criação de relacionamento por arrasto),
  **minimap, zoom/pan, grid e edge routing** nativos — exatamente o checklist
  do vídeo, sem escrever hit-testing/rota de aresta à mão.
- Alternativas descartadas: `rete.js` (mais genérico e burocrático),
  embed do draw.io (difícil de acoplar ao estado React), canvas SVG artesanal
  (muito trabalho para o mesmo resultado).
- Conflito de regra? Não: a regra "sem framework/bundler" do AGENTS.md é
  escopada para `legacy/`; React já é o padrão do v2.

### 3.2 Persistência do layout — tabela nova `diagram_layouts`
```sql
diagram_layouts(id, project_id FK, zone_name, positions_json /* {table: {x,y}} */,
                zoom, updated_at, updated_by)
-- UNIQUE(project_id, zone_name)
```
- **Chave por nome de tabela** (não id): o layout sobrevive a re-import de SQL
  e a troca de modelo; renames explícitos do wizard atualizam as chaves.
- Fica **fora do export v1** (contrato intacto) — é estado interno do v2.
- Endpoint `GET/PUT /api/projects/:id/diagram` (VIEWER lê, MEMBER grava);
  a PUT é mutante → grava evento `diagram.layout_saved` (a spec `audit-log`
  exige evento em **toda** rota mutante — o teste tabela-Driven cobriria).

### 3.3 Abas/zonas
- Zona = agrupamento nomeado de tabelas (default `Principal`), com próprio
  layout. Atribuição tabela→zona persistida junto do layout
  (`positions_json` por zona + `members` ou campo `zone` na tabela).
- A aba mostra as tabelas da zona; relacionamentos **entre zonas** aparecem
  como "Chaves entre modelos" (faixa do rodapé) — ligação direta com o vídeo.
- Criação de zona pelo `+` na barra de abas; mover tabela entre zonas pelo
  menu de contexto / arrasto na lista lateral.

### 3.4 Edição no canvas
- **Estrutura** (criar/excluir tabela, coluna, relacionamento): reusa o caminho
  existente `PUT /api/projects/:id` (mesmo fluxo do editor atual) + invalidação
  React Query + evento `project.saved` já existente — sem novos endpoints de
  modelo.
- **Metadados** (descrição, termos, revisão): reaproveita o padrão já pronto
  (`PATCH` de descrição com fonte/auditoria).
- Popover de coluna do vídeo mapeado para os campos que **o modelo v1 tem**:
  nome, tipo/tamanho, PK, FK (via relationship), descrição, termos, revisão.
  As flags `NN/UQ/AI/UUID/Coluna visualizável` **não existem** no contrato v1 —
  ver perguntas abaixo.
- Undo/redo: fila local no cliente (comandos sobre o modelo em memória).

### 3.5 Encaixe na UI
- View **`Diagrama`** dentro do workspace (toggle Árvore/Editor ↔ Diagrama),
  mantendo seleção sincronizada (clicar na árvore centraliza o card e vice-versa);
  alternativa seria rota própria `/project/:id/diagram` (menos integração).
- Estilo seguindo a referência (adaptado ao design system existente): header
  azul, rodapé de chaves, grade, minimapa, toolbar com zoom/undo/add.

## 4. Proposta de fases (ritmo atual: uma fase por vez)

| # | Fase | Entrega verificável |
|---|---|---|
| **7** | **Canvas ER visual** | React Flow no workspace; cards com header/colunas/rodapé de chaves; arestas crow's-foot das relationships existentes; zoom/pan/minimapa/grid; busca lateral com highlight; arrasto persiste layout (`diagram_layouts` + evento); sync seleção árvore↔canvas; e2e |
| **8** | **Edição no canvas** | Popover de coluna (campos v1), criar/excluir tabela e coluna, criar/editar/excluir relacionamento por handle + diálogo de cardinalidade, menu de contexto, undo/redo, validações inline |
| **9** | **Zonas/abas + polish** | Abas `Principal`/`+` com zonas, "Chaves entre modelos", mover tabela entre zonas, export PNG/SVG do diagrama, contagem no breadcrumb |

Estimativa de delegações (opencode, como sempre): Fase 7 ≈ 2 runs
(backend layout+API / frontend React Flow) + e2e; Fase 8 ≈ 2–3 runs;
Fase 9 ≈ 1–2 runs. Cada fase = um change OpenSpec (`v2-phase7-diagram`, …).

## 5. Perguntas antes de liberar

1. **Biblioteca**: React Flow (MIT) como base? *(recomendado)*
2. **Recorte**: começar pela Fase 7 só (visualização + layout) e ir a Fase 8
   depois, ou já liberar 7+8 juntas? *(recomendado:7 primeiro)*
3. **Abas/zonas**: entrar na Fase 7 (já com `Principal`/`+`) ou deixar para a
   Fase 9 como está no plano? *(recomendado: Fase 9)*
4. **Flags `NN/UQ/AI/UUID` e "Coluna visualizável"**: não existem no contrato
   v1 — (a) não incluir (recomendado), (b) incluir como campos novos do modelo
   (muda o export v1 e o parser), ou (c) guardar em metadado extra só do v2?
5. **Save do layout**: auto-save com indicador (recomendado) ou botão salvar
   explícito como no vídeo?
6. **Undo/redo**: Fase 8 (recomendado) ou Fase 9?
