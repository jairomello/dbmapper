# Contributing to DBMapper

Obrigado por contribuir!

## Regras básicas

- Seja respeitoso e construtivo em todas as discussões.
- Todas as contribuições são aceitas sob a [Apache 2.0](./LICENSE) do projeto.
- Mantenha a filosofia do projeto em mente: **zero dependências de build, zero `npm`, JS puro no navegador**.

## Como reportar um bug

1. Pesquise as [Issues](../../issues) existentes para evitar duplicatas.
2. Abra uma nova issue usando o template **Bug report**.
3. Inclua: navegador/SO, passos para reproduzir, o que você esperava, o que aconteceu de fato.
4. Se o bug envolve parsing de SQL, anexe (ou descreva) o trecho de SQL que reproduz o problema — sem ele é difícil corrigir o parser.

## Como sugerir uma funcionalidade

1. Pesquise [Issues](../../issues) e [Discussions](../../discussions) primeiro.
2. Abra uma issue usando o template **Feature request**.
3. Explique o **problema** que está resolvendo, não apenas a solução.

Mudanças que tocam mais de uma capacidade ou dois arquivos raiz devem idealmente começar por um change set em [`openspec/`](./openspec/) — veja a seção "Mudanças com OpenSpec" abaixo.

## Setup de desenvolvimento

Não há build. Clone o repositório e abra `dbmapper.html` direto no navegador:

```bash
git clone https://github.com/jairomello/dbmapper.git
cd dbmapper
# Abra dbmapper.html no navegador
```

Para um workflow com live-reload, use qualquer servidor estático:

```bash
python3 -m http.server 8000
# ou: npx serve .
```

O app não depende de `file://` ser restritivo, mas o `FileReader` para `input type=file` se comporta de forma mais previsível quando servido via HTTP. Use o servidor estático para teste manual completo.

## Submetendo um pull request

1. Faça fork e crie uma branch a partir de `main`:
   ```bash
   git checkout -b feat/minha-feature
   ```
2. Faça suas alterações. Mantenha os commits focados e atômicos.
3. Rode os testes relevantes (veja a seção "Testes" abaixo) e verifique manualmente no navegador.
4. Abra um PR contra `main` e preencha o template.
5. Um mantenedor vai revisar e pode pedir mudanças.

## Estilo de código

- **Sem dependências de runtime novas.** Não introduza pacotes `npm` ou CDNs adicionais sem aprovação explícita.
- **Sem build/toolchain.** A saída precisa continuar sendo a tríade HTML + CSS + JS que abre direto do disco.
- **Indentação de 4 espaços** em HTML, CSS e JS.
- **JS:** `camelCase` para funções e variáveis, `'use strict'` no topo, prefira `const`/`let`, APIs DOM diretas.
- **CSS:** seletores em kebab-case, custom properties em `:root`, reúse as variáveis existentes (`--accent`, `--ink`, `--bg`, etc.) antes de introduzir novas.
- **UI em português (pt-BR).** Exceções: rótulos de produto como "DBMapper" e "Semantic Layer".
- **Renderização de texto controlado pelo usuário:** use `textContent` ou o helper `escapeHtml` definido em `app.js`. Não interpole dados do usuário em `innerHTML` sem escape.
- **Sem comentários** a menos que a intenção não seja óbvia pelo código.

## Testes

Cada capacidade tem um contrato executável em `tests/`. Rode o script relevante antes de considerar a mudança pronta:

```bash
node tests/sql-import.test.js           # parseSQLToTables, parseAlterTableForeignKeys, normalizeRelationships
node tests/update-model.test.js         # wizard de atualização de modelo
node tests/coverage-stats.test.js       # métricas de cobertura
node tests/dbviewr.test.js              # contrato do DBViewr
node tests/project-persistence.test.js  # export/import de JSON
```

Para mudanças no parser de SQL, teste pelo menos um arquivo com constraints (FKs) e um com múltiplas tabelas. O arquivo `example.sql` na raiz é um insumo útil.

Para cada mudança, valide manualmente no navegador:

- A página carrega sem erros no console.
- Importar um SQL popula a sidebar com tabelas, colunas e FKs.
- Editar descrição, termos de negócio e marcar como revisado persiste após Salvar → Abrir.

## Mudanças com OpenSpec

Mudanças com capacidade cross-cutting — que tocam múltiplas capacidades, dois ou mais arquivos raiz, ou que precisam de design antes da implementação — devem ser conduzidas via [OpenSpec](https://github.com/Fission-AI/OpenSpec):

1. Crie um change set em `openspec/changes/<slug-descritivo>/` com `proposal.md`, `tasks.md` e (se cross-cutting) `design.md`.
2. Atualize os specs correspondentes em `openspec/specs/<capability>/` no formato `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` com `#### Scenario:` (exatamente 4 hashtags).
3. As tarefas vão no `tasks.md` em ordem de execução, em chunks de até ~2h, e terminam com `## N. Validate` e `## N+1. Archive`.
4. Quando a implementação estiver concluída e revisada, o change set é arquivado em `openspec/changes/archive/<data>-<slug>/` (o comando `openspec archive` faz isso).

Mudanças triviais (typo, hotfix em um único arquivo) não precisam de OpenSpec.

## Ícones e assets

A app usa **Material Icons** via Google Fonts. Se um ícone novo for necessário, prefira um nome da [lista oficial de Material Icons](https://fonts.google.com/icons) — não incorpore SVGs.

## Reportando vulnerabilidades

Veja [`SECURITY.md`](./SECURITY.md). **Não** abra issue pública — use o canal privado indicado.
