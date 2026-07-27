# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefas Anteriores — ARQUIVADAS

**Reconciliação D2-D6 (Fevereiro a Julho/2026) + limpeza de 3 categorias de duplicata (sessão 2026-07-27):** ver `PENDENCIAS.md` para o detalhe completo. Resumo: Março e Abril fechados em 100% contra a soma das duas planilhas (principal + CMPORT TEC), com R$ ~70 mil em duplicatas/pagamentos mal registrados corrigidos (local + produção, auditoria completa em `registros_exclusoes`). Maio/Junho/Julho ainda não passaram por essa validação linha a linha — só pela reconciliação original (D5/D6), que não pegou esse tipo de bug.

**Feature Recibo (wizard + detalhe/edição/exclusão), sessão 2026-07-14/20:** concluída e commitada (`b80a303`, `36c2ca8` e sessão 07-20 com passos 5-8).

*(Tarefas anteriores a essas: ver histórico em `PLANO_IMPLEMENTACAO.md`.)*

---

## Tarefa Ativa — Fluxo Financeiro: página no sistema para substituir a planilha manual

### Objetivo e escopo

A reconciliação mensal manual (planilha Excel → sistema) é a causa raiz de praticamente todos os bugs de duplicidade encontrados nesta sessão (3 categorias diferentes, ~R$ 70 mil em Março+Abril isolados). O processo é frágil porque:

1. Ninguém no sistema consegue hoje responder "quanto entrou esse mês" sem abrir a planilha Excel e comparar manualmente.
2. Existem **dois CNPJs** (CMPORT principal e CMPORT TEC) e o sistema não distingue isso de forma confiável — `notas_fiscais.cnpj_emitente` existe no schema mas está `NULL` em 694 das 706 notas (não é populado no import de XML nem exigido em criação manual).
3. CMPORT TEC não tem credenciais da API do Inter — nada sincroniza automaticamente pra esse CNPJ; hoje só existe na planilha manual.
4. Toda reconciliação passada criou notas novas sem checar se o serviço já existia nativamente no sistema (via Auvo/Corpo de Nota), gerando duplicatas silenciosas que só apareceram nesta sessão, meses depois.

**Objetivo:** construir uma página `/fluxo-financeiro` no CMPort que vira a fonte de verdade do "quanto entrou esse mês", por CNPJ, direto dos dados que já existem (`notas_fiscais` + `boletos` + `recibos`) — sem depender de Excel. A planilha deixa de ser a entrada de dados e vira, na melhor das hipóteses, uma conferência transitória.

**Fora de escopo desta tarefa:** obter credenciais Inter para o CNPJ da CMPORT TEC (item separado, menor prioridade — ver Fase 5); refatorar o módulo F1.3 original (categorização de extrato bancário via Inter) — é um problema diferente e já tem plano próprio em `PLANO_IMPLEMENTACAO.md`, não mexe aqui.

### Análise dos arquivos existentes

| Arquivo | Relevância |
|---|---|
| `backend/app/models/nota_fiscal_model.py` | `cnpj_emitente` já existe (String(18), nullable) — não é FK pra `configuracao_inter`, não é populado de forma confiável |
| `backend/app/services/nota_fiscal_service.py` (linha ~581, `numero_nota = f"{numero_nota_raw}-{serie}"...`) | Import de XML — ponto onde `cnpj_emitente` deveria ser extraído do `<CPFCNPJPrestador>` e salvo, e não está |
| `backend/app/services/servico_service.py` (`resumo_financeiro`, linhas 131-218) | Já soma boletos PAGO/BAIXADO por mês + recibos ENTRADA sem `condominio_id` vinculado a serviço — lógica de agregação mensal já existe, mas sem groupby CNPJ nem detalhamento por condomínio/nota |
| `backend/app/models/corpo_nota_model.py` | `configuracao_inter_id` é o único campo hoje que confiavelmente amarra uma transação a um CNPJ — mas só existe quando a nota passou pelo fluxo de Corpo de Nota (a maioria das notas de Manutenção/Assistência recorrente, importadas via XML direto, não tem `corpo_nota_id` preenchido) |
| `configuracao_inter` (tabela) | 2 registros: id 1 = CMPORT principal (CNPJ 22.761.557/0001-88, com credenciais Inter), id 2 = CMPORT TEC (CNPJ 65.756.913/0001-88, sem nenhuma credencial) |
| `PENDENCIAS.md` | Todo o histórico de bugs desta sessão que motivou este plano — usar como catálogo de casos de teste |
| `PLANO_IMPLEMENTACAO.md` (F1.1/F1.2/F1.3) | Módulo financeiro genérico (extrato Inter categorizado) já parcialmente pronto — complementar, não substitui esta tarefa |

