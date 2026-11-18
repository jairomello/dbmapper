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

## API v2 (Fases 1 e 2)

A Fase 1 entrega o domínio do dicionário e a importação de SQL no servidor. A
Fase 2 adiciona identidade: login com cookie de sessão, papéis e rotas
protegidas. A API roda em Bun + Hono + SQLite e usa o envelope de erro
`{ "error": { "code", "message", "retryable", "details" } }` em todas as falhas.

```bash
bun install            # dependências do workspace
cp .env.example .env   # ajuste JWT_SECRET e as credenciais do admin inicial
bun run db:migrate     # aplica as migrações SQLite (DATABASE_URL, padrão ./dev.db)
bun run db:seed        # cria o ADMIN inicial (idempotente)
bun run dev:api        # sobe a API em http://localhost:3000
bun run check          # typecheck + lint + fronteiras de persistência + testes
```

### Autenticação e papéis

Toda rota `/api` exige um cookie de sessão `session`, exceto
`POST /api/auth/login` e `GET /health`. O cookie é `HttpOnly`, `SameSite=Lax`,
JWT HS256 com TTL de 24h e renovação deslizante na metade do prazo. O segredo
vem de `JWT_SECRET`; em desenvolvimento há um fallback que emite aviso, mas ele
é **recusado com `NODE_ENV=production`**.

| Papel | Lê projetos | Salva/importa | Administra usuários |
| --- | --- | --- | --- |
| `VIEWER` | sim | não (`403`) | não (`403`) |
| `MEMBER` | sim | sim | não (`403`) |
| `ADMIN` | sim | sim | sim |

Requisições sem sessão válida recebem `401`; papel insuficiente recebe `403`;
login repetidamente inválido recebe `429` com `Retry-After` (5 falhas em 15
minutos por identidade). O login sempre devolve a mesma mensagem para senha
errada e email inexistente.

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/auth/login` | autentica (`email`, `password`) e define o cookie `session` |
| `GET` | `/api/auth/me` | devolve `{ id, email, role }` da sessão |
| `POST` | `/api/auth/logout` | limpa o cookie de sessão |
| `POST` | `/api/users` | cria usuário (`ADMIN`; senha com no mínimo 8 caracteres) |
| `GET` | `/api/users` | lista usuários sem `password_hash` (`ADMIN`) |
| `PATCH` | `/api/users/{id}` | altera `role` (`ADMIN`; recusa rebaixar o último `ADMIN`) |

O `db:seed` cria o admin a partir de `DBMAPPER_ADMIN_EMAIL` e
`DBMAPPER_ADMIN_PASSWORD`; sem a senha, gera uma aleatória e a imprime uma única
vez. Rodar de novo com o mesmo email é idempotente.

```bash
# login: guarda o cookie em cookies.txt
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"senha-inicial"}'

# usa a sessão nas rotas protegidas
curl -s -b cookies.txt http://localhost:3000/api/auth/me
curl -s -b cookies.txt http://localhost:3000/api/projects
```

### Endpoints do dicionário

Salvar o modelo, importar JSON e preview/apply de SQL exigem `MEMBER` ou
`ADMIN`; as leituras aceitam qualquer sessão válida.

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/projects` | cria um projeto vazio (`{"name": "..."}`) |
| `GET` | `/api/projects` | lista projetos (`id`, `name`, `description`, timestamps) |
| `GET` | `/api/projects/{id}` | devolve o projeto com o modelo completo |
| `PUT` | `/api/projects/{id}` | substitui o modelo (`{"database": {...}}`) |
| `GET` | `/api/projects/{id}/export` | exporta no contrato JSON v1 (`{"database": {...}}`) |
| `POST` | `/api/projects/import` | importa um JSON v1, preenchendo campos ausentes |
| `POST` | `/api/projects/{id}/imports/preview` | parseia o SQL e devolve o plano sem gravar nada |
| `POST` | `/api/projects/{id}/imports/apply` | aplica o plano confirmado e registra um `import_run` |
| `GET` | `/api/projects/{id}/imports` | lista o histórico de importações aplicadas |

Exemplo do fluxo de importação de SQL:

```bash
# 1. preview: parse + diff, sem mutação
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/imports/preview" \
  -H 'content-type: application/json' \
  -d '{"sql":"CREATE TABLE cliente (id int PRIMARY KEY);","renames":{"tables":[],"columns":[]}}'

# 2. apply: reenvia o mesmo SQL, os renames explícitos e o plano devolvido no preview
curl -s -X POST "http://localhost:3000/api/projects/$PROJECT_ID/imports/apply" \
  -H 'content-type: application/json' \
  -d '{"sql":"CREATE TABLE cliente (id int PRIMARY KEY);","renames":{"tables":[],"columns":[]},"plan":{ ... }}'
```

Regras do fluxo:

- O preview é **somente leitura**: não altera o modelo e não cria `import_runs`.
- Renomes só acontecem com mapeamento explícito do cliente (`renames.tables` e
  `renames.columns`); o servidor nunca infere renomes.
