# Design

## Context

Hoje `diagram_zones.members` é tratado como partição: `validation.ts` e o
adapter rejeitam a mesma tabela em duas zonas, e o cliente (`normalizeZoneState`
e `assignMember`) também torna a associação exclusiva. A árvore expõe um
`<select>` por tabela para mover entre zonas, o que repete 108 combos na tela e
não permite multi-seleção. O pedido do produto é o oposto: zonas são **visões**
do diagrama, e a mesma tabela pode aparecer em quantas o usuário quiser.

Não existe rota de rename de projeto; só `PUT /api/projects/:id`, que substitui
o modelo inteiro.

## Decisions

### 1. Associação tabela ↔ zona é muitos-para-muitos

- `DiagramZone.members` continua sendo uma lista de nomes por zona, sem restrição
  global de exclusividade. `normalizeZoneState` não deduplica mais entre zonas.
- `zoneOfTable` (primeiro dono) é substituída por `zonesOfTable` (lista) e
  `isZoneMember`. Os pontos que precisam de "uma zona" (localizar tabela) passam
  a preferir a aba ativa e, depois, a primeira zona da ordem das abas.
- `assignMember` (que removia de outras) é trocada por `addMemberToZone` e
  `removeMemberFromZone`. `removeMember` (todas as zonas) permanece só para
  exclusão de tabela do modelo (`forgetTable`).
- Excluir uma zona devolve à `Principal` somente tabelas que não pertencem a
  nenhuma outra zona; as demais permanecem nas visões em que aparecem.

### 2. Entrada de tabela no diagrama é drag-and-drop + ficha

- Linhas da árvore são arrastáveis (já eram) e aceitam drop nas **abas de zona**
  (`DIAGRAM_TABLE_MIME`) e no canvas da aba ativa; ambos **adicionam** sem
  remover de outras zonas.
- A ficha do item, quando a seleção é tabela e o modo é diagrama, mostra
  "Zonas do diagrama" com um checkbox por zona. É o caminho explícito e
  acessível (teclado) para quem não quer arrastar.
- O menu de contexto do card lista "Adicionar a <zona>" para zonas que ainda não
  contêm a tabela e "Remover desta aba" (confirmação). "Excluir tabela"
  continua separado e destrutivo.
- A árvore não mostra combo nem chip de ação; apenas um ponto/`title` discreto
  quando a tabela está fora de todas as zonas. O banner do canvas para a tabela
  selecionada fora de todas as zonas continua oferecendo "Adicionar à aba
  atual".

### 3. Rename de projeto é um PATCH dedicado

- `PATCH /api/projects/:id` recebe `{ name }` (`trim`, 1–200), exige `MEMBER` ou
  `ADMIN`, responde `404` para projeto inexistente e grava
  `events.action = 'project.renamed'` com `{ from, to }` na mesma transação.
- Resposta é o resumo do projeto (`id`, `name`, `description`, `createdAt`,
  `updatedAt`), suficiente para atualizar a galeria sem recarregar o modelo.
- O diálogo `RenameProjectDialog` é reutilizado pela galeria (ícone de lápis no
  card) e pelo workspace (nome clicável e item no menu "Ações do projeto").

### 4. Rótulo do viewer

- Na galeria, o link secundário vira "Abrir visualização" (aria-label coerente);
  no menu do workspace vira "Visualização". O selo "Somente leitura" dentro da
  página do viewer é mantido, pois lá descreve corretamente o modo da página.

### 5. Chaves entre modelos relativas à aba ativa

- `buildRelationshipKeys` continua recebendo uma função `zoneOf`, mas o canvas
  mapeia: membro da aba ativa → aba ativa; demais → primeira zona que o contém.
  Assim uma relationship só é "entre modelos" quando a outra ponta não está na
  visão corrente, mesmo que a tabela pertença a várias zonas.

## Risks / Trade-offs

- Documentos de layout antigos (exclusivos) continuam válidos: a mudança é
  permissiva, não migra dados.
- Um usuário pode "perder" a referência de onde uma tabela está; a ficha e o
  menu listam todas as zonas, e a árvore marca apenas o caso "nenhuma".
- Aumento do payload de `diagram_zones` é proporcional ao número de visões por
  tabela, não ao modelo.

## Migration Plan

Mudança apenas de código e specs; nenhuma migração de banco. Passos:

1. API: remover a checagem de exclusividade, adicionar `PATCH`/auditoria.
2. Web: renomear projeto (galeria/workspace), trocar rótulos, migrar semântica
   de zonas e remover o combo da árvore.
3. Atualizar testes, `README.md` e specs; rodar `bun run check` e o e2e.
4. Como o comportamento antigo era mais restritivo, não há rollback de dados:
   reverter o código volta a interpretar membros repetidos como inválidos.
