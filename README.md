# DBMapper

DBMapper is a static web app that parses SQL schemas into an interactive model, letting you document tables, columns, and relationships for a semantic layer with JSON-based project save/load.

## O que é

DBMapper é um app web estático para autoria de **camada semântica** sobre um banco de dados relacional. A partir de um arquivo SQL (`CREATE TABLE`, `ALTER TABLE … ADD CONSTRAINT`), o app monta um modelo navegável onde você pode descrever tabelas, campos e relacionamentos, marcar termos de negócio e controlar o status de revisão de cada item. O modelo é salvo em JSON e consumido pelo [DBViewr](./dbviewr.html), o visualizador somente leitura que acompanha o projeto.

A proposta é alimentar IAs e documentação com metadados de negócio (descrições semânticas, termos de negócio, status de revisão) sem acoplar o modelo a um banco ou a um schema físico específico.

## Funcionalidades

- **Importação de SQL** — parser próprio (`parseSQLToTables` em `app.js`) para `CREATE TABLE` e `ALTER TABLE … ADD CONSTRAINT` (FKs). Suporta tipos básicos, `PRIMARY KEY`, comentários e a normalização de relacionamentos pai/filho.
- **Sidebar em árvore** com tabelas, colunas e relacionamentos de chave estrangeira.
- **Editor de metadados** por tabela/coluna:
  - **Descrição semântica** — texto livre explicando o propósito do item para IAs e humanos.
  - **Termos de negócio** — chips com `Enter` para adicionar.
  - **Status de revisão** — marca/desmarca "revisado" e libera o botão de aprovação quando há descrição.
- **Wizard "Atualizar Modelo"** — compare uma nova versão do SQL com o projeto atual: tabelas/colunas adicionadas, removidas, renomeadas ou com tipo alterado, e FKs novas/alteradas. Você confirma o diff antes de aplicar.
- **Salvar/Abrir Projeto** — exporta o modelo completo para `.json` e reimporta em outra máquina ou versão.
- **Barra de status** com cobertura: total de tabelas, campos, FKs, % descrita, % revisada, pendentes e progresso geral.
- **DBViewr** (`dbviewr.html`) — companheiro somente leitura: hero, navegação lateral, busca por tabela/campo/tipo/descrição, accordion de relacionamentos, modo claro/escuro.

## Como o modelo é estruturado

O JSON exportado segue o formato abaixo. Ele é o **contrato** entre o DBMapper (editor) e o DBViewr (visualizador).

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
        "status": "ACTIVE",
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

## Quick start

Não há build. Sirva a pasta como site estático e abra o editor:

```bash
git clone https://github.com/jairomello/dbmapper.git
cd dbmapper
python3 -m http.server 8000
# Abra http://localhost:8000/dbmapper.html
```

Você também pode abrir `dbmapper.html` direto no navegador (`file://`) — o app não depende de nada que exija servidor.

Para abrir o visualizador:

```bash
# http://localhost:8000/dbviewr.html
```

Fluxo mínimo de uso:

1. Abra `dbmapper.html`.
2. Clique em **Importar SQL** e selecione um arquivo `.sql` (ex.: `example.sql`).
3. Navegue pela árvore lateral, preencha descrições e termos de negócio.
4. Clique em **Salvar** para exportar o projeto em JSON.
5. Abra `dbviewr.html` e carregue o JSON gerado para visualizar a documentação.

## Estrutura do repositório

- `dbmapper.html` — UI shell do editor. Carrega dependências via CDN e o `app.js`.
- `dbviewr.html` — visualizador somente leitura (autocontido, sem dependências externas além de fontes e ícones).
- `app.js` — estado da aplicação, parser de SQL, renderização, import/export, editor e wizard de atualização.
- `style.css` — design system e layout do editor.
- `example.sql`— entradas SQL para teste local do parser.
- `tests/` — contratos executáveis por capacidade (`sql-import`, `update-model`, `coverage-stats`, `dbviewr`, `project-persistence`).
- `AGENTS.md` — guia para agentes de IA e convenções de contribuição.
- `openspec/` — specs e change sets do projeto (mudanças com capacidade cross-cutting são conduzidas por aqui).

## Dependências de terceiros

O app é zero-build e zero-`npm`. As únicas dependências runtime são fontes e uma lib de UI carregadas via CDN. Veja [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES) para licenças e versões.

- **Materialize** 1.0.0 (MIT) — chips e toasts.
- **Google Fonts** — Inter e JetBrains Mono (SIL OFL 1.1).
- **Material Icons** (Apache 2.0).

O parser de SQL é próprio (`parseSQLToTables` em `app.js`); nenhuma biblioteca de SQL em runtime.

## Testes

Cada capacidade tem um contrato executável em `tests/`. Rode o script relevante antes de abrir PR:

```bash
node tests/sql-import.test.js           # parser de CREATE TABLE / FKs
node tests/update-model.test.js         # wizard de atualização de modelo
node tests/coverage-stats.test.js       # métricas de cobertura
node tests/dbviewr.test.js              # contrato do DBViewr
node tests/project-persistence.test.js  # ciclo de save/open do JSON
```

## Verificação manual recomendada

Após qualquer mudança, valide no navegador:

- A página carrega sem erros no console.
- Importar um SQL popula a sidebar com tabelas, colunas e FKs.
- Editar descrição, termos de negócio e marcar como revisado persiste após Salvar → Abrir.
- O wizard de Atualizar Modelo detecta corretamente adições, remoções, renomes e mudanças de tipo.

## Notas de projeto

- A UI é em **português (pt-BR)**. "DBMapper" e "Semantic Layer" são os únicos rótulos em inglês.
- O JSON do projeto é o **contrato** entre o editor e o visualizador. Mudanças nesse formato exigem sincronizar os dois lados.
- Mudanças com capacidade cross-cutting (tocam mais de uma capacidade ou dois arquivos raiz) devem ser conduzidas via [OpenSpec](https://github.com/Fission-AI/OpenSpec) usando o change set em `openspec/`.

## Relatando problemas de segurança

Veja [`SECURITY.md`](./SECURITY.md). **Não** abra issue pública para vulnerabilidades — use o canal privado indicado.

## Licença

Copyright 2026 DBMapper contributors

Licenciado sob a **Apache License, Version 2.0**. Veja o arquivo [`LICENSE`](./LICENSE) para o texto completo.

## Atribuições

Este projeto usa Materialize, Inter, JetBrains Mono e Material Icons. Detalhes em [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES).
