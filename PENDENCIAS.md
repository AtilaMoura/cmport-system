# PENDENCIAS.md — Consolidado de Pendências Ativas

> Gerado a partir de `PLANO_IMPLEMENTACAO.md`, `Refatoracao.md` e `Plano_CorpoNota_Vinculo_Automatico.md`.
> Atualizar este arquivo conforme itens forem concluídos — não substitui o protocolo de execução do `PLANO_IMPLEMENTACAO.md` (Refatoracao.md continua sendo o plano técnico detalhado da tarefa ativa).

---

## ⚠️ Dívida técnica conhecida (não bloqueia tarefas atuais)

**✅ Bug em `boleto_service.py` (`sincronizar_status` e `sincronizar_do_inter`) — campo errado da API do Inter — CORRIGIDO em 2026-07-27** (commit `dd78776`, deploy em produção confirmado): o código lia `dados.get("dataPagamento")`, mas a Cobrança v3 do Inter **não retorna esse campo** — o campo real é `dataSituacao`. Resultado: todo boleto que virava PAGO via sincronização automática ficava com `data_pagamento` `NULL` para sempre (a `situacao` ficava correta, só a data que não era gravada), e como `BoletoRepository.get_pendentes()` só processa EMABERTO/VENCIDO, o gap nunca se autocorrigia. Fix: fallback para `dataSituacao` só quando a nova situação já é PAGO/BAIXADO (nunca para EXPIRADO/CANCELADO). Testado contra a API real (caso PAGO extrai a data certa, caso EXPIRADO continua sem gerar data falsa) e suíte de testes (38 passaram, mesmas 3 falhas pré-existentes).

**✅ INVESTIGADO em 2026-07-27 — "boletos duplicados" (Inter) não são duplicados, são Corpo de Nota parcelado (receita real fora da planilha).** Dezenas de notas com numeração `NNN-N` (ex: `82-2`, `83-2`, `117-2`) têm múltiplos boletos `BOLETO_INTER` para a mesma nota — até 12 num caso. Investigação (`82-2`, `83-2`, `117-2`, `7773` verificados em detalhe) confirmou: são **parcelamentos legítimos gerados pelo módulo Corpo de Nota** (3x/6x/10x), com `numero_parcela`/`total_parcelas` corretos e cada parcela marcada `PAGO` progressivamente na data real de vencimento — **nenhuma duplicidade de cobrança**. Essas notas **nunca estiveram na planilha Excel** (fluxo separado, mais novo, que o time financeiro não usa para preencher a planilha manual) — por isso pareciam "a mais" ao comparar totais do sistema com a planilha.

**Único bug real encontrado:** NF `82-2` (Mont Blanc, condomínio 688) teve uma **tentativa de geração falha em 2026-04-02** — 6 boletos criados e imediatamente cancelados (`situacao=CANCELADO`, todos com `data_pagamento=NULL`), seguida de uma segunda tentativa bem-sucedida em 2026-04-08 (6 boletos reais, sendo pagos progressivamente). Os 6 `CANCELADO` não afetam nenhum total (já são excluídos de qualquer soma por `situacao`), mas ficam como lixo/ruído no banco. Não foram removidos — avaliar se vale limpar via `registrar_exclusao()` + delete, mesmo padrão usado na limpeza de duplicados de reconciliação.

**Recomendação:** ao comparar totais do sistema com a planilha em qualquer mês, sempre isolar as notas com numeração `NNN-N` (Corpo de Nota) antes de julgar a diferença como erro — ver metodologia em `fluxo-financeiro/RELATORIO_CORPO_NOTA_MAIO.md`.

**✅ SEGUNDA CATEGORIA DE DUPLICATA ENCONTRADA E CORRIGIDA em 2026-07-27 — Assistência (não só Manutenção).** Ao gerar o relatório de Maio, apareceram pares de notas onde a mesma nota real (numero plano, ex `7714`, `7715`, `7771`) tinha uma **duplicata inteira** criada por engano durante a reconciliação da planilha (`7714 A`, `7715 A`, `7771 A` etc) — mesmo bug da limpeza de Manutenção (D3-D5), mas a limpeza anterior só filtrou `tipo='MANUTENCAO'` e não pegou Assistência. Confirmado com evidência direta (mesmo condomínio, mesmo valor, mesma data exata, só forma de pagamento diferente — não é parcela, é duplicação exata).