- O apply revalida o plano contra o modelo atual. Se o plano estiver
  desatualizado, retorna `409` com `error.code = "STALE_PLAN"` e não grava nada.
- Itens preservados mantêm `description`, `business_terms` e `reviewed`; itens
  novos nascem vazios com `status: "NEW"`; mudanças de tipo recebem
  `status: "CHANGED"`; remoções saem do modelo; relacionamentos passam a refletir
  o SQL novo.

## UI web (Fase 3)

A Fase 3 entrega a interface React: login por sessão, workspace com seleção/criação
de projeto, árvore semântica, editor de metadados com revisão, barra de cobertura,
wizard de atualização e export/import do JSON v1.

Primeiro login (o `db:seed` é idempotente):

```bash
bun install
bun run db:migrate
bun run db:seed
bun run dev
```

Abra `http://localhost:5173`. O `bun run dev` sobe a API em `http://localhost:3000`
(respeita `PORT`) e o web em `http://localhost:5173`, com proxy de `/api` para a API.
O admin inicial vem de `DBMAPPER_ADMIN_EMAIL` (padrão `admin@dbmapper.local`) e
`DBMAPPER_ADMIN_PASSWORD`; sem a senha, o seed gera uma e a imprime uma única vez.

Depois do login a rota `/` mostra a **galeria de projetos**: um card por projeto com
nome, descrição e data de atualização. Clicar no card abre o workspace em
`/project/{id}` (recarregar a página mantém o projeto); sem projetos, a galeria exibe
um estado vazio com o CTA **Novo projeto**.

O **Novo projeto** (na galeria e no workspace) importa um arquivo `.sql`, aceita SQL
colado no editor ou abre um arquivo `.json` exportado pelo DBMapper. Os dois imports
de arquivo são botões/áreas de arrastar explícitos (`Importar arquivo .sql` e
`Importar arquivo .json`), não inputs nativos discretos: o arquivo é lido no cliente
com `file.text()` e enviado como texto, então dumps grandes não são truncados. O Hono
não impõe limite próprio de corpo; o servidor fixa `maxRequestBodySize` em **128 MiB**
(`apps/api/src/index.ts`).

Dentro do workspace você pode documentar tabelas/colunas, aprovar descrições, rodar o
wizard "Atualizar modelo" (prévia calculada pelo servidor, renomes explícitos e
confirmação antes do apply), além de exportar/importar o JSON v1. O import de JSON é
compatível com arquivos do **DBMapper 1.0**: campos desconhecidos são descartados,
campos ausentes recebem os mesmos defaults do `legacy/app.js` e apenas um payload sem
`database` é rejeitado (atomicamente, com o envelope de erro).

Testes da UI e smoke E2E (o Playwright não entra no `bun run check`):

```bash
bun run --cwd apps/web test
bun run --cwd apps/web typecheck
bun add -d playwright
bunx playwright install chromium
bun run test:e2e
```

O smoke sobe API + web em portas isoladas, cria o admin, faz login, abre a galeria,
cria um projeto importando `legacy/example.sql`, descreve/aprova uma coluna e valida o
JSON exportado.

## Agente de sugestões (Fase 4)

A Fase 4 adiciona o agente embutido: geração em lote de sugestões de descrição
pelo LLM, enfileiradas para decisão humana no workspace, com auditoria. O agente
**nunca** aprova uma descrição: aplicar grava `description`, define
`description_source='agent'` e `reviewed=false` (aplicar sobre um item aprovado
reabre a revisão).

### Configuração do provider

O provider é configurado somente por variáveis de ambiente (nunca no banco nem
nas respostas). Copie os valores desejados de `.env.example`:

| Variável | Descrição |
| --- | --- |
| `DBMAPPER_LLM_PROVIDER` | `openai`, `openrouter` ou `fake` (opcional; sem ele vale a primeira chave presente) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | chave e modelo da OpenAI (padrão `gpt-4o-mini`) |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | chave e modelo do OpenRouter (padrão `openai/gpt-4o-mini`) |

Sem provider/chave, uma solicitação de geração falha com o envelope de erro e
`error.code = "LLM_NOT_CONFIGURED"` (sem criar job). O provider `fake` é
**somente para testes/e2e**: gera sugestões determinísticas em pt-BR sem acesso
à rede.

### Fluxo de geração e decisão

1. No workspace, abra **Sugestões IA** e clique em **Sugerir descrições**.
2. Escolha o escopo **Projeto inteiro** ou **Esta tabela** (apenas itens sem
   descrição são alvo).
3. A API cria um `agent_jobs` com status `queued`; um worker in-process com lease
   processa o job em lotes por tabela e grava sugestões `pending`.
4. O painel faz polling do job enquanto `queued`/`running` e mostra a prévia lado
   a lado: caminho e contexto do item × texto sugerido.
5. `MEMBER`/`ADMIN` podem editar antes de aplicar, aplicar/rejeitar uma sugestão
   ou uma seleção em lote. Decisões usam CAS: uma sugestão já decidida retorna
   `409`. `VIEWER` só visualiza a fila (as ações ficam ocultas e a API responde
   `403`).