### Passo a passo por fase

#### Fase 1 — Fundação: CNPJ confiável em toda nota fiscal (backend)

1.1. Corrigir `nota_fiscal_service.py` (import de XML) para extrair `<CPFCNPJPrestador><CNPJ>` do XML e salvar em `cnpj_emitente` sempre que a nota for criada — o dado já está disponível no XML armazenado, só não está sendo lido nesse campo.

1.2. Script de backfill (mesmo padrão dos scripts `_*.py` desta sessão, com `registrar_exclusao` se algo precisar ser corrigido): para as 694 notas com `cnpj_emitente=NULL`, tentar extrair o CNPJ do `xml_original` armazenado (regex simples em `<CPFCNPJPrestador>`); para as que não têm XML real (`xml_original='ENTRADA_MANUAL'`, criadas por reconciliação), assumir CNPJ principal (22.761.557/0001-88) — é a esmagadora maioria dos casos manuais desta sessão, exceto as que já inserimos explicitamente como TEC.

1.3. Qualquer criação manual de nota daqui pra frente (reconciliação futura, endpoint manual) passa a exigir `cnpj_emitente` explícito — não fica mais implícito.

#### Fase 2 — Endpoint de resumo mensal por CNPJ (backend)

2.1. Novo endpoint `GET /financeiro/fluxo-mensal?ano=2026&mes=4&cnpj=<opcional>` — para cada CNPJ (ou os dois juntos), retorna:
   - Total de Manutenção (soma de boletos PAGO/BAIXADO por `data_pagamento` no mês, notas tipo MANUTENCAO)
   - Total de Assistência (idem, tipo ASSISTENCIA)
   - Total de Recibos ENTRADA/PAGO no mês
   - Lista detalhada por condomínio + número de nota (normalizado — ver 2.2) + valor + data, pra permitir conferência linha a linha igual ao que fizemos manualmente esta sessão

2.2. Função de normalização de `numero_nota` (extrair pra `fin_utils.py` ou similar, reaproveitável): remove prefixo `000.000.`, sufixos ` A`/` M`/`/NNNN A`, sufixo `-N` de parcela — usada só para exibição/agrupamento, nunca sobrescreve o dado original.

2.3. Detecção de possível duplicata: mesmo endpoint (ou um `GET /financeiro/fluxo-mensal/alertas`) sinaliza pares de notas com mesmo `condominio_id` + `valor_nominal` (tolerância de centavos) + `data_pagamento` a ±2 dias — mesma heurística usada manualmente nesta sessão pra achar as 3 categorias de bug. Isso é alerta, não bloqueio — fica visível na tela antes de virar um problema de R$14 mil descoberto 3 meses depois.

#### Fase 3 — Frontend `/fluxo-financeiro`

3.1. Página nova em `cmport-front/app/fluxo-financeiro/page.tsx`: seletor de mês/ano, toggle CNPJ (Principal / TEC / Ambos), cards de total (Manutenção, Assistência, Recibos, Total), tabela detalhada por condomínio/nota com a mesma estrutura da planilha atual (pra facilitar a transição visual pro cliente).

3.2. Alertas de possível duplicata (Fase 2.3) destacados em vermelho/aviso na tabela, com link direto pro par de notas suspeito.

3.3. Adicionar a `/fluxo-financeiro` na sidebar (grupo FINANCEIRO, mesma estrutura de 4 grupos já planejada em F1.3 — reaproveitar a refatoração de `Sidebar.tsx` se ela for feita, ou adicionar como item avulso se F1.3 não avançar por ora).

#### Fase 4 — Migração do processo de reconciliação mensal

4.1. Atualizar `fluxo-financeiro/PROCESSO_RECONCILIACAO_MENSAL.md`: a partir de Agosto/2026, o fluxo se inverte — abrir `/fluxo-financeiro` no sistema primeiro, comparar contra a planilha (que continua existindo como registro contábil formal), e só criar registro novo pro que **genuinamente não existe** no sistema. Nunca mais o caminho inverso (transcrever tudo da planilha sem checar o que já existe).

4.2. Regra de ouro (já validada nesta sessão, formalizar no runbook): antes de criar qualquer nota nova a partir de uma linha de planilha, normalizar o número (Fase 2.2) e buscar por `condominio_id` + `numero_nota` normalizado — se já existir nota com esse número base, a linha da planilha é parcela/conferência de uma nota existente, nunca gera nota nova.

#### Fase 5 — CMPORT TEC (menor prioridade, não bloqueia as fases acima)