**Ação tomada:** encontrados 23 pares nota-real + nota-duplicada em todo o sistema (Março, Abril e Maio). Para os **15 pares onde 100% dos boletos da duplicata batem exatamente (valor+data) com boletos da nota real**: removida a nota inteira (duplicata), seus boletos e serviços, via `registrar_exclusao()` antes de cada delete. Aplicado em local e produção, mesmos IDs. Impacto em Maio: total caiu de R$92.614,58 para **R$91.599,91** (117 cobranças, 3 pares eram de Maio: `7714`, `7715`, `7771`).

**8 pares deixados de fora — não são duplicação simples, precisam revisão manual:**
| NF real | NF duplicada | Situação |
|---|---|---|
| `7645` (id 370) | `7645 A` (id 1082) | Duplicata tem 2 boletos, só 1 bate com a nota real — o outro (13/03, R$891,19) não existe na nota real, pode ser parcela genuína perdida |
| `7650` (id 373) | `7650 A` (id 1083) | **Nota real não tem NENHUM boleto** — apagar a duplicata perderia o único registro de pagamento existente |
| `7652`, `7654`, `7655`, `7659`, `7660`, `7662` | correspondentes ` A` | Mesmo padrão de descompasso parcial — precisa checar boleto a boleto antes de decidir |

**4 notas de Manutenção com boleto duplicado ainda não resolvidas** (ver "Limpeza de boletos duplicados" abaixo): `7669`, `7690`, `7697` (situação real no Inter = `CANCELADO`), `7706` (situação real = `EXPIRADO`). Nesses casos o boleto real do Inter nunca foi efetivamente pago — o boleto duplicado (`TRANSFERENCIA`) pode representar um pagamento real feito por outro meio depois que o boleto Inter expirou/foi cancelado. Precisa decisão humana: confirmar com o condomínio/financeiro se houve pagamento alternativo antes de mexer. NF `7690` tem complexidade extra (3 boletos — Piazza Fontana, 2 itens de contrato diferentes compartilhando o mesmo número de NF).

---

## 🔴 TERCEIRA CATEGORIA DE DUPLICATA — placeholder `000.000.NNN A` (sistêmica, D2-D6) — encontrada em 2026-07-27

**Origem confirmada:** durante a reconciliação de CADA mês (D2 em 07-14, D3 em 07-22/23, D4 em 07-24, D5 e D6 em 07-27), quando a seção "Assistência" da planilha trazia uma linha sem NF confiável para casar 1:1 com o sistema, os scripts de reconciliação criaram uma nota fiscal nova com número placeholder sequencial `000.000.NNNN A` (zero-padded), em vez de vincular à nota que já existia. Os horários de criação em lote batem quase exatamente com a data de "concluído" de cada item D2-D6 na tabela abaixo — confirmando que a origem foi a própria reconciliação, não um processo externo nem a planilha CMPORT TEC (essa planilha foi investigada e **não é a causa** — ver seção abaixo).

**Por que não foi pego antes:** a validação de cada mês (D2-D6) comparou apenas **total do sistema × total da planilha**, e como o placeholder também tinha o valor certo, o total batia — mascarando que, a partir de quando o cliente passou a lançar Assistência direto no sistema (por volta de março/abril, via Auvo/Corpo de Nota nativo `NNN-2`), o placeholder virou uma **segunda cobrança da mesma coisa**, não uma cobrança nova.

