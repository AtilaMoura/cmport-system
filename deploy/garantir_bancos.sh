#!/bin/bash
# garantir_bancos.sh — cria schemas extras do MySQL e libera o usuário da aplicação.
#
# Roda no deploy ANTES de subir o backend: o main.py faz create_all no import e,
# sem o schema/grant, o backend não sobe (outage do financeiro em 2026-09-22 por
# causa do cmport_cameras). Idempotente — pode rodar em todo deploy.
#
# Usa as credenciais que já estão DENTRO do container cmport_db (MYSQL_ROOT_PASSWORD,
# MYSQL_USER) — nenhuma senha passa por aqui nem aparece no log do Actions.
#
# Uso (na VPS, em /root/cmport-system): bash deploy/garantir_bancos.sh

set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"

# Schemas além do principal (DB_NAME, que o próprio container do MySQL já cria).
# Novo módulo com schema separado? Adicionar aqui.
SCHEMAS_EXTRAS="cmport_cameras"

echo "==> Garantindo banco no ar..."
$COMPOSE up -d --wait db

for schema in $SCHEMAS_EXTRAS; do
  echo "==> Garantindo schema $schema + GRANT pro usuário da aplicação"
  docker exec -e SCHEMA="$schema" cmport_db sh -c '
    MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "
      CREATE DATABASE IF NOT EXISTS \`$SCHEMA\`;
      GRANT ALL PRIVILEGES ON \`$SCHEMA\`.* TO \`$MYSQL_USER\`@\`%\`;
    "
  '
done

echo "==> Schemas OK"
