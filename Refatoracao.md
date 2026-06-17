# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefa Atual

**Corpo da Nota — Step 3 redesign + Garantia com Termo automático**

**Data:** 2026-06-17 | **Prioridade:** Alta | **Status:** 🚧 A implementar

---

## Princípios Arquiteturais (não negociáveis)

1. **Sem redundância** — corpo referencia serviço via FK (`servico_id`). Nenhum campo do serviço é copiado.
2. **Sem duplicidade** — `TermoGarantia` pertence ao `ManutencaoAssistencia`. O corpo guarda só `termo_garantia_id`.
3. **Serviço mantém autonomia total** — `/servicos/[id]` continua podendo criar/editar/desvincular/recriar Termo independentemente.
4. **Não quebrar o que funciona** — textos gerados de corpos SERVIÇO e SERVIÇO+produto são saída crítica, não mudam.

---

## O Que Já Foi Implementado (esta sessão — não refazer)

| Item | Commit | Status |
|------|--------|--------|
| Tabs OS/Orçamento visíveis para PRODUTO (linha 891) | f69e945 | ✅ |
| Auto-vínculo XML PRODUTO standalone (repository + service) | f69e945 | ✅ |
| Endpoint `GET /corpos-nota/{id}/pre-gerar-termo` | f69e945 | ✅ |
| Seção "Termo de Garantia" no detalhe do corpo (`[id]/page.tsx`) | f69e945 | ✅ |

---

## Bugs Ainda Existentes (descobertos nos testes)

| # | Bug | Causa raiz | Arquivo | Linha |
|---|-----|-----------|---------|-------|
| B1 | Orçamento: aba visível mas conteúdo vazio para PRODUTO | `tipoNota === 'SERVICO'` no conteúdo da aba | `novo/page.tsx` | 992 |
| B2 | Manual: aba visível mas campo vazio para PRODUTO | `tipoNota === 'SERVICO'` no conteúdo da aba | `novo/page.tsx` | 1035 |
| B3 | Garantia ainda é campo texto livre (deveria ser opções fixas) | Nunca implementado | `novo/page.tsx` | ~1165 |
| B4 | Termo não pode ter data pendente (NOT NULL no model) | `data_inicio DATE NOT NULL` | `termo_garantia_model.py` | 14 |
| B5 | Email anexa Termo mesmo quando data de execução está vazia | Sem verificação `data_inicio is None` | `boleto_service.py` | ~1449, ~1617 |
| B6 | Serviço não avisa "Termo pendente" quando falta data | Lógica não implementada | `servicos/[id]/page.tsx` | — |

---

## Fase A — Fix Urgente: Conteúdo das Abas para PRODUTO (2 linhas)

**Arquivo:** `cmport-front/app/corpos-nota/novo/page.tsx`

```tsx
// LINHA 992 — ANTES
{tipoNota === 'SERVICO' && abaOS === 'ORCAMENTO' && (
// DEPOIS
{tipoNota !== 'MANUTENCAO' && abaOS === 'ORCAMENTO' && (

// LINHA 1035 — ANTES
{tipoNota === 'SERVICO' && abaOS === 'MANUAL' && (
// DEPOIS
{tipoNota !== 'MANUTENCAO' && abaOS === 'MANUAL' && (
```

**Checklist Fase A:**
- [ ] Wizard PRODUTO → aba "Via Orçamento" mostra lista de orçamentos
- [ ] Wizard PRODUTO → aba "Manual" mostra campo texto livre
- [ ] Wizard SERVIÇO → comportamento idêntico ao anterior (sem regressão)
- [ ] `npx tsc --noEmit` zerado

---

## Fase B — Step 3: OS + Orçamento Simultâneos (sem abas)

### Problema

O modelo atual de abas mutuamente exclusivas (OS | Orçamento | Manual) impede selecionar OS **e** Orçamento ao mesmo tempo. O cliente pode querer vincular a OS do Auvo E o orçamento correspondente ao mesmo corpo.

### Novo comportamento

Remover as 3 abas. Step 3 passa a exibir **dois blocos verticais sempre visíveis**:

```
┌─ Step 3 — Origem ────────────────────────────────────────┐
│                                                           │
│  Ordens de Serviço encontradas (multi-seleção)           │
│  ┌──────────────────────────────────────────────────┐    │
│  │ ☐  OS #73787278 · 14.05.2026 · Instalação bomba │    │
│  │ ☐  OS #73912345 · 20.05.2026 · Troca motor      │    │
│  └──────────────────────────────────────────────────┘    │
│  [nenhuma OS encontrada → campo texto livre aparece]      │
│                                                           │
│  ──── Orçamento (opcional) ──────────────── [SERV/PROD]  │
│  ┌──────────────────────────────────────────────────┐    │
│  │ ○  Orç. #1234 · R$ 2.800,00 · Motor MKN + Manta │    │
│  │ ○  Orç. #1198 · R$ 1.500,00 · Bomba d'água      │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  Número(s) da OS — texto livre (editável sempre)         │
│  [ OS nº 73787278 e OS nº 73912345           ]           │
│                                                           │
└───────────────────────────────────────────── [Próximo →] ┘
```

