# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefas Concluídas (sessão 2026-06-17)

| Fase | Descrição | Commit | Status |
|------|-----------|--------|--------|
| A | Fix condicionais PRODUTO (Via Orçamento + Manual) | 1fb6cd6 | ✅ |
| B | Step 3 sem abas — OS + Orçamento simultâneos | d33545b | ✅ |
| C | Garantia: 3 botões toggle + modal Termo automático | d33545b | ✅ |
| D | TermoGarantia: data_inicio/data_fim nullable | d33545b | ✅ |
| E | Email: não anexar PDF de Termo com data pendente | d33545b | ✅ |
| F | Serviço: badge ⏳ + input data + PATCH quando Termo pendente | d33545b | ✅ |
| — | Config meses histórico OS (Step 3, default 2) | 1644b06 | ✅ |
| — | Fix: emitente não some ao trocar tipo de nota (Step 1) | 68aed7d | ✅ |
| — | Deploy VPS + ALTER TABLE (termos_garantia + configuracao_empresa) | — | ✅ |

---

## Corpo de Nota de Referência (exemplo gerado 2026-06-17)

> Caso de teste real — usado para validar o fluxo PRODUTO com orçamento e sem OS.

| Campo | Valor |
|-------|-------|
| Número | PRD-2026/0003 |
| Tipo | PRODUTO |
| Condomínio | CONDOMINIO EDIFICIO VERMONT |
| Mês de Referência | 06/2026 |
| OS | — (sem OS vinculada — preenchimento manual) |
| Data do Serviço | — (em branco) |
| Vencimento | 24/06/2026 |
| Nota Fiscal | 0126 (XML aguardando) |
| Preenchimento | Manual |
| CNPJ / Conta Inter | 22.761.557/0001-88 — CMPORT SISTEMAS DE ELETRONICOS DE SEGURANCA LTDA |
| Orçamento | #15 |

**Observações para P2:** este corpo foi gerado sem OS e sem data do serviço — ilustra exatamente os cenários P2-B (data vazia) e P2-C (número OS vazio). O valor deve ter vindo do orçamento #15 (P2-A).

---

## Prioridade 1 — CI/CD: GitHub Actions + Docker Hub → VPS Pull

### Objetivo
Migrar o deploy do CMPort de build local na VPS (lento, ~10-15 min) para:
`git push origin master` → Actions constrói imagens → push Docker Hub → VPS apenas faz `docker pull` (~2-3 min).
O `git push vps master` é mantido como fallback para acesso de emergência e sync de configs.

### Contexto
- Remote atual: apenas `vps` → `ssh://root@168.231.96.184/root/cmport.git` (bare repo)
- Repositório **não está no GitHub** — `?? .github/` aparece no git status (nunca commitado)
- `docker-compose.prod.yml` já usa `image: ${DOCKERHUB_USERNAME}/...` (preparado para o novo fluxo)
- `.github/workflows/deploy.yml` já existe localmente (criado, mas nunca commitado)

---

### Fase A — Pré-requisitos Manuais (Atila faz no browser)

1. **Docker Hub** — criar conta em hub.docker.com se não tiver; gerar Access Token (Account Settings → Security → New Access Token com permissão Read/Write)
2. **GitHub** — criar repositório público `cmport-system` em `github.com/AtilaMoura`
3. **Configurar 4 secrets** no GitHub repo (Settings → Secrets and variables → Actions):

| Secret | Valor |
|---|---|
| `DOCKERHUB_USERNAME` | seu username no Docker Hub |
| `DOCKERHUB_TOKEN` | token gerado no passo 1 |
| `VPS_HOST` | `168.231.96.184` |
| `VPS_SSH_KEY` | conteúdo de `~/.ssh/id_ed25519` (chave privada local) |

---

### Fase B — Ajustar `docker-compose.prod.yml`

**Arquivo:** `docker-compose.prod.yml`

Substituir `image: ${DOCKERHUB_USERNAME}/cmport-api:latest` e `image: ${DOCKERHUB_USERNAME}/cmport-front:latest` por username hardcoded (ex: `atilamoura/cmport-api:latest`).

**Por quê hardcodar:** Quando o Actions executa `docker compose pull` via SSH, o shell não herda variáveis de ambiente — a variável `${DOCKERHUB_USERNAME}` fica vazia e o pull falha. Hardcodar elimina a dependência.

---