6. Cada geração, edição, aplicação e rejeição grava um evento em `events`
   (append-only) com o ator e o payload.

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| `POST` | `/api/projects/{id}/agent/suggestions` | `MEMBER`+ | solicita geração (`{ "scope": "project" }` ou `{ "scope": "table", "tableId": "..." }`) e devolve `202` com o job |
| `GET` | `/api/projects/{id}/agent/jobs/{jobId}` | qualquer sessão | status, tentativas, erro e estatísticas do job |
| `GET` | `/api/projects/{id}/agent/suggestions?status=pending` | qualquer sessão | fila pendente com o contexto enviado ao modelo |
| `PATCH` | `/api/projects/{id}/agent/suggestions/{suggestionId}` | `MEMBER`+ | edita o texto de uma sugestão pendente |
| `POST` | `/api/projects/{id}/agent/suggestions/{suggestionId}/apply` | `MEMBER`+ | aplica uma sugestão (`409` se não estiver pendente) |
| `POST` | `/api/projects/{id}/agent/suggestions/{suggestionId}/reject` | `MEMBER`+ | rejeita uma sugestão |
| `POST` | `/api/projects/{id}/agent/suggestions/apply` | `MEMBER`+ | aplica em lote (`{ "ids": [...] }`; devolve `applied` e `skipped`) |
| `POST` | `/api/projects/{id}/agent/suggestions/reject` | `MEMBER`+ | rejeita em lote (`{ "ids": [...] }`; devolve `rejected` e `skipped`) |

O worker roda no próprio processo da API: o deploy é de instância única. Em
múltiplas instâncias seria necessário um runner/queue externo (fora do escopo da
Fase 4). O smoke E2E exercita o fluxo completo com `DBMAPPER_LLM_PROVIDER=fake`
(gerar → aguardar job → aplicar → aprovar → cobertura), sem chamadas de rede ao
LLM.

## MCP (Fase 5)

A Fase 5 conecta o dicionário ao opencode por um servidor MCP stdio
(`apps/mcp`). As nove tools leem o modelo e gravam descrições pela API usando
uma **API key**; a identidade vem sempre do servidor (dono da chave), nunca dos
argumentos. A referência completa de nomes, argumentos e respostas está em
[`docs/TOOLS-DBMAPPER.md`](./docs/TOOLS-DBMAPPER.md), e o fluxo de trabalho em
[`skills/dbmapper/SKILL.md`](./skills/dbmapper/SKILL.md).

### 1. Criar a chave

Com a API rodando e uma sessão de `MEMBER`/`ADMIN` em `cookies.txt`, crie a
chave (o texto puro aparece **uma única vez**):

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/keys \
  -H 'content-type: application/json' \
  -d '{"name":"opencode","projectScope":"'"$PROJECT_ID"'"}'
```

A resposta traz `key` (a chave `dbmp_...`) e `apiKey` (prefixo, status e
`last_used_at`). Para listar sem revelar o segredo use `GET /api/keys`; para
revogar, `DELETE /api/keys/{id}`. O escopo de projeto é opcional: sem ele a chave
vale para qualquer projeto acessível ao dono.

### 2. Configurar o ambiente do cliente

Exporte as variáveis no ambiente do opencode (nunca em arquivo versionado):

| Variável | Descrição |
| --- | --- |
| `DBMAPPER_API_KEY` | chave criada acima (somente `{env:...}` na config) |
| `DBMAPPER_URL` | URL da API (ex.: `http://localhost:3000`) |
| `DBMAPPER_PROJECT_ID` | opcional; projeto padrão quando a tool omite `projectId` |

Sem `DBMAPPER_API_KEY`/`DBMAPPER_URL` o servidor sobe, mas toda chamada de tool
retorna `MCP_CONFIG_ERROR`.

### 3. Conectar o opencode

Copie o exemplo (o arquivo real é gitignored) e abra o opencode na raiz do
repositório:

```bash
cp opencode.json.example opencode.json
opencode
```

O `opencode.json.example` registra o servidor local (`bun run
apps/mcp/src/index.ts`) com os placeholders `{env:...}` e uma entrada remota
desabilitada. A skill `dbmapper` conduz o fluxo discover project →
`list_missing_descriptions` → analisar a codebase local → `set_description` →
reportar. Toda descrição gravada via MCP fica como **não revisada**
(`description_source='mcp'`, `reviewed=false`); a aprovação é exclusivamente
humana.

O guard de catálogo (`bun run test:mcp-catalog`, dentro de `bun run check`)
garante que toda tool registrada está documentada e roteada.

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
├── apps/
│   ├── api/               # Hono + Drizzle + bun:sqlite (REST, auth, agente, /mcp)
│   ├── web/               # React + Vite (UI do editor)
│   └── mcp/               # adaptador stdio do MCP
├── packages/
│   ├── domain/            # tipos do dicionário (tabela/coluna/relacionamento/status)
│   └── contracts/         # contratos de API (erro, JWT, health)
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
├── biome.json             # lint + formatação (Biome)
├── tsconfig.base.json     # TypeScript strict compartilhado
├── package.json           # workspace Bun (apps/* e packages/*)
└── .bun-version
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
