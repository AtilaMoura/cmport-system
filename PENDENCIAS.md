# PENDENCIAS.md — Consolidado de Pendências Ativas

> Gerado a partir de `PLANO_IMPLEMENTACAO.md`, `Refatoracao.md` e `Plano_CorpoNota_Vinculo_Automatico.md`.
> Atualizar este arquivo conforme itens forem concluídos — não substitui o protocolo de execução do `PLANO_IMPLEMENTACAO.md` (Refatoracao.md continua sendo o plano técnico detalhado da tarefa ativa).

---

## 🚧 Em andamento agora (não commitado)

**Feature Recibo — tipo ENTRADA/SAIDA + vínculo com serviço**
Arquivos modificados sem commit: `backend/app/models/recibo_model.py`, `backend/app/models/servico_model.py`, `backend/app/schemas/recibo_schema.py`, `backend/app/services/recibo_service.py`, `backend/app/routers/recibo_router.py`, `backend/app/main.py`, `cmport-front/app/recibos/novo/page.tsx`.
Adiciona: `tipo` (ENTRADA/SAIDA), `configuracao_inter_id` + `cnpj_emitente`, `cnpj_cliente`, relação `Recibo.servicos` ↔ `ManutencaoAssistencia.recibo`.

> ✅ Plano técnico completo + resultado de teste local em `Refatoracao.md` (sessão 2026-07-14). Testado end-to-end (ENTRADA+condomínio+OS reaproveitada e SAIDA+cliente externo+sem OS) com 3 bugs encontrados e corrigidos (limit=700, mapeamento de campos em `/recibos/buscar-os`, parse de data). Falta: testar "Morador cadastrado" e "nome avulso", rodar `tsc --noEmit`, e commitar.

---

## Pendências do índice geral (PLANO_IMPLEMENTACAO.md)

| # | Módulo | Descrição | Status |
|---|--------|-----------|--------|
| **C1** | Corpo da Nota — Melhorias | Fase 1 (tabs PRODUTO no wizard), Fase 2 (vínculo automático nota PRODUTO standalone), Fase 3 (Termo de Garantia via corpo) | Nenhuma fase iniciada |
| **D1** | Dados — Pendentes Janeiro 2026 | 7 recibos sem condomínio mapeado (Eraseg, Durval, Adelson, Ludmila, Luis, Chistopher) — total R$ 2.530,00. Planilha em `fluxo-financeiro/PENDENTES_JANEIRO_2026.xlsx` | Aguardando identificação dos condomínios |
| **N2** | Nota de Entrada → Serviço | Importar XML NF-e de entrada e auto-criar `ManutencaoAssistencia` | Não iniciado |
| **N3-front** | Boleto Manual — Frontend | Formulário, upload PDF, badge status, marcar pago. Backend já pronto (`/boletos/manual`, `/registrar-pagamento`, `/enviar-email`) | Não iniciado |
| **F1.3** | Financeiro — Frontend | Sidebar 4 grupos (OPERACIONAL/FISCAL/FINANCEIRO/SISTEMA), 3 páginas, 6 componentes. Backend (F1.1/F1.2) já pronto | Não iniciado |
| **F1.4** | Financeiro — QA + Entrega | Teste ponta a ponta + deploy VPS | Bloqueado por F1.3 |

**Nota:** o item CI/CD listado como pendente em `PLANO_IMPLEMENTACAO.md` já está concluído — confirmado em `Refatoracao.md` ("Prioridade 1 — CI/CD ✅ CONCLUÍDO") e refletido no fluxo de deploy documentado no `CLAUDE.md`. Atualizar a tabela do índice geral quando possível.

---

## Checklist pendente da última tarefa registrada em Refatoracao.md (P2 — Corpo de Nota)

Implementação marcada como feita (`P2-A` completo, `tsc --noEmit` zerado), mas os testes manuais nunca foram marcados:

- [ ] Step 5 parcelas — total correto para PRODUTO (R$ 600, não R$ 1.200)
- [ ] Texto do corpo — "Parcelamento: 1a. Parcela: R$ 600,00" correto
- [ ] Regressão MANUTENÇÃO → valor do contrato preservado
- [ ] Regressão SERVIÇO com orçamento misto → serviço + produto corretos
- [ ] P2-B — Campo data visível/editável em Step 4 (SERVIÇO/PRODUTO)
- [ ] P2-C — Campo número OS visível/editável em Step 3 quando sem OS

---

## Plano_CorpoNota_Vinculo_Automatico.md — status a revisar

Este plano (22/jun) propunha adicionar `corpo_nota_id` em `ManutencaoAssistencia` para vínculo bidirecional explícito corpo↔serviço. **Esse campo não existe no model hoje.**

Porém, commits recentes parecem ter resolvido o mesmo problema de forma mais simples, sem o campo novo:
- `0d2ec89` — feat: adiciona card de serviço vinculado no detalhe da nota fiscal
- `d240e09` — fix: cria serviço automaticamente mesmo sem OS/orçamento no corpo de nota

**Ação sugerida:** antes de retomar esse plano, verificar se os gaps originais (Fase 1.2 fallback por CNPJ do tomador, Fase 2 herança de `orcamento_id`/`data_servico`/`descricao` do corpo para o serviço, Fase 4 seção "Corpo da Nota" no detalhe do serviço) ainda existem ou já foram cobertos pelos commits acima. Se ainda pertinente, redigir plano técnico atualizado em `Refatoracao.md`. O arquivo original fica arquivado em `_arquivo/docs/` para referência.

O "Fix Imediato" de dados de produção descrito no plano (`UPDATE notas_fiscais SET condominio_id = 620 WHERE id = 805`) — confirmar se já foi aplicado antes de reexecutar.

---

## Referência técnica (não é pendência de tarefa)

`Analise_Banco_Dados.md` — levantamento de redundâncias no schema (R1–R14, FK circular `notas_fiscais`↔`corpos_nota`, duplicidade de `numero_os`/`data_servico`, 3 convenções de nome para alíquotas de imposto, dois padrões de soft delete, etc.). Mantido na raiz como referência para decisões futuras de schema — não bloqueia nenhuma tarefa atual.
