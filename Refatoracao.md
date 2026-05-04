# Plano de Correção — PDF de Nota Fiscal não salva em produção

> **Arquiteto**: Claude Opus (plan mode)
> **Status**: Aguardando implementação
> **Nota afetada**: 7730 (e todas as notas — o bug é sistêmico)

---

## Diagnóstico

### Causa Raiz — `STORAGE_ENDPOINT` errado em produção

O backend em produção usa `STORAGE_ENDPOINT=http://localhost:9000` (valor padrão do código). Dentro do container Docker, `localhost` é o próprio container FastAPI — não o MinIO. O MinIO está em `http://minio:9000` (nome do serviço Docker). Resultado: **toda tentativa de upload de PDF falha com Connection Refused**.

**Evidência 1** — `config.py` (linha 36): default hardcoded para `http://localhost:9000`:
```python
STORAGE_ENDPOINT: str = "http://localhost:9000"   # ← errado em Docker
```

**Evidência 2** — `.env.production.example` não contém nenhuma variável `STORAGE_*`, portanto o `.env.production` real provavelmente também não tem. O backend não recebe `STORAGE_ENDPOINT` → usa o default errado.

**Evidência 3** — `docker-compose.prod.yml` minio usa expansão shell (`${STORAGE_ACCESS_KEY}`) que retorna vazio em tempo de deploy, porém as credenciais do MinIO persistem no volume `minio_data` como `minioadmin`/`minioadmin` (padrão MinIO quando recebe credenciais em branco). Este ponto está funcionando por acidente — mas o endereço de conexão não.

### Fluxo com o bug
```
Frontend → POST /notas-fiscais/{id}/pdf
  → Backend tenta storage.upload("http://localhost:9000", ...)
  → Connection Refused (MinIO está em http://minio:9000)
  → HTTPException 500
  → Frontend mostra "Erro ao enviar PDF"
```

### Problemas secundários identificados
1. `docker-compose.prod.yml` — minio usa `${STORAGE_ACCESS_KEY}` via shell (não via env_file), credenciais por acidente corretas mas frágil
2. `.env.production.example` — não documenta as variáveis STORAGE_*

---

## Correção — 3 arquivos + 1 ação no servidor

### Arquivo 1: `.env.production` no servidor (ação manual)

O dev deve acessar o servidor via SSH e **adicionar** as seguintes linhas ao arquivo `/root/cmport-system/.env.production`:

```bash
# Storage (MinIO)
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
STORAGE_BUCKET=cmport-nfe
STORAGE_REGION=us-east-1
```

> **Atenção**: Se o `.env.production` real já tiver `STORAGE_ACCESS_KEY` e `STORAGE_SECRET_KEY` com valores customizados, use esses mesmos valores para `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD`.

---

### Arquivo 2: `docker-compose.prod.yml` — corrigir bloco minio

**Problema atual** (linhas 74–76): usa expansão shell `${...}` que retorna vazio no servidor:
```yaml
environment:
  MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY}    # ← retorna "" no deploy
  MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY} # ← retorna "" no deploy
```

**Correção**: remover o bloco `environment:` do serviço minio — as variáveis `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD` agora vêm direto do `env_file: .env.production`:

```yaml
# ── Storage (MinIO) ──────────────────────────────────────────────────────────
minio:
  image: minio/minio:latest
  container_name: cmport_minio
  restart: unless-stopped
  command: server /data --console-address ":9001"
  env_file: .env.production
  volumes:
    - minio_data:/data
  networks:
    - cmport_net
```

> **Remover completamente** o bloco `environment:` das linhas 74–76.

---

### Arquivo 3: `.env.production.example` — documentar variáveis STORAGE

Adicionar ao final do arquivo:

```bash
# ── Storage (MinIO) ───────────────────────────────────────────────────────────
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=TROQUE_AQUI_OU_USE_minioadmin
STORAGE_SECRET_KEY=TROQUE_AQUI_OU_USE_minioadmin
MINIO_ROOT_USER=TROQUE_AQUI_OU_USE_minioadmin
MINIO_ROOT_PASSWORD=TROQUE_AQUI_OU_USE_minioadmin
STORAGE_BUCKET=cmport-nfe
STORAGE_REGION=us-east-1
```

---

## Sequência de execução pelo dev

1. SSH no servidor: `ssh root@168.231.96.184`
2. Editar `/root/cmport-system/.env.production` e adicionar as 7 linhas STORAGE acima
3. Verificar que `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD` no `.env.production` batem com o que o MinIO já tem no volume (se em dúvida, usar `minioadmin`)
4. Sair do servidor
5. Editar `docker-compose.prod.yml` localmente (remover bloco `environment:` do minio)
6. Editar `.env.production.example` localmente (adicionar seção STORAGE)
7. Commitar os 2 arquivos locais e dar `git push vps master`
8. O deploy automático vai rebuildar e reiniciar os containers com as novas configurações
9. Após o deploy, **avisar o arquiteto** para verificar

---

## Agentes disponíveis para implementação

| Tarefa | Agente |
|--------|--------|
| Editar `docker-compose.prod.yml` e `.env.production.example` | `/backend` |
| Verificar logs de storage após o deploy | `/backend` |
| Nenhuma alteração de frontend necessária | — |

---

## O que o arquiteto vai validar após o deploy

- [ ] Upload de PDF na nota 7730 funciona sem erro 500
- [ ] Botão "Visualizar PDF" abre o PDF corretamente (streaming)
- [ ] Log do backend não mostra `Connection Refused` para o storage
- [ ] Novo `.env.production.example` tem a seção STORAGE documentada

---

> **IMPORTANTE**: O dev não deve alterar este plano. Deve seguir na íntegra a sequência acima. Após concluir, avisar o arquiteto para validação.