### Fase C — Ajustar `.github/workflows/deploy.yml`

O `git pull` que existe no workflow não funciona: o remote da VPS aponta para `/root/cmport.git`, não GitHub. Substituir por SCP + SSH simplificado:

```yaml
- name: Sincronizar arquivos de infra
  uses: appleboy/scp-action@v0.1.7
  with:
    host: ${{ secrets.VPS_HOST }}
    username: root
    key: ${{ secrets.VPS_SSH_KEY }}
    source: "docker-compose.prod.yml,nginx/"
    target: /root/cmport-system/

- name: Deploy na VPS
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.VPS_HOST }}
    username: root
    key: ${{ secrets.VPS_SSH_KEY }}
    script: |
      cd /root/cmport-system
      docker compose -f docker-compose.prod.yml pull
      docker compose -f docker-compose.prod.yml up -d
      docker image prune -f
      echo "==> Deploy concluído: $(date)"
      docker compose -f docker-compose.prod.yml ps
```

O SCP garante que mudanças em `nginx/nginx.conf` e `docker-compose.prod.yml` sejam aplicadas mesmo sem `git pull`.

---

### Fase D — Adicionar remote GitHub e push inicial

```bash
# Local — executar na raiz do projeto
git remote add origin https://github.com/AtilaMoura/cmport-system.git
git push origin master
```

Verificar `.gitignore` antes do push — já cobre `.env.production` e certificados Inter. Adicionar `.env` (sem extensão) se não estiver coberto.

---

### Fase E — Configurar remote `origin` na VPS

Via SSH (acesso mantido):

```bash
ssh root@168.231.96.184
cd /root/cmport-system
git remote add origin https://github.com/AtilaMoura/cmport-system.git
```

Isso não é obrigatório para o fluxo principal (o SCP substitui o `git pull`), mas permite fazer `git pull origin master` manualmente na VPS quando necessário.

---

### Fase F — Simplificar hook post-receive na VPS

**Arquivo na VPS:** `/root/cmport.git/hooks/post-receive`

O hook atual faz `--build` (build local). Com o novo fluxo, o build acontece no Actions; o hook deve apenas fazer checkout dos arquivos e pull das imagens já prontas:

```bash
#!/bin/bash
set -e
GIT_WORK_TREE=/root/cmport-system git checkout -f
cd /root/cmport-system
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
echo "==> Deploy via git push concluído: $(date)"
```

**Resultado:** `git push vps master` continua funcionando — atualiza configs de nginx/compose e sobe as imagens mais recentes do Hub, sem rebuildar.

---

### Fase G — Atualizar CLAUDE.md

Substituir a seção de deploy para refletir os dois fluxos:

```
git push origin master   # deploy primário — Actions builda + VPS faz pull (~3 min)
git push vps master      # fallback/emergência — sync configs + docker pull (~1 min)
```

---

### Checklist CI/CD

- [ ] **A**: Docker Hub — conta + token gerados
- [ ] **A**: Repositório GitHub público criado em `github.com/AtilaMoura/cmport-system`
- [ ] **A**: 4 secrets configurados no GitHub (DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, VPS_HOST, VPS_SSH_KEY)
- [ ] **B**: `docker-compose.prod.yml` com username hardcoded nas imagens backend e frontend
- [ ] **C**: `deploy.yml` atualizado — SCP + SSH sem `git pull`
- [ ] **D**: `git remote add origin` + `git push origin master` — repo aparece no GitHub com Actions
- [ ] **E**: Remote `origin` configurado em `/root/cmport-system/.git/config` na VPS
- [ ] **F**: Hook `/root/cmport.git/hooks/post-receive` simplificado (sem `--build`)
- [ ] **G**: CLAUDE.md atualizado com os dois fluxos
- [ ] **Verificação**: commit → `git push origin master` → Actions roda sem erro → imagens no Docker Hub → VPS sobe → site no ar
- [ ] **Verificação**: `git push vps master` ainda funciona como fallback

### Mapa de Arquivos

| Arquivo | Tipo | O que muda |
|---------|------|-----------|
| `docker-compose.prod.yml` | local | Hardcodar DOCKERHUB_USERNAME nas imagens backend e frontend |
| `.github/workflows/deploy.yml` | local | Trocar `git pull` por SCP + SSH simplificado |
| `.gitignore` | local | Adicionar `.env` (sem extensão) se não coberto |
| `CLAUDE.md` | local | Atualizar seção Deploy com os dois fluxos |
| `/root/cmport.git/hooks/post-receive` | VPS | Remover `--build`, adicionar `docker compose pull` |
| `/root/cmport-system/.git/config` | VPS | Adicionar remote `origin` GitHub |

