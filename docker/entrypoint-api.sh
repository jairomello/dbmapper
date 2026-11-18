#!/bin/sh
# Entrypoint da imagem da API do DBMapper.
#
# 1. aplica as migrações SQLite (idempotente);
# 2. roda o seed do admin inicial somente quando DBMAPPER_ADMIN_PASSWORD está
#    definido (sem a senha o seed geraria uma senha aleatória e a imprimiria uma
#    única vez no log — indesejado em produção);
# 3. sobe o servidor HTTP no processo principal (exec, para receber sinais).
set -eu

echo "Aplicando migrações em ${DATABASE_URL:-/data/dbmapper.db}..."
bun run --cwd /app db:migrate

if [ -n "${DBMAPPER_ADMIN_PASSWORD:-}" ]; then
  echo "Criando/atualizando o admin inicial (${DBMAPPER_ADMIN_EMAIL:-admin@dbmapper.local})..."
  bun run --cwd /app db:seed
else
  echo "DBMAPPER_ADMIN_PASSWORD vazio: seed do admin ignorado."
fi

exec bun run --cwd /app/apps/api start