**Escopo medido (2026-07-27, sistema inteiro):**
- **168 notas** com padrão `000.000.NNN A` no total (faixa `0004` a `136`, batch a batch).
- **65 dessas 168** têm duplicata exata confirmada (mesmo condomínio + mesmo valor + mesma `data_pagamento`) contra uma nota "normal" já existente (`NNN-2` nativo do Corpo de Nota, ou nota plana tipo `7773`/`7710`) — **R$ 61.313,31 contados em dobro**, entre março e julho.
- As notas mais antigas (`0004`-`0020`, lote de 05-28, dados de Jan/Fev) **não têm duplicata** — nesse período o cliente ainda não lançava Assistência direto no sistema, então o placeholder é o único registro e está correto.
- Zona de transição (`010`-`061`, lotes de 07-14 e 07-22, dados Fev-Abril): mistura de casos com e sem duplicata — precisa checagem individual antes de mexer.
- A partir de `062`-`079` em diante (lotes 07-24 e 07-27): quase 100% duplicado.

**Padrão do sistema (confirmado pelo usuário): o número real de referência é sempre só o número puro** (ex. `91`, `100`, `7773`), não o placeholder `000.000.NNN A`. A normalização a aplicar em qualquer comparação futura contra a planilha é: extrair o número puro, ignorando prefixo `000.000.`, zeros à esquerda, sufixo `-N` de parcela e sufixo ` A`/`/NNNN A`.

**✅ Limpeza aplicada em 2026-07-27 (local e produção, IDs idênticos).** Critério usado: só removidas as notas placeholder onde **100% dos boletos** (não só um) bateram exato (condomínio + valor + `data_pagamento`) contra uma nota nativa — nenhum caso parcial foi tocado. Resultado: **54 notas, 60 boletos, 60 serviços removidos, R$ 55.568,31** corrigidos (auditoria completa em `registros_exclusoes`, motivo registrado em cada item). Mantida em todos os casos a nota **nativa** (lançada pelo cliente/Auvo, padrão `NNN-2` ou número plano) — removida só a duplicata que a reconciliação inseriu.

**Ainda restam ~108 boletos / ~78 notas** no padrão `000.000.NNN A` no sistema (zona de transição `010`-`061` de fev-abr, mais alguns casos sem par claro tipo `099`, `101`, `105`, `114`, `119`-`121`, `125`, e os parciais `064`/`067`/`068`/`126`/`131`) — deixados de fora por não terem match 100% ou por serem do período (jan/fev) em que o cliente ainda não lançava nada nativamente, quando o placeholder é o único registro correto. Revisão caso a caso fica pendente.

**Ação futura:** corrigir o processo de reconciliação (a partir de Agosto) para checar existência de nota nativa (mesmo condomínio+valor+data) antes de criar qualquer placeholder — a validação por total batido não é suficiente para pegar esse tipo de duplicata.

**Correção de entendimento (2026-07-27, validação de Março):** o padrão `000.000.NNN A` **não foi inventado por script** — é a própria planilha principal que usa esse texto como número provisório na coluna NF (antes da prefeitura emitir o NF oficial), ex. linha 764 da aba "Entradas e SAIDAS - 2026": `Cullinan | NF: 000.000.043 A | R$366,25 | 23/03`. O bug real é a reconciliação ter criado uma nota nova com esse texto quando o serviço já existia nativamente via Corpo de Nota (`NNN-2`), em vez de reconhecer que era a mesma coisa.

**Nova duplicata confirmada e corrigida em Março (mesmo padrão, sufixo diferente):** `7641` (real, id 366, BOLETO_INTER pago 25/03 R$421,75, OS Auvo 69865939) × `7641 M` (id 1066, TRANSFERENCIA, mesmo valor/data, sem OS) — conferido contra a planilha (linha 723: `Cullinan | NF: 7641 M | R$421,75 | 25/03`), confirmado duplicata real. Removida em local e produção (mesmo padrão de auditoria).

**Caso parecido NÃO removido — `7654`/`7654 A` (Le Monde):** a planilha (linha 747) só tem UMA linha (`NF: 7654 A | R$590,45 | 24/03`). No sistema, a nota real `7654` tem 2 parcelas (1ª EXPIRADO no Inter, nunca paga por lá; 2ª paga R$590,45 em 24/03) e a duplicata `7654 A` tem **2 boletos** via TRANSFERENCIA (24/03 e **28/04** — esse segundo não bate com a planilha, origem não identificada ainda). Removê-la inteira arriscaria apagar um pagamento real da 1ª parcela paga por fora do Inter. Já estava na lista dos "8 pares parciais" pendentes — mantido pendente.