---

## Prioridade 2 — Correções no Wizard: Valor, Datas e Número da OS

### P2-A: Valor pré-preenchido por tipo de nota

**Problema:** O campo "Valor Bruto" no Step 4 sempre exibe o valor do contrato registrado, mas para SERVIÇO e PRODUTO o valor correto deve vir do orçamento ou da OS — não do contrato.

**Regras:**

| Tipo | Origem do valor pré-preenchido |
|------|-------------------------------|
| MANUTENÇÃO | Valor do contrato (comportamento atual — manter) |
| SERVIÇO | Valor do orçamento selecionado → se sem orçamento, valor da OS → se nenhum, campo vazio (usuário preenche) |
| PRODUTO | Idem SERVIÇO |

**Comportamento:**
- Campo "Valor Bruto" sempre editável pelo usuário independente da origem
- Quando orçamento é selecionado no Step 3 → preenche valor automaticamente (já acontece parcialmente, verificar)
- Quando OS é selecionada sem orçamento → tentar puxar valor da OS se disponível
- Se nenhuma origem → campo começa vazio para SERVIÇO/PRODUTO

**Arquivos prováveis:**
- `cmport-front/app/corpos-nota/novo/page.tsx` — lógica de preenchimento de `valorBruto`
- Verificar função `selecionarOrcamento` e `selecionarCondominio` (onde valor é atribuído)

---

### P2-B: Campo "Datas dos Serviços Executados" — editável e manual

**Problema:** O campo de data do serviço (`dataServico` / `dataServicoTexto`) não permite edição manual fácil quando nenhuma OS está vinculada, ou quando a data da OS não corresponde ao período real.

**Comportamento esperado:**
- Campo sempre editável pelo usuário (input de data ou texto livre)
- Quando OS é selecionada → preenche automaticamente com a data da OS (comportamento atual)
- Quando sem OS → campo em branco, usuário digita manualmente
- Nunca bloquear edição mesmo quando auto-preenchido

**Arquivos prováveis:**
- `cmport-front/app/corpos-nota/novo/page.tsx` — Step 4, campo `dataServico`/`dataServicoTexto`

---

### P2-C: Campo "Número(s) da OS" — sempre editável e manual

**Problema:** O campo "Número(s) da OS" é preenchido automaticamente quando OS é selecionada, mas o usuário pode não conseguir editar ou inserir manualmente quando não há OS no sistema.

**Comportamento esperado:**
- Campo sempre visível e editável (já implementado no Step 3, verificar se está funcionando)
- Quando OS selecionada → preenche automaticamente
- Usuário pode sobrescrever o valor a qualquer momento
- Quando sem OS → campo em branco para digitação livre

**Arquivos prováveis:**
- `cmport-front/app/corpos-nota/novo/page.tsx` — state `numeroOs`, Step 3

---

### Checklist P2

- [ ] **P2-A**: SERVIÇO/PRODUTO puxam valor do orçamento → se sem orçamento, da OS → se nenhum, vazio
- [ ] **P2-A**: MANUTENÇÃO mantém valor do contrato (sem regressão)
- [ ] **P2-A**: Campo sempre editável pelo usuário
- [ ] **P2-B**: Data do serviço sempre editável, auto-preenchida da OS quando disponível
- [ ] **P2-B**: Sem OS → campo vazio para digitação manual
- [ ] **P2-C**: Número(s) da OS sempre editável, auto-preenchido quando OS selecionada
- [ ] **P2-C**: Sem OS → campo em branco para digitação livre
- [ ] `npx tsc --noEmit` zerado
- [ ] Teste: corpo MANUTENÇÃO — valor do contrato preservado
- [ ] Teste: corpo SERVIÇO com orçamento — valor do orçamento
- [ ] Teste: corpo PRODUTO sem orçamento nem OS — campos editáveis e em branco

---

## Mapa de Arquivos (P2)

| Arquivo | Tarefa | O que muda |
|---------|--------|-----------|
| `cmport-front/app/corpos-nota/novo/page.tsx` | P2-A, B, C | Lógica de preenchimento de valor, data e número OS |