### Regras de seleção

| Ação do usuário | Resultado |
|----------------|-----------|
| Seleciona 1+ OSs | `numero_os`, `data_servico`, `servico_id` preenchidos automaticamente |
| Seleciona orçamento | `orcamento_id`, `valor_bruto`, `produtos_json` preenchidos automaticamente |
| Seleciona OS + Orçamento | Ambos preenchidos; `servico_id` vem da OS |
| Não seleciona nada | Campos ficam em branco → cliente preenche manualmente no Step 4 |
| Campo "Número(s) da OS" | Sempre visível e editável, pré-preenchido quando OS é selecionada |

### Mudanças no código

**Arquivo:** `cmport-front/app/corpos-nota/novo/page.tsx`

1. Remover state `abaOS` e a função `onAbaChange`
2. Remover os 3 botões de tab (div com `flex gap-1 p-1 bg-slate-100 rounded-xl`)
3. Manter o bloco OS sempre visível (multi-seleção existente — não muda lógica)
4. Mover bloco Orçamento para abaixo das OSs, visível quando `tipoNota !== 'MANUTENCAO'`
5. Campo texto "Número(s) da OS — texto livre" fica sempre visível ao final
6. Bloco Manual deixa de existir como aba separada — é o estado natural de não selecionar nada

**Estado do bloco Orçamento:**
- Só aparece para SERVIÇO e PRODUTO
- Carrega orçamentos ao montar o Step 3 (não precisa mais de trigger de aba)
- Seleção única (radio), desmarcar clicando novamente

**Checklist Fase B:**
- [ ] Step 3 exibe OS + Orçamento verticais, sem tabs
- [ ] Selecionar 2 OSs → `numero_os = "OS nº X e OS nº Y"`, `servico_id` da primeira
- [ ] Selecionar OS + Orçamento → ambos preenchidos, `servico_id` vem da OS
- [ ] Não selecionar nada → Step 4 com campos em branco (preenchimento manual)
- [ ] Campo texto "Número da OS" sempre visível, editável
- [ ] MANUTENÇÃO → bloco Orçamento não aparece (mantém comportamento atual)
- [ ] `npx tsc --noEmit` zerado

---

## Fase C — Garantia: Botões Fixos + Modal Termo Automático no Wizard

### Problema

Campo texto livre de garantia não padroniza o prazo e não abre o Termo automaticamente quando OS está vinculada.

### Novo comportamento

**Step 4 — seção Garantia:**

```
Garantia:
  [ 3 meses ]  [ 6 meses ]  [ 1 ano ]    ← toggle, um de cada vez
                                           Nenhum selecionado = sem garantia
```

Ao selecionar um prazo:
- `tem_garantia = true`
- `descricao_garantia = "3 meses"` | `"6 meses"` | `"1 ano"`
- Se `servicoId` preenchido (OS selecionada) → **modal Termo abre automaticamente**
- Se `servicoId` vazio → botão manual "Pré-gerar Termo" aparece abaixo dos botões

### Modal "Pré-gerar Termo de Garantia"

Abre automaticamente quando prazo é selecionado e `servicoId` está preenchido.

```
┌─ Termo de Garantia ──────────────────────────────────────┐
│                                                           │
│  Produtos / Serviços Garantidos:                         │
│  [ 3x Motor MKN · 2x Manta asfáltica          ]  ← editável
│  (pré-preenchido com produtos_json do Step 4)            │
│                                                           │
│  Prazo: 6 meses  (travado no selecionado)                │
│                                                           │
│  Data de início da garantia:                             │
│  [ 14/05/2026 ]  ← pré-preenchido da OS se disponível   │
│   ou  [ vazio — "Pendente (preencher após execução)" ]   │
│                                                           │
│          [Pular por agora]  [Salvar Termo]               │
└──────────────────────────────────────────────────────────┘
```

**Ao clicar "Salvar Termo":**
```
POST /termos-garantia/
  → { servico_id, produto_descricao, prazo_meses,
      data_inicio: date | null,
      data_fim: (data_inicio + prazo) | null,
      orcamento_id }
```
- Salva `termoWizardId` no state
- Na confirmação final (Step 6) → payload inclui `termo_garantia_id: termoWizardId`

**Ao clicar "Pular por agora":**
- Termo não é criado agora
- `tem_garantia = true`, `descricao_garantia` preenchido
- Usuário pode gerar Termo depois na página de detalhe do corpo (botão já existe)