**Mais 2 duplicatas confirmadas e corrigidas em Março:** `7640`/`7640 M` (Araucarias, R$674,80, real BOLETO_INTER pago 25/03 com OS Auvo 69555949 × duplicata TRANSFERENCIA 26/03 sem OS) e `7642`/`7642 M` (Edifício Olga, R$612,96, real BOLETO_INTER pago 25/03 com OS Auvo 70168357 × duplicata TRANSFERENCIA 26/03 sem OS) — ambas conferidas contra a linha exata da planilha antes de remover. Removidas em local e produção.

**✅ Março validado e fechado em 100% (2026-07-27):** planilha principal (R$83.275,82) + planilha TEC (R$0, sem seção de março) = **R$83.275,82**. Sistema pós-limpeza = **R$83.275,82** (bate exato). Método de validação (soma das duas planilhas vs sistema) confirmado como correto e reutilizável para os próximos meses.

**✅ Abril validado e fechado em 100% (2026-07-27):** planilha principal (Manutenção R$23.556,07 + Assistência R$58.634,87 = R$82.190,94) + planilha TEC (Assistência R$3.471,25, sem Manutenção em abril) = **R$85.662,19** = sistema pós-correção. Resumo do que foi feito:

1. **29 pares de duplicata** confirmados (padrão `NNN`/`NNN M`, real `BOLETO_INTER` com OS Auvo × duplicata `TRANSFERENCIA` sem OS), conferidos linha a linha contra a planilha. Removidos: **R$ 14.086,20**.
2. **Descoberta importante ao investigar os 5 pares "pendentes" restantes:** comparação linha a linha (planilha × sistema, por valor+data) revelou que 4 desses pares não eram duplicata pura — a nota real declarava `total_parcelas=2` mas só tinha 1 boleto no sistema, e a nota "duplicada" continha o pagamento real da parcela que faltava (boleto de Março) + um boleto que de fato duplicava a parcela já existente (boleto de Abril). Mesmo padrão do `7654` (ver abaixo). Corrigido para `64-2`, `67-2`, `68-2`, `7645`: o boleto de Março foi movido para a nota real como parcela 2, o boleto de Abril duplicado foi removido, a nota falsa foi apagada.
3. Os outros 2 pares (`7669 M`, `7697 M`) eram duplicata limpa mesmo (a nota real teve 1ª tentativa `CANCELADO` no Inter seguida de retry `PAGO`, sem parcelamento) — removidos.
4. **`7654 A` (achado em Março) precisou de correção retroativa:** a exclusão completa que havíamos feito removeu também o boleto de 28/04, que na verdade era o pagamento real da parcela 1 (`EXPIRADO` no Inter, nunca paga por lá, paga depois por transferência). Corrigido: o boleto `EXPIRADO` da nota real `7654` foi atualizado para `PAGO`, 28/04, `TRANSFERENCIA`, com a mesma auditoria.
5. **7 lançamentos da planilha CMPORT TEC de Abril (R$3.471,25) não existiam no sistema em lugar nenhum** (CNPJ TEC não tem API do Inter — nada sincroniza sozinho pra ele). Inseridos como nota+boleto+serviço (P&L Assessoria, Lorenzetti, Ricardo, Zeuno Simões/Tapajos, Helena Maria, São Bento x2), `forma_pagamento=TRANSFERENCIA`, `PAGO`, 28/04, mesmo padrão de numeração da própria planilha TEC (`TEC 0000.00000000NNN`).

**Lição de processo (aplicar em Maio em diante):** antes de concluir que uma nota "duplicada" é erro puro, checar se a nota real declara mais parcelas do que boletos existentes — se sim, a duplicata pode estar segurando um pagamento real de parcela perdida, não só lixo de reconciliação.

