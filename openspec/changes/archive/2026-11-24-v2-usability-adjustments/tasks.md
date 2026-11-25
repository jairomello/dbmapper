# Tasks

## 1. Backend: rename de projeto

- [x] 1.1 `PATCH /api/projects/:id` com zod `{ name }`, `requireMember`, envelope de erro e `project.renamed` no mesmo commit do update — verificação: testes de rota cobrem sucesso, `400`, `404`, `403` e o evento.
- [x] 1.2 `ProjectRepository.updateName` em `ports.ts`/`adapter.ts` retornando o resumo atualizado — verificação: teste do adapter confirma nome e `updated_at` e que o modelo não muda.

## 2. Backend: zonas muitos-para-muitos

- [x] 2.1 Remover a checagem de exclusividade em `validation.ts` e `adapter.ts`, mantendo rejeição de tabela desconhecida e nome de zona duplicado — verificação: testes antigos de `duplicate_member` trocados por aceitação de membro repetido.
- [x] 2.2 Exclusão de zona devolve à `Principal` só membros sem outra zona — verificação: teste do adapter com tabela em duas zonas.

## 3. Web: rename e rótulos

- [x] 3.1 `projectsApi.rename` + `RenameProjectDialog` reutilizável com validação, erro e estado de envio — verificação: teste de componente.
- [x] 3.2 Galeria: lápis por card (somente `MEMBER`+), diálogo e atualização do cache; link "Abrir visualização" — verificação: testes da galeria (rename, cancelar, `VIEWER`, rótulo).
- [x] 3.3 Workspace: nome clicável e item "Renomear projeto" em Ações; link do menu "Visualização" — verificação: testes do workspace (rename e papel).

## 4. Web: zonas como visões múltiplas

- [x] 4.1 `zones.ts`: `addMemberToZone`, `removeMemberFromZone`, `zonesOfTable`, normalização sem dedupe entre zonas e devolução apenas de membros sem outra zona — verificação: testes unitários de zonas.
- [x] 4.2 `useDiagramZones`: adicionar sem remover, remover só da aba ativa e localizar preferindo a aba ativa — verificação: testes do hook via componente.
- [x] 4.3 `SemanticTree`: remover `<select>`/chip de ação, manter drag e marcador discreto "fora do diagrama" — verificação: teste atualizado.
- [x] 4.4 `ZoneTabs`: aceitar drop de tabela (`DIAGRAM_TABLE_MIME`) ativando a aba — verificação: teste de componente.
- [x] 4.5 `DiagramCanvas`: menu "Adicionar a <zona>" / "Remover desta aba", banner e chaves entre modelos relativas à aba ativa — verificação: testes do canvas.
- [x] 4.6 `MetadataEditor`: seção "Zonas do diagrama" com checkboxes na ficha do modo diagrama, gating para `VIEWER` — verificação: teste de componente.

## 5. Docs e specs

- [x] 5.1 Atualizar `README.md` (zonas multi-aba sem combo, rename) — verificação: leitura e conferência com a UI.
- [x] 5.2 `openspec validate v2-usability-adjustments --strict` — verificação: exit 0.

## 6. Validate

- [x] 6.1 `bun run check` — verificação: exit 0.
- [x] 6.2 `bun run test:e2e` (ajustar cenário de zonas se necessário) — verificação: exit 0.

## 7. Archive

- [x] 7.1 Arquivar o change com `openspec archive v2-usability-adjustments` e conferir specs promovidas — verificação: `openspec list` sem changes ativos.
