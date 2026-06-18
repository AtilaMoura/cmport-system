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

## Prioridade 1 — CI/CD: GitHub Actions + Docker Hub → VPS Pull ✅ CONCLUÍDO

### Checklist CI/CD

- [x] **A**: Docker Hub — conta `cmport` + token gerados
- [x] **A**: Repositório GitHub público criado em `github.com/AtilaMoura/cmport-system`
- [x] **A**: 4 secrets configurados no GitHub (DOCKERHUB_USERNAME, DOCKERHUB_TOKEN, VPS_HOST, VPS_SSH_KEY)
- [x] **B**: `docker-compose.prod.yml` com username hardcoded (`cmport/cmport-api:latest`, `cmport/cmport-front:latest`)
- [x] **C**: `deploy.yml` — SCP + SSH, `command_timeout: 30m`, pull só de api+front (não mysql/nginx/minio)
- [x] **D**: `git remote add origin` + primeiro `git push origin master` (commit `ea7ab8e`)
- [x] **F**: Hook `post-receive` simplificado + `nohup` (deploy em background, conexão SSH não derruba o processo)
- [x] **G**: CLAUDE.md atualizado com os dois fluxos
- [x] **Verificação**: run `27779777075` em progresso — build backend+frontend OK, deploy na VPS em andamento
- [x] **Verificação**: containers VPS rodando com `cmport/cmport-api:latest` e `cmport/cmport-front:latest`

### Estado Atual do deploy.yml (commit ea7ab8e)

```yaml
- name: Build e push — Backend   # sempre builda (otimização pendente — ver P1-H)
- name: Build e push — Frontend  # sempre builda (otimização pendente — ver P1-H)
- name: Sincronizar arquivos de infra para VPS  # SCP: docker-compose.prod.yml + nginx/
- name: Deploy na VPS            # SSH: docker pull api+front → up -d → prune
  command_timeout: 30m
```

### P1-H — Otimização: buildar só o que mudou (EM IMPLEMENTAÇÃO)

**Problema:** toda push rebuilda backend E frontend, mesmo que só um lado mudou.

**Solução:** detectar mudanças por pasta com `git diff` e condicionar cada step com `if:`:

```yaml
- name: Detectar mudanças
  id: changes
  run: |
    echo "backend=$(git diff --name-only HEAD~1 HEAD | grep -q '^backend/' && echo true || echo false)" >> $GITHUB_OUTPUT
    echo "frontend=$(git diff --name-only HEAD~1 HEAD | grep -q '^cmport-front/' && echo true || echo false)" >> $GITHUB_OUTPUT

- name: Build e push — Backend
  if: steps.changes.outputs.backend == 'true'
  ...

- name: Build e push — Frontend
  if: steps.changes.outputs.frontend == 'true'
  ...
```

Na VPS, o script SSH só faz `docker pull` da imagem que foi rebuilda.

- [ ] Implementar detecção de mudanças no `deploy.yml`
- [ ] Testar: mudar só frontend → Actions pula build do backend
- [ ] Testar: mudar só backend → Actions pula build do frontend

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
