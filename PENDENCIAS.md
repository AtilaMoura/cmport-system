# PENDENCIAS.md — Consolidado de Pendências Ativas

> Gerado a partir de `PLANO_IMPLEMENTACAO.md`, `Refatoracao.md` e `Plano_CorpoNota_Vinculo_Automatico.md`.
> Atualizar este arquivo conforme itens forem concluídos — não substitui o protocolo de execução do `PLANO_IMPLEMENTACAO.md` (Refatoracao.md continua sendo o plano técnico detalhado da tarefa ativa).

---

## ⚠️ Dívida técnica conhecida (não bloqueia tarefas atuais)

**Bug latente em `boleto_service.py` (`sincronizar_status`, linha ~861) — campo errado da API do Inter** (descoberto em 2026-07-27 durante limpeza de boletos duplicados): o código lê `dados.get("dataPagamento")`, mas a Cobrança v3 do Inter **não retorna esse campo** — o campo real é `dataSituacao` (confirmado consultando a API real para 124 boletos). Resultado: toda vez que um boleto passa de EMABERTO para PAGO via sincronização automática, o campo `data_pagamento` fica `NULL` para sempre (a `situacao` fica correta, só a data que não é gravada). Como `BoletoRepository.get_pendentes()` só processa boletos EMABERTO/VENCIDO, o boleto nunca mais é resincronizado depois de virar PAGO — o gap não se autocorrige. **Recomendação:** trocar a extração para usar `dataSituacao` (com fallback pra `dataPagamento` caso a Inter mude o schema) em `boleto_service.py:861` e `:940-948` (mesma lógica em `sincronizar_do_inter`). Não corrigido ainda — só documentado.

**Boletos duplicados por nota fiscal (Inter) — ~90 casos pré-existentes, não relacionados à reconciliação** (descoberto em 2026-07-27): dezenas de notas (Assistência principalmente) têm **múltiplos boletos `BOLETO_INTER` reais** para a mesma nota — até 12 num caso (`82-2`), 10 em outro (`83-2`, `139-2`). Não investigado a fundo; provável bug de retry na geração de boleto via API do Inter ou no fluxo de parcelas do corpo de nota. Não foi tocado (fora do escopo da limpeza de 2026-07-27, que tratou só os duplicados causados pela reconciliação da planilha).

**4 notas de Manutenção com boleto duplicado ainda não resolvidas** (ver "Limpeza de boletos duplicados" abaixo): `7669`, `7690`, `7697` (situação real no Inter = `CANCELADO`), `7706` (situação real = `EXPIRADO`). Nesses casos o boleto real do Inter nunca foi efetivamente pago — o boleto duplicado (`TRANSFERENCIA`) pode representar um pagamento real feito por outro meio depois que o boleto Inter expirou/foi cancelado. Precisa decisão humana: confirmar com o condomínio/financeiro se houve pagamento alternativo antes de mexer. NF `7690` tem complexidade extra (3 boletos — Piazza Fontana, 2 itens de contrato diferentes compartilhando o mesmo número de NF).

---

## ✅ Limpeza de boletos duplicados (D3-D5) — 2026-07-27

**Causa raiz:** ao reconciliar Março-Maio via planilha, quando a NF de Manutenção já existia no sistema como nota fiscal real (importada via XML, com boleto `BOLETO_INTER` já cobrado e pago), meus scripts de reconciliação criaram um **boleto duplicado** (`forma_pagamento=TRANSFERENCIA`) e um **serviço duplicado**, só para registrar a data de pagamento vinda da planilha — sem perceber que a nota já tinha um boleto real.

**Ação tomada:**
1. Consultada a API real do Banco Inter (`InterClient.consultar_boleto`) para 124 boletos, usando o `codigo_solicitacao` de cada um — confirmado que o campo certo é `dataSituacao` (ver dívida técnica acima)
2. Para 61 pares confirmados (`situacao_inter_real == 'RECEBIDO'` e exatamente 1 boleto duplicado por nota): preenchida `data_pagamento` + `valor_total_recebido` no boleto real com o dado confirmado pela API, depois removido o boleto e o serviço duplicados via `registrar_exclusao()` (auditoria) antes do delete
3. Aplicado em local e produção, com os mesmos IDs em ambos (122 registros de auditoria em `registros_exclusoes` em cada banco)
4. 4 casos deixados de fora (ver dívida técnica acima) por exigirem confirmação humana

---

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
| **D3** | Dados — Março 2026 | ✅ Concluído em 2026-07-23: banco sincronizado com produção, 101 notas + 8 recibos aplicados (R$ 83.275,82, 100% da planilha, sem resíduo). Nota JRI (7651.071 A, R$ 3.897,65) identificada pelo usuário como CONDOMINIO EDIFICIO J.R I (id 620) e aplicada em 2026-07-23. Detalhes em `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Março 2026") | Concluído — sem pendências |
| **D4** | Dados — Abril 2026 | ✅ Concluído em 2026-07-24: banco sincronizado com produção, 106 notas + 6 recibos aplicados (R$ 82.190,94, 100% da planilha, sem resíduo). **Ricardo** (id 647), **Shift** (id 592), **Green Park** (id 617) e **Piazza Fontana** (recibo R$14.150, valor confirmado) resolvidos e aplicados em 2026-07-24. Detalhes em `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Abril 2026") | Concluído — sem pendências |
| **D5** | Dados — Maio 2026 | ✅ Concluído em 2026-07-27: banco sincronizado com produção, 88 notas + 5 recibos aplicados (R$ 66.496,12, 100% da planilha, sem resíduo). Zero pendências este mês. Detalhes em `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Maio 2026") | Concluído — sem pendências |
| **D6** | Dados — Junho/Julho 2026 (parcial) | ✅ Concluído em 2026-07-27: descoberto que o sistema já gera notas de Manutenção mensal automaticamente desde Junho (99 notas já existentes, valor bruto — fórmula de imposto 15,65% confirmada). Inseridas as 34 notas de Assistência avulsa + 6 recibos genuinamente ausentes (R$ 35.696,81). Detalhes em `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Junho e Julho 2026") | Concluído — processo de reconciliação precisa ser adaptado a partir de Agosto (só Assistências + recibos) |
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
