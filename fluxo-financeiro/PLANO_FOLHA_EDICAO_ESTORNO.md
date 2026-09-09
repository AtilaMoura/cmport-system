# PLANO — Editar / Excluir / Estornar lançamentos na Folha do Funcionário

**Origem:** cliente preenchendo `/fluxo-financeiro/funcionarios` não tinha como excluir nem
editar um lançamento errado; acabou duplicando o Vale Refeição de setembro (André 3×, Almira 2×).

**Data:** 09/09/2026
**Status:** aguardando implementação (deploy só depois de tudo pronto e validado)

---

## Diagnóstico

Como a folha do mês é montada hoje (`despesa_parcelas` de `despesas` com `funcionario_id`):

| Tipo | De onde vem | Editável hoje | Excluível hoje |
|---|---|---|---|
| RECORRENTE (salário, adiantamento, VR, VT, plantão, HE) | gerado do **cadastro do funcionário** (`funcionario_variaveis` → `sincronizar_recorrentes`) | ❌ | ❌ |
| UNICO ("+ Lançamento avulso") | criado na própria tela da folha | ❌ | ❌ |

Backend **já tem** (`despesa_router.py`):
- `PUT /despesas/parcelas/{id}` → edita `valor` / `data_vencimento` (só se `PENDENTE`)
- `PUT /despesas/{id}` → edita `descricao` / `categoria_id` / `banco_previsto_id` / `observacao`
- `DELETE /despesas/{id}` → soft-delete (`deletado_em`) + `registrar_exclusao` (auditoria)

**Falta no backend:** desfazer um pagamento (parcela marcada `PAGO` por engano — hoje não tem volta;
`marcar_pago` ainda cria uma `fin_movimentacoes` SAIDA que também precisa ser estornada).

---

## Parte 1 — Backend: estorno de pagamento

Camadas: schema → service → router (repository já basta).

### 1.1 `despesa_service.py` → `DespesaService.estornar_pagamento(db, parcela_id)`
- Busca a parcela; se `status != PAGO` → erro "Essa parcela não está paga."
- Soft-delete da `fin_movimentacoes` vinculada (`parcela.movimentacao_id`), reaproveitando o
  padrão de `FinMovimentacaoService.deletar` (`registrar_exclusao` + `deletado_em`).
- Reseta a parcela: `status=PENDENTE`, `data_pagamento=None`, `banco_id=None`,
  `forma_pagamento=None`, `movimentacao_id=None`.
- `registrar_exclusao(db, "despesa_parcela_pagamento", parcela_id, {snapshot})` pra deixar
  rastro do estorno.
- Retorna `DespesaResponse` da despesa-mãe.

### 1.2 `despesa_router.py`
```
PATCH /despesas/parcelas/{parcela_id}/estornar  → DespesaService.estornar_pagamento
```
(sem body; segue o padrão de `PATCH .../pagar`)

### 1.3 Regra de segurança
- Só estorna pagamento **manual** (`fin_movimentacoes.origem = 'MANUAL'`). Se a movimentação
  tiver vindo do banco (`origem='BANCO'`, conciliada), bloquear com mensagem pedindo pra
  desfazer pela tela de conciliação. (Na folha isso não deve acontecer, mas fica a trava.)

### 1.4 Teste
`backend/tests/test_despesa_estorno.py` — cria despesa UNICO, paga, estorna, confere:
parcela volta a PENDENTE e a `fin_movimentacoes` fica com `deletado_em` preenchido.

---

## Parte 2 — Frontend: ações na tela da Folha (`cmport-front/app/fluxo-financeiro/funcionarios/page.tsx`)

Em cada linha de lançamento (`g.linhas.map(l => ...)`), conforme o estado:

### 2.1 Parcela PENDENTE
- **botão "editar"** → edição inline de **valor** + **data de vencimento**
  (`PUT /despesas/parcelas/{id}`). Mesmo padrão visual do `DespesaGenericaPage.tsx`
  (`iniciarEdicaoParcela` / bloco `editando`).