**`7654 A` resolvida:** os timestamps de criação confirmaram que a nota duplicada inteira foi inserida por nós, em 2 lotes de reconciliação diferentes (boleto 24/03 no lote de Março/22-07, boleto 28/04 no lote de Abril/24-07) — não era pagamento real por fora do Inter como se suspeitou. Removida por completo (local pelo usuário, produção via script auditado). Nota real `7654` mantida intacta, continua com a 1ª parcela `EXPIRADO` no Inter (não investigado se foi paga por outro meio — passível de checagem futura, mas não é mais um bug de duplicidade).

---

## ✅ Investigado em 2026-07-27 — planilha `FLUXO FINANCEIRO CMPORT TEC - 2026.xlsx` (segundo CNPJ)

O usuário adicionou uma segunda planilha (CNPJ "CMPORT TEC") suspeitando que explicasse a diferença do Corpo de Nota em Maio. Confirmado que **não é a causa**: essa planilha usa numeração própria (`TEC 0000.00000000NNN`, `TEC 000.000.NNN`), cobre Abril-Junho, e registra serviços de Assistência (taxas de visita técnica, câmeras, etc.) de uma divisão/CNPJ separado. A real explicação da diferença é a categoria acima (`000.000.NNN A` gerado pela própria reconciliação D2-D6).

---

## ✅ Limpeza de boletos duplicados (D3-D5) — 2026-07-27

**Causa raiz:** ao reconciliar Março-Maio via planilha, quando a NF de Manutenção já existia no sistema como nota fiscal real (importada via XML, com boleto `BOLETO_INTER` já cobrado e pago), meus scripts de reconciliação criaram um **boleto duplicado** (`forma_pagamento=TRANSFERENCIA`) e um **serviço duplicado**, só para registrar a data de pagamento vinda da planilha — sem perceber que a nota já tinha um boleto real.

**Ação tomada:**
1. Consultada a API real do Banco Inter (`InterClient.consultar_boleto`) para 124 boletos, usando o `codigo_solicitacao` de cada um — confirmado que o campo certo é `dataSituacao` (ver dívida técnica acima)
2. Para 61 pares confirmados (`situacao_inter_real == 'RECEBIDO'` e exatamente 1 boleto duplicado por nota): preenchida `data_pagamento` + `valor_total_recebido` no boleto real com o dado confirmado pela API, depois removido o boleto e o serviço duplicados via `registrar_exclusao()` (auditoria) antes do delete
3. Aplicado em local e produção, com os mesmos IDs em ambos (122 registros de auditoria em `registros_exclusoes` em cada banco)
4. 4 casos deixados de fora (ver dívida técnica acima) por exigirem confirmação humana

---

## ✅ Backfill retroativo de `data_pagamento` (todos os boletos, não só a reconciliação) — 2026-07-27

**Motivo:** o bug do `dataSituacao` (corrigido acima) só previne o problema **daqui pra frente** — não corrige boletos que já ficaram PAGO sem data antes do fix. Ao validar o total de "cobranças pagas de Junho" no frontend (R$14.733,13 / 24 cobranças, visivelmente baixo), foi confirmado que o problema era muito mais amplo que só Junho ou só a reconciliação.

**Escopo real:** 217 boletos no sistema inteiro (Abril a Julho) com `situacao=PAGO` e `data_pagamento=NULL`, incluindo notas de Assistência que nunca passaram pela reconciliação da planilha.

**Ação:** consultada a API real do Inter para os 217 (via `codigo_solicitacao`), preenchido `data_pagamento` + `valor_total_recebido` com o dado confirmado — sem apagar nada (não havia duplicidade aqui, só o campo faltando). 217 de 217 atualizados, 0 divergências, 0 erros, em local e produção.

**Resultado validado:** "cobranças pagas de Junho" no frontend foi de R$14.733,13 (24) para **R$52.780,76 (90)** — 87 boletos (R$52.120,76) + 3 recibos (R$660,00).

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
