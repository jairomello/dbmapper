# Deploy do DBMapper v2 — notebook → labapps → Vultr (`jairo.tools`)

Este documento descreve o fluxo de deploy em três ambientes: desenvolvimento no
notebook, homologação no host **labapps** (docker compose) e produção na Vultr em
**`jairo.tools`**. Os artefatos ficam em [`docker/`](../docker/):

- `docker/Dockerfile.api` — API Bun (`oven/bun:alpine`), instalação com
  `--frozen-lockfile` e start de `apps/api`.
- `docker/Dockerfile.web` — build do `apps/web` (Vite) e runtime nginx servindo
  `dist`, com proxy de `/api` e `/health` para o serviço `api`.
- `docker/docker-compose.yml` — serviços `api` + `web`, volume nomeado
  `dbmapper-data` montado em `/data` e `DATABASE_URL=/data/dbmapper.db`.
- `docker/entrypoint-api.sh` — aplica `db:migrate`, roda `db:seed` somente se
  `DBMAPPER_ADMIN_PASSWORD` estiver definido e então sobe o servidor.
- `docker/nginx-web.conf.template` — template nginx (envsubst de
  `DBMAPPER_API_UPSTREAM`).
- `docker/.dockerignore` e `.dockerignore` (raiz) — excluem `node_modules`,
  `.git`, `*.db` e `.env` do contexto de build.

> **Limitação de verificação:** a VM de desenvolvimento do projeto não tem
> Docker. A validação local cobre YAML do compose, existência dos caminhos,
> ausência de segredos literais e `bun run check`. O `docker build` e o
> `docker compose up` são executados no ambiente de deploy (labapps), onde o
> Docker está disponível.

Segredos vêm **somente** do ambiente/`.env` interpolado pelo compose. Nunca
commite `.env`; nunca coloque valores literais no `docker-compose.yml`.

## 1. Notebook (desenvolvimento, sem Docker)

Pré-requisitos: Bun na versão de [`.bun-version`](../.bun-version).

```bash
bun install
cp .env.example .env    # ajuste JWT_SECRET e DBMAPPER_ADMIN_PASSWORD
bun run db:migrate
bun run db:seed
bun run dev             # API em :3000 e web em :5173 (proxy de /api e /health)
```

Abra `http://localhost:5173`. O `bun run check` (typecheck + lint + fronteiras de
persistência + testes) é o gate local; o smoke E2E fica fora dele
(`bun run test:e2e`). Detalhes em [`AGENTS.md`](../AGENTS.md).

## 2. Labapps (homologação com docker compose)

Pré-requisitos: Docker Engine + Compose v2, portas livres e acesso ao
repositório.

```bash
git clone https://github.com/jairomello/dbmapper.git
cd dbmapper

cp .env.example docker/.env
# edite docker/.env: JWT_SECRET forte e DBMAPPER_ADMIN_PASSWORD
openssl rand -hex 32     # use a saída como JWT_SECRET; nunca reutilize um exemplo
```

Build e subida (a partir da raiz do repositório; o `.env` é passado
explicitamente para o compose):

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env build
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d
docker compose -f docker/docker-compose.yml --env-file docker/.env ps
docker compose -f docker/docker-compose.yml --env-file docker/.env logs -f api
```

- A API fica em `http://<host>:3000` e a web em `http://<host>:8080` por padrão.
  As portas do host são configuráveis por `DBMAPPER_API_PORT` e
  `DBMAPPER_WEB_PORT` no `.env`.
- O entrypoint da API aplica as migrações, cria o admin inicial (idempotente)
  quando `DBMAPPER_ADMIN_PASSWORD` está definido e só então inicia o servidor.
- O SQLite persiste no volume nomeado `dbmapper_dbmapper-data` (projeto
  `dbmapper` + volume `dbmapper-data`), montado em `/data`.
- `web` só sobe depois que o healthcheck `GET /health` da API responde.

Para atualizar uma implantação existente:

```bash
git pull
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

## 3. Vultr (`jairo.tools`, produção)

1. Crie o registro DNS de `jairo.tools` apontando para a VPS.
2. Instale Docker Engine + Compose v2 e clone o repositório.
3. Crie `docker/.env` com os segredos de produção (ver checklist abaixo).
4. Suba com o compose:

   ```bash
   docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
   ```

5. Termine o TLS em um proxy reverso (Caddy/Traefik/nginx) na frente da web.
   O compose publica HTTP puro; o certificado é responsabilidade do proxy.
   Encaminhe `jairo.tools` para a porta web (`8080` por padrão) e mantenha a API
   fora da internet pública:

   ```dotenv
   # docker/.env (produção)
   DBMAPPER_WEB_PORT=127.0.0.1:8080
   DBMAPPER_API_PORT=127.0.0.1:3000
   ```

   Assim apenas o proxy local alcança os containers; o proxy responde por
   `https://jairo.tools` e repassa cookies/sessão para a web (que faz proxy de
   `/api` e `/health`).

## Checklist de produção

- [ ] `JWT_SECRET` forte e exclusivo (`openssl rand -hex 32`), guardado apenas no
      `.env` da máquina alvo; nunca versionado.
- [ ] `NODE_ENV=production` (o compose já define; a API recusa subir sem
      `JWT_SECRET` nesse modo).
- [ ] `DBMAPPER_ADMIN_PASSWORD` forte no primeiro boot; o seed é idempotente e
      pode ser deixado vazio depois que o admin existe.
- [ ] Volume SQLite `dbmapper-data` com backup testado (ver abaixo) e restore
      ensaiado.
- [ ] TLS ativo no proxy reverso; portas `3000`/`8080` não expostas publicamente.
- [ ] Chaves de LLM (`OPENAI_API_KEY` / `OPENROUTER_API_KEY`) somente no `.env`;
      nunca em imagens, banco ou repositório.
- [ ] `.env` com permissão restrita (`chmod 600 docker/.env`).
- [ ] Deploy de **instância única**: o worker do agente é in-process; não escale
      horizontalmente a API sem runner/queue externo.
- [ ] Imagens tagueadas por release (`DBMAPPER_IMAGE_TAG`) para permitir rollback
      determinístico.

### Backup e restore do SQLite

O banco é um único arquivo em `/data/dbmapper.db`. Para um backup consistente,
pare a API durante a cópia:

```bash
mkdir -p backups
docker compose -f docker/docker-compose.yml --env-file docker/.env stop api
docker compose -f docker/docker-compose.yml --env-file docker/.env \
  cp api:/data/dbmapper.db "backups/dbmapper-$(date +%F).db"
docker compose -f docker/docker-compose.yml --env-file docker/.env start api
```

Restore (sobrescreve o banco atual; garanta o backup antes):

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env stop api
docker compose -f docker/docker-compose.yml --env-file docker/.env \
  cp "backups/dbmapper-2026-11-18.db" api:/data/dbmapper.db
# o `cp` do Docker pode gravar como root; devolva a posse ao usuário da API
docker compose -f docker/docker-compose.yml --env-file docker/.env \
  run --rm --no-deps --user root --entrypoint chown api bun:bun /data/dbmapper.db
docker compose -f docker/docker-compose.yml --env-file docker/.env start api
```

Guarde também o `docker/.env` em local seguro: sem o `JWT_SECRET`, as sessões
existentes deixam de ser válidas após um restore em outra máquina.

### Rollback

As migrações são **aditivas** e o entrypoint as aplica de forma idempotente, então
voltar a imagem anterior não exige reverter schema nem restaurar dados:

```bash
# 1. publique/imagine a release com uma tag imutável
docker compose -f docker/docker-compose.yml --env-file docker/.env build
docker tag dbmapper-api:${DBMAPPER_IMAGE_TAG:-local} dbmapper-api:2026.11.18
docker tag dbmapper-web:${DBMAPPER_IMAGE_TAG:-local} dbmapper-web:2026.11.18

# 2. para voltar, aponte o .env para a tag anterior e suba SEM rebuild
#    DBMAPPER_IMAGE_TAG=2026.11.17
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d
```

O banco e os eventos de auditoria permanecem; apenas o código volta. Se o
rollback for para um commit bem anterior, revise o `CHANGELOG`/OpenSpec do
intervalo: as migrações continuam válidas, mas recursos novos deixam de existir.