### Mudanças no código

**Arquivo:** `cmport-front/app/corpos-nota/novo/page.tsx`

1. Substituir `<input type="text" value={descricaoGarantia}>` por 3 botões toggle
2. Novo state `prazoGarantia: 3 | 6 | 12 | null`
3. Novo state `showModalTermoWizard: boolean`
4. Novo state `termoWizardId: number | null`
5. `descricaoGarantia` calculado a partir do prazo: `{ 3: '3 meses', 6: '6 meses', 12: '1 ano' }`
6. Ao selecionar prazo + ter `servicoId` → `setShowModalTermoWizard(true)`
7. Modal chama `POST /termos-garantia/` → salva `termoWizardId`
8. Payload final (`confirmar`) inclui `termo_garantia_id: termoWizardId`

**Arquivo:** `cmport-front/app/corpos-nota/novo/page.tsx` — `payloadBase()`:
```typescript
termo_garantia_id: termoWizardId || null,  // ← adicionar
```

**Arquivo:** `backend/app/schemas/corpo_nota_schema.py` — `CorpoNotaCreate`:
```python
termo_garantia_id: Optional[int] = None  # ← adicionar se não existe
```

**Checklist Fase C:**
- [ ] Step 4: 3 botões de prazo substituem campo texto
- [ ] Selecionar prazo com OS vinculada → modal abre automaticamente
- [ ] Modal pré-preenche produtos do state e data da OS
- [ ] "Salvar Termo" → cria Termo, fecha modal, `termoWizardId` salvo
- [ ] "Pular por agora" → fecha modal, garantia registrada, Termo criado depois
- [ ] Sem OS vinculada: selecionar prazo → mostra botão manual "Pré-gerar Termo"
- [ ] Criar corpo → payload inclui `termo_garantia_id` se gerado
- [ ] Detalhe do corpo criado → seção Termo mostra estado correto (gerado ou pendente)
- [ ] `npx tsc --noEmit` zerado

---

## Fase D — Model: `data_inicio` e `data_fim` Nullable

### Problema

`TermoGarantia.data_inicio` e `data_fim` são `NOT NULL` no banco. Não é possível criar Termo com data pendente.

### Mudanças

**Arquivo:** `backend/app/models/termo_garantia_model.py`
```python
# ANTES
data_inicio = Column(Date, nullable=False)
data_fim = Column(Date, nullable=False)

# DEPOIS
data_inicio = Column(Date, nullable=True)
data_fim = Column(Date, nullable=True)
```

**Arquivo:** `backend/app/schemas/termo_garantia_schema.py`
```python
# Nos schemas de criação e response:
data_inicio: Optional[date] = None
data_fim: Optional[date] = None
```

**SQL no banco (VPS — rodar manualmente via SSH):**
```sql
ALTER TABLE termos_garantia
  MODIFY data_inicio DATE NULL,
  MODIFY data_fim DATE NULL;
```

**Arquivo:** `backend/app/services/termo_garantia_service.py` — `gerar_pdf()`:
```python
# Adicionar verificação antes de gerar
if not termo.data_inicio:
    raise ValueError("Termo com data de execução pendente — preencha a data para gerar o PDF")
```

**Checklist Fase D:**
- [ ] `POST /termos-garantia/` aceita `data_inicio: null`
- [ ] Termo criado sem data salva no banco sem erro
- [ ] `GET /termos-garantia/{id}/pdf` com `data_inicio=null` retorna 400 com mensagem clara
- [ ] Termos existentes no banco (com data preenchida) não são afetados

---

## Fase E — Email: Não Anexar Termo Pendente

### Problema

Email do boleto tenta gerar PDF do Termo independente de `data_inicio` ser null. Se null, falha silenciosamente mas pode gerar log de erro.

### Mudança

**Arquivo:** `backend/app/services/boleto_service.py` — dois locais (linhas ~1449 e ~1617):

```python
# ANTES
termo = TermoGarantiaRepository.get_by_servico_id(db, servico.id)
if termo:
    pdf_termo = TermoGarantiaService.gerar_pdf(db, termo.id)
    anexos.append(...)

# DEPOIS
termo = TermoGarantiaRepository.get_by_servico_id(db, servico.id)
if termo and termo.data_inicio is not None:  # ← só anexa se data completa
    try:
        pdf_termo = TermoGarantiaService.gerar_pdf(db, termo.id)
        anexos.append(...)
    except Exception as e:
        logger.warning(f"Termo {termo.id} não incluído no email: {e}")
```

**Checklist Fase E:**
- [ ] Email enviado com Termo pendente (data_inicio=null) → PDF não é anexado, email enviado normalmente
- [ ] Email enviado com Termo completo → PDF anexado normalmente
- [ ] Nenhum erro no log quando Termo está pendente

---

