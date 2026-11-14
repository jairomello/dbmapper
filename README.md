# DBMapper

DBMapper is a web app that parses SQL schemas into an interactive model, letting you document tables, columns, and relationships for a semantic layer with JSON-based project save/load.

> **Status do projeto (14/11/2026):** a versão atual (v1, site estático) está
> preservada e congelada em [`legacy/`](./legacy/). A evolução **v2 — servidor,
> multi-usuário, autenticação e agente de IA com MCP** (stack Bun + React +
> SQLite) está em análise: veja [`docs/analysis/`](./docs/analysis/) para o
> diagnóstico da v1, o módulo reaproveitável do Azy Board e a proposta de
> evolução. A implementação da v2 será conduzida via OpenSpec.

## O que é

DBMapper é um app web para autoria de **camada semântica** sobre um banco de dados relacional. A partir de um arquivo SQL (`CREATE TABLE`, `ALTER TABLE … ADD CONSTRAINT`), o app monta um modelo navegável onde você pode descrever tabelas, campos e relacionamentos, marcar termos de negócio e controlar o status de revisão de cada item. O modelo é salvo em JSON e consumido pelo [DBViewer](./legacy/dbviewer.html), o visualizador somente leitura que acompanha o projeto.

A proposta é alimentar IAs e documentação com metadados de negócio (descrições semânticas, termos de negócio, status de revisão) sem acoplar o modelo a um banco ou a um schema físico específico.

## Funcionalidades

- **Importação de SQL** — parser próprio (`parseSQLToTables` em `legacy/app.js`) para `CREATE TABLE` e `ALTER TABLE … ADD CONSTRAINT` (FKs). Suporta tipos básicos, `PRIMARY KEY`, comentários e a normalização de relacionamentos pai/filho.
- **Sidebar em árvore** com tabelas, colunas e relacionamentos de chave estrangeira.
- **Editor de metadados** por tabela/coluna:
  - **Descrição semântica** — texto livre explicando o propósito do item para IAs e humanos.
  - **Termos de negócio** — chips com `Enter` para adicionar.
  - **Status de revisão** — botão "Aprovar Descrição"/"Reabrir Revisão", liberado apenas com descrição preenchida.
- **Wizard "Atualizar Modelo"** — compare uma nova versão do SQL com o projeto atual: tabelas/colunas adicionadas, removidas, renomeadas ou com tipo alterado, e FKs novas/alteradas. Você confirma o diff antes de aplicar.
- **Salvar/Abrir Projeto** — exporta o modelo completo para `.json` e reimporta em outra máquina ou versão.
- **Barra de status** com cobertura: total de tabelas, campos, FKs, % descrita, % revisada, pendentes e progresso geral.
- **DBViewer** (`legacy/dbviewer.html`) — companheiro somente leitura: hero, navegação lateral, busca por tabela/campo/tipo/descrição, accordion de relacionamentos, modo claro/escuro.

## Como o modelo é estruturado

O JSON exportado segue o formato abaixo. Ele é o **contrato** entre o DBMapper (editor) e o DBViewer (visualizador), e continua sendo o formato de export no v2.

```json
{
  "database": {
    "name": "ecommerce",
    "description": "Banco de produção do e-commerce",
    "business_terms": ["venda", "cliente"],
    "tables": [
      {
        "name": "cliente",
        "description": "Cadastro de clientes do e-commerce",
        "business_terms": ["cliente", "pessoa"],
        "status": "UNCHANGED",
        "relationships": {
          "parents": [],
          "children": [
            {
              "table": "pedido",
              "local_columns": ["id"],
              "referenced_columns": ["cliente_id"],
              "constraint_name": "fk_pedido_cliente"
            }
          ]
        },
        "columns": [
          {
            "name": "id",
            "type": "serial",
            "primary_key": true,
            "foreign_key": false,
            "description": "Identificador único do cliente",
            "business_terms": ["identificador"]
          }
        ]
      }
    ]
  }
}
```

> Os valores possíveis de `status` são `NEW`, `UNCHANGED`, `REMOVED`, `RENAMED` e
> `CHANGED` (gerados pelo wizard de atualização).

## Quick start (v1)

