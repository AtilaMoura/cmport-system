#!/bin/bash
# deploy.sh — Atualiza o CMPort no servidor
# Uso: bash deploy.sh

set -e

echo "==> Puxando atualizações do repositório..."
git pull origin main

echo "==> Subindo containers com rebuild..."
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Limpando imagens antigas..."
docker image prune -f

echo "==> Deploy concluído!"
docker compose -f docker-compose.prod.yml ps