- **botão "excluir"**:
  - `tipo_pagamento === 'UNICO'` (avulso) → `confirm(...)` + `DELETE /despesas/{id}`.
  - `tipo_pagamento === 'RECORRENTE'` → **não exclui aqui**. Mostra aviso:
    *"Esse lançamento vem do cadastro do funcionário (variável da folha). Pra tirar de todos
    os meses, zere o valor no cadastro. Pra esse mês só, deixe como está ou ajuste o valor."*
    com link pra `/funcionarios` (abrir edição do funcionário).
    Racional: `sincronizar_recorrentes` recria a despesa recorrente enquanto a variável
    estiver preenchida — apagar aqui não resolveria.

### 2.2 Parcela PAGA
- **botão "estornar pagamento"** → `confirm("Isso desfaz o pagamento e remove a saída do
  fluxo de caixa. Confirmar?")` + `PATCH /despesas/parcelas/{id}/estornar`.
- Depois do estorno a parcela volta a PENDENTE e reaparecem os botões editar/excluir.

### 2.3 Editar dados do lançamento avulso (opcional, escopo menor)
- No avulso, além de valor/data, permitir trocar **tipo (categoria)** e **descrição**
  (`PUT /despesas/{id}`). Um "editar" que abre o mesmo mini-form do "+ Lançamento avulso"
  já preenchido. *Se ficar grande, fica pra segunda leva.*

### 2.4 Texto de orientação perto do "+ Lançamento avulso"
> Salário, adiantamento, vales, plantão e hora extra vêm do **cadastro do funcionário**.
> Use o avulso só pra um extra pontual (férias, 13º, reembolso, PLR).

### 2.5 Qualidade
`cd cmport-front && npm run lint && npx tsc --noEmit` — zero erro.

---

## Parte 3 — Limpeza dos dados já duplicados em produção (setembro/2026)

Script `fluxo-financeiro/limpar_duplicatas_vr_setembro.py` (padrão dos outros: backup → dry-run → aplica via SSH).

| Funcionário | Ação | Motivo |
|---|---|---|
| **André** (id 1) | soft-delete despesa **1199** (avulso R$ 315,00) | duplicata |
| **André** | soft-delete despesa **1200** (avulso R$ 578,55) | duplicata |
| **André** | **mantém** despesa 1204 (recorrente VR R$ 578,55/mês) | correto (= `funcionario_variaveis.vale_refeicao`) |
| **Almira** (id 7) | soft-delete despesa **1198** (avulso R$ 315,00) | duplicata; VR mensal já corrigido pra R$ 578,55 na recorrente 933 |
| **Almira** | **mantém** parcelas 1508 (adiant. R$822 PAGO) e 1534 (HE R$1,84 PAGO) | pagamentos reais, não mexer |

- Usa o próprio `DELETE /despesas/{id}` (via SSH rodando no container, ou request autenticado)
  pra passar por `registrar_exclusao`.
- Nenhuma parcela PAGA é tocada.
- Backup: `backup_producao_pre_limpeza_vr_setembro_<timestamp>.sql` antes de aplicar.

---

## Ordem de execução

1. Parte 1 (backend estorno) + teste — local.
2. Parte 2 (frontend) — local, validar lint/tsc.
3. Teste manual local: criar avulso → editar → excluir; pagar → estornar.
4. **Commit** (2 commits: `feat(despesa): estorno de pagamento` + `feat(folha): editar/excluir/estornar na tela da folha`).
5. **Deploy** `git push origin master` (Actions → Docker Hub → VPS, ~3 min).
6. Parte 3 (limpeza produção) — depois do deploy, com backup.
7. Validar em produção: André e Almira com só 1 VR em setembro; testar editar/estornar numa parcela real.

---

## Arquivos que serão tocados

**Backend**
- `backend/app/services/despesa_service.py` (+ `estornar_pagamento`)
- `backend/app/routers/despesa_router.py` (+ rota `PATCH .../estornar`)
- `backend/tests/test_despesa_estorno.py` (novo)

**Frontend**
- `cmport-front/app/fluxo-financeiro/funcionarios/page.tsx`

**Scripts (não versionados / pasta fluxo-financeiro)**
- `fluxo-financeiro/limpar_duplicatas_vr_setembro.py` (novo)