Não há build. Sirva a pasta como site estático e abra o editor:

```bash
git clone https://github.com/jairomello/dbmapper.git
cd dbmapper/legacy
python3 -m http.server 8000
# Abra http://localhost:8000/dbmapper.html
```

Você também pode abrir `legacy/dbmapper.html` direto no navegador (`file://`) — a v1 não depende de nada que exija servidor.

Para abrir o visualizador: `http://localhost:8000/dbviewer.html`

Fluxo mínimo de uso:

1. Abra `dbmapper.html`.
2. Clique em **Importar SQL** e selecione um arquivo `.sql` (ex.: `example.sql`).
3. Navegue pela árvore lateral, preencha descrições e termos de negócio.
4. Clique em **Salvar** para exportar o projeto em JSON.
5. Abra `dbviewer.html` e carregue o JSON gerado para visualizar a documentação.

## Estrutura do repositório

```text
dbmapper/
├── docs/
│   └── analysis/          # diagnóstico da v1, análise do Azy Board e proposta da v2
├── legacy/                # v1 estático congelado (app + visualizador + testes)
│   ├── dbmapper.html / app.js / style.css
│   ├── dbviewer.html / dbviewer.js / dbviewer.css
│   ├── example.sql
│   └── tests/             # contratos executáveis da v1
├── openspec/              # specs e change sets (fonte do fluxo OpenSpec)
├── AGENTS.md              # guia para agentes de IA e convenções
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE / THIRD_PARTY_NOTICES
└── (v2: apps/, packages/, package.json — a implementar via OpenSpec)
```

## Testes

Cada capacidade da v1 tem um contrato executável em `legacy/tests/`. Rode a partir de `legacy/`:

```bash
cd legacy
node tests/sql-import.test.js           # parser de CREATE TABLE / FKs
node tests/update-model.test.js         # wizard de atualização de modelo
node tests/coverage-stats.test.js       # métricas de cobertura
node tests/dbviewer.test.js             # contrato do DBViewer
node tests/project-persistence.test.js  # ciclo de save/open do JSON
```

## Verificação manual recomendada

Após qualquer mudança na v1, valide no navegador:

- A página carrega sem erros no console.
- Importar um SQL popula a sidebar com tabelas, colunas e FKs.
- Editar descrição, termos de negócio e marcar como revisado persiste após Salvar → Abrir.
- O wizard de Atualizar Modelo detecta corretamente adições, remoções, renomes e mudanças de tipo.

## Dependências de terceiros

A v1 é zero-build e zero-`npm`. As únicas dependências runtime são fontes e uma lib de UI carregadas via CDN. Veja [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES) para licenças e versões.

- **Materialize** 1.0.0 (MIT) — chips e toasts.
- **Google Fonts** — Inter e JetBrains Mono (SIL OFL 1.1).
- **Material Icons** (Apache 2.0).

O parser de SQL é próprio (`parseSQLToTables` em `legacy/app.js`); nenhuma biblioteca de SQL em runtime.

## Notas de projeto

- A UI é em **português (pt-BR)**. "DBMapper" e "Semantic Layer" são os únicos rótulos em inglês.
- O JSON do projeto é o **contrato** entre o editor e o visualizador. Mudanças nesse formato exigem sincronizar os dois lados.
- Mudanças com capacidade cross-cutting (tocam mais de uma capacidade ou dois arquivos) devem ser conduzidas via [OpenSpec](https://github.com/Fission-AI/OpenSpec) usando o change set em `openspec/`.
- A regra "sem frameworks/build" vale para `legacy/`; a v2 será guiada pelos specs em `openspec/` e pela proposta em `docs/analysis/03-proposta-evolucao-v2.md`.

## Relatando problemas de segurança

Veja [`SECURITY.md`](./SECURITY.md). **Não** abra issue pública para vulnerabilidades — use o canal privado indicado.

## Licença

Copyright 2026 DBMapper contributors

Licenciado sob a **Apache License, Version 2.0**. Veja o arquivo [`LICENSE`](./LICENSE) para o texto completo.

## Atribuições

Este projeto usa Materialize, Inter, JetBrains Mono e Material Icons. Detalhes em [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES).
