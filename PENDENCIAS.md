# PENDENCIAS.md — Consolidado de Pendências Ativas

> Gerado a partir de `PLANO_IMPLEMENTACAO.md`, `Refatoracao.md` e `Plano_CorpoNota_Vinculo_Automatico.md`.
> Atualizar este arquivo conforme itens forem concluídos — não substitui o protocolo de execução do `PLANO_IMPLEMENTACAO.md` (Refatoracao.md continua sendo o plano técnico detalhado da tarefa ativa).

---

## ⚠️ Dívida técnica conhecida (não bloqueia tarefas atuais)

**3 testes quebrados em `backend/tests/test_corpo_nota_produto.py`** (descoberto em 2026-07-15 ao rodar `pytest backend/tests/` durante a criação do baseline de `test_nota_fiscal_gera_servico.py`): `test_nota_produto_vincula_ao_corpo_servico`, `test_nota_vinculada_criada_simetricamente`, `test_nota_produto_sem_cnpj_produto_nao_vincula`. Erro: `_tentar_vincular_nota_produto` sendo chamado quando o teste esperava que não fosse — indica que os commits de vínculo automático de corpo de nota (`d48a042`, `42d0e3f`, `6455ae0`, `0d2ec89`) mudaram o comportamento de `CorpoNotaService.tentar_vincular_por_nota_fiscal` e os testes ficaram desatualizados (ou é um bug real introduzido por esses commits — não investigado ainda). Sem relação com a tarefa de recibo/serviço em andamento. Decisão: tratar depois, separado.

---

## 🚧 Em andamento agora (não commitado)

**Feature Recibo ENTRADA→Serviço — Passos 5-8 implementados (sessão 2026-07-20)**
Passos 1-4 já estavam commitados. Nesta sessão: Passo 5 (migration confirmada local), Passo 6 (email do recibo com PDF anexado — `POST /recibos/{id}/enviar-email`, `GET /recibos/{id}/pdf`, novo template `recibo_template.html`, refactor `EmailService._enviar_com_anexos` reaproveitado de `enviar_boleto`), Passo 7 (retrofit de serviço via `ReciboUpdate.condominio_id`), Passo 8 (frontend `/recibos/novo` e `/recibos/[id]`). 35 testes na suíte, 32 passando (mesmas 3 falhas pré-existentes), `npx tsc --noEmit` zerado. Detalhes completos em `Refatoracao.md`.

**Pendente antes do deploy:**
- Passo 9 (retrofit de dados — Eraseg e outros recibos históricos) depende da mesma identificação de condomínio do D1, não bloqueia o deploy do mecanismo em si.
- Geração de PDF (`weasyprint`) não pôde ser validada fim-a-fim neste Windows local — falta lib nativa (GTK/Pango/Cairo), mesma limitação preexistente do Termo de Garantia. Template Jinja validado isoladamente (renderiza sem erro). Precisa smoke test via Docker antes de ir para produção.
- **Aprovação explícita do usuário para `git push origin master`** — regra do projeto, nada foi deployado ainda.

**Achado à parte, sem relação com o Recibo:** `backend/app/services/boleto_service.py` está modificado no working directory (removida uma folga artificial de 5 dias na data de vencimento enviada à API do Inter) — não fui eu quem alterou nesta sessão e não commitei/testei essa mudança. Fica para o usuário decidir o que fazer com ela.

---

## Pendências do índice geral (PLANO_IMPLEMENTACAO.md)

| # | Módulo | Descrição | Status |
|---|--------|-----------|--------|
| **C1** | Corpo da Nota — Melhorias | Fase 1 (tabs PRODUTO no wizard), Fase 2 (vínculo automático nota PRODUTO standalone), Fase 3 (Termo de Garantia via corpo) | Nenhuma fase iniciada |
| **D1** | Dados — Pendentes Janeiro 2026 | 7 recibos sem condomínio mapeado (Eraseg, Durval, Adelson, Ludmila, Luis, Chistopher) — total R$ 2.530,00. Planilha em `fluxo-financeiro/PENDENTES_JANEIRO_2026.xlsx` | Aguardando identificação dos condomínios |
| **D2** | Dados — Fevereiro 2026 | ✅ Concluído em 2026-07-14: banco sincronizado com produção, 114 notas + 2 recibos aplicados (R$ 63.750,41, 100% da planilha). Único resíduo: recibo **Eraseg** (REC-2026-021, R$650,00) sem `condominio_id` — mesma pendência de identificação do D1. Detalhes em `fluxo-financeiro/RELATORIO_NF_2026.md` | Concluído — resíduo Eraseg aguardando identificação (mesmo caso do D1) |
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