5.1. Avaliar com o cliente se vale obter credenciais Inter (client_id/secret/certificado) pra `configuracao_inter` id 2 — hoje CMPORT TEC não tem nenhuma. Enquanto isso não acontece, toda entrada da TEC continua sendo lançada manualmente como fizemos hoje (nota + boleto `TRANSFERENCIA` + serviço).

### Regras de negócio e validações

- Nunca alterar `notas_fiscais.numero_nota` de registros existentes durante o backfill de CNPJ (Fase 1.2) — só preencher `cnpj_emitente`, que está vazio.
- `resumo_financeiro()` (já existente) não muda de comportamento — o novo endpoint de Fase 2 é aditivo, não substitui o que já alimenta `/servicos/[id]`.
- Toda correção de dado feito a partir de agora (incluindo qualquer ajuste retroativo de CNPJ) usa `registrar_exclusao()` só quando houver *exclusão*; alteração de campo (como preencher `cnpj_emitente` vazio) não precisa de auditoria de exclusão, mas deve ser feita em lote com log do que foi alterado (mesmo padrão dos scripts `_*.py` já usados nesta sessão, output printado).
- Seguir a decisão de "nunca deletar registros — soft delete quando possível" (CLAUDE.md) em qualquer ajuste desta tarefa.

### Checklist final

- [x] Fase 1.1 — XML import passa a extrair e salvar `cnpj_emitente` (fix no schema `NotaFiscalImportada`, commit `f197fb0`)
- [x] Fase 1.2 — backfill das 694 notas sem CNPJ direto (572 sem corpo + 122 via `corpo_nota_id`→`configuracao_inter` + 1 caso manual sem config no corpo) + 37 recibos sem CNPJ — local e produção, mesmos IDs
- [ ] Fase 1.3 — criação manual de nota exige CNPJ explícito (adiado — campo ficou opcional por ora, ver nota abaixo)
- [x] Fase 2.1 — endpoint `GET /financeiro/fluxo-mensal` implementado (`fluxo_financeiro_router.py` + `_service.py` + `_schema.py`) — validado contra Março (R$83.275,81, diff de 1 centavo por float) e Abril (R$85.662,19, exato)
- [x] Fase 2.2 — `normalizar_numero_nota()` implementada em `fluxo_financeiro_service.py`
- [x] Fase 2.3 — `detectar_duplicatas()` implementada (heurística condomínio+valor+data ±2 dias) — testada em Abril pós-limpeza: 0 alertas (esperado, já não tem duplicata sobrando)
- [ ] Fase 3.1-3.3 — página `/fluxo-financeiro` no frontend — não iniciada
- [ ] Fase 4.1-4.2 — runbook atualizado — não iniciado
- [x] Comparar `/fluxo-financeiro` de Março e Abril contra os valores validados manualmente — **bateu** (ver acima)

**Nota sobre Fase 1.2 (ampliada):** o backfill original só cobria notas sem `corpo_nota_id`. Ao testar o endpoint de Abril, apareceu uma diferença de R$439,23 — rastreada até uma nota (`7701`, id 449) cujo corpo de nota vinculado não tinha `configuracao_inter_id` preenchido. Corrigida manualmente para CNPJ principal (padrão claro pelo número da nota). Backfill via `corpo_nota_id` também aplicado às 121 notas restantes que só resolviam CNPJ por esse caminho.

**Ambiente local instável nesta sessão:** processos zumbi de sessões anteriores (backend/frontend) e um container Docker de outro projeto (`nia_backend`) ocupando a porta 8000 atrapalharam bastante os testes manuais via HTTP. Validação final da Fase 2 foi feita chamando o service diretamente em Python (sem passar pela camada HTTP), que é confiável. Testar via HTTP/frontend fica pendente para quando o ambiente estiver limpo.

### Testes esperados

- Rodar backfill de CNPJ local → conferir contagem final (`cnpj_emitente IS NULL` deve cair a ~0, exceto casos genuinamente ambíguos) → aplicar produção → confirmar mesmos números
- `GET /financeiro/fluxo-mensal?ano=2026&mes=3&cnpj=principal` → total deve bater com R$ 83.275,82 (Março, validado nesta sessão)
- `GET /financeiro/fluxo-mensal?ano=2026&mes=4` (ambos CNPJs) → total deve bater com R$ 85.662,19 (Abril, validado nesta sessão)
- Alerta de duplicata: inserir de propósito uma nota teste duplicando uma existente (mesmo padrão dos bugs encontrados) → confirmar que aparece no endpoint de alertas → remover a nota teste
- Frontend: trocar mês/ano, trocar toggle de CNPJ, conferir que os totais mudam corretamente e a tabela detalhada corresponde
- `npx tsc --noEmit` e `npm run lint` zerados no frontend