## Fase F — Serviço `/servicos/[id]`: Indicador "Termo Pendente"

### Problema

Quando o corpo gera um Termo com `data_inicio=null`, o serviço vinculado não mostra nenhuma indicação. O cliente não sabe que precisa preencher a data.

### Novo comportamento

**Arquivo:** `cmport-front/app/servicos/[id]/page.tsx`

Verificar o Termo do serviço. Se `termo.data_inicio === null`:

```
┌─ Termo de Garantia ──────────────────────────────────────┐
│  ⏳ Data de execução pendente                             │
│  Prazo: 6 meses · 3x Motor MKN · 2x Manta asfáltica     │
│                                                           │
│  Data de início do serviço:                              │
│  [ __ / __ / ____ ]  [Salvar]                           │
└──────────────────────────────────────────────────────────┘
```

Ao salvar:
```
PATCH /termos-garantia/{id}
  → { data_inicio, data_fim: data_inicio + prazo_meses }
```
Após salvar: badge muda para "Termo completo" → botão "Ver PDF" aparece.

**Checklist Fase F:**
- [ ] Serviço com Termo `data_inicio=null` → exibe badge ⏳ + input de data
- [ ] Preencher data + Salvar → PATCH enviado, `data_inicio` e `data_fim` atualizados
- [ ] Após salvar: badge muda, botão "Ver PDF" aparece, PDF correto
- [ ] Serviço com Termo completo → sem regressão (comportamento atual mantido)
- [ ] `npx tsc --noEmit` zerado

---

## Mapa de Arquivos

| Arquivo | Fases | O que muda |
|---------|-------|-----------|
| `cmport-front/app/corpos-nota/novo/page.tsx` | A, B, C | Fix 2 condicionais + remover tabs + botões garantia + modal Termo |
| `backend/app/models/termo_garantia_model.py` | D | `data_inicio` e `data_fim` nullable |
| `backend/app/schemas/termo_garantia_schema.py` | D | campos Optional |
| `backend/app/services/termo_garantia_service.py` | D | check `data_inicio` antes de gerar PDF |
| `backend/app/services/boleto_service.py` | E | skip Termo pendente no email |
| `cmport-front/app/servicos/[id]/page.tsx` | F | badge + input data execução |
| SQL banco VPS | D | ALTER TABLE nullable |

**Não mudam:**
- `corpo_nota_model.py` — `termo_garantia_id` já existe
- `corpo_nota_service.py` — helpers e `pre_gerar_termo` já implementados
- `corpo_nota_router.py` — endpoint `pre-gerar-termo` já existe
- `corpos-nota/[id]/page.tsx` — seção Termo já implementada
- `_montar_texto_servico` / `_montar_texto_produto` — texto intocado

---

## Ordem de Implementação

```
Fase A (2 linhas — fix urgente)
    ↓
Fase D (model nullable + SQL VPS)   ← antes de B porque B cria Termos sem data
    ↓
Fase B (Step 3 redesign — sem abas)
    ↓
Fase C (garantia botões + modal Termo no wizard)
    ↓
Fase E (email skip Termo pendente)
    ↓
Fase F (serviço indicador pendente)
    ↓
tsc + deploy + smoke test
```

---

## Checklist Final

- [ ] **A**: Orçamento e Manual visíveis para PRODUTO no Step 3
- [ ] **B**: Step 3 sem abas — OS + Orçamento simultâneos, ambos selecionáveis juntos
- [ ] **C**: Garantia com botões 3/6/12 meses; modal Termo abre ao selecionar prazo com OS
- [ ] **D**: `data_inicio` nullable; Termo criado sem data no banco; PDF retorna 400 se pendente
- [ ] **E**: Email não anexa PDF de Termo pendente; email enviado normalmente
- [ ] **F**: Serviço mostra "Termo pendente" + input data + salva PATCH
- [ ] Regressão: corpo SERVIÇO e SERVIÇO+produto — texto idêntico ao anterior
- [ ] Regressão: email com Termo completo → PDF anexado normalmente
- [ ] `npx tsc --noEmit` zerado
- [ ] Deploy VPS + smoke test

---

## Histórico — Implementado nesta sessão (commit f69e945)

- Tabs visíveis para PRODUTO (linha 891: `!== 'MANUTENCAO'`)
- Auto-vínculo XML PRODUTO standalone (`_tentar_vincular_nota_produto_standalone`)
- Endpoint `GET /corpos-nota/{id}/pre-gerar-termo` + schema `PreGerarTermoResponse`
- Seção "Termo de Garantia" no detalhe do corpo com modal + download PDF

## Histórico — Tarefa Anterior Concluída

**Módulo Corpo da Nota — Fase 1 (Manutenção + Serviço + Produto)**
Commits: `1167252` · `6754c46` · `1da01ed` — todas as fases A–G em produção.
