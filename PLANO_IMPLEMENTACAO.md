# Plano de Implementação — CMPort

**Última atualização:** 2026-07-27
**Status:** Fases 0–12.4 + Corpo de Nota + N1 + N3 (backend+frontend) + F1.1 + F1.2 + C1 + CI/CD + D2 + D3 + D4 + D5 + D6 concluídos. Janeiro/2026 importado (109 registros). Fevereiro/2026 importado e reconciliado (116 registros, R$ 63.750,41, 100%). Março/2026 importado e reconciliado (101 notas + 8 recibos, R$ 83.275,82, 100%). Abril/2026 importado e reconciliado (106 notas + 6 recibos, R$ 82.190,94, 100%). Maio/2026 importado e reconciliado (88 notas + 5 recibos, R$ 66.496,12, 100%). **Descoberta em D6:** a partir de Junho/2026 o sistema passou a gerar as notas de Manutenção mensal automaticamente (contratos recorrentes) — Junho e Julho tiveram só as Assistências avulsas + recibos ausentes inseridos (34 notas + 6 recibos, R$ 35.696,81). Módulos novos fora do plano original, já concluídos: Recibos, Clientes, Declarações Fiscais. Pendentes: D1 + N2 + F1.3 + F1.4.

Convenções: `[x]` concluído · `[ ]` a fazer.

---

## Protocolo de Execução de Tarefas

> **Como funciona o fluxo de trabalho para cada tarefa deste plano:**

1. **Selecionar tarefa** — escolher a próxima tarefa do índice abaixo (N1, N2, N3, F1.x)
2. **Detalhar no Refatoracao.md** — antes de qualquer implementação, escrever o plano técnico completo da tarefa em `Refatoracao.md` (substitui o conteúdo anterior), com:
   - Objetivo e escopo
   - Análise dos arquivos existentes que serão lidos/modificados
   - Passo a passo por fase (A, B, C...) com arquivos a criar e modificar
   - Regras de negócio e validações
   - Checklist final
   - Testes esperados
3. **Outra IA implementa** — a implementação é executada por outro agente com base no `Refatoracao.md`
4. **Validação** — revisar o que foi implementado, testar os pontos do checklist, verificar TypeScript e deploy
5. **Marcar como concluído** — atualizar o status no índice deste arquivo (`PLANO_IMPLEMENTACAO.md`) e registrar o commit no `Refatoracao.md`

> `Refatoracao.md` é sempre **a tarefa ativa no momento** — um arquivo por vez, substituído a cada nova tarefa iniciada.

---

## Índice Geral

### ✅ Concluído

| # | Módulo | Descrição |
|---|--------|-----------|
| 0–9 | Base | Auth JWT, condomínios, serviços, notas fiscais, boletos, dashboard, Auvo, configurações |
| 10A | Sync Produtos Auvo | Sincronização de catálogo de produtos |
| 10B | Sync Orçamentos Auvo | Sync + candidatos + filtros |
| 10C | Termo de Garantia | PDF via LibreOffice, template Word |
| 10D | Email — sem XML | Remoção de XML como anexo no envio |
| 10F | Correções pós-10D | Bugs e ajustes pós-deploy |
| 10G | Termo via WeasyPrint | HTML → PDF, substituiu LibreOffice |
| 11 | Storage PDF NF | MinIO, upload, ZIP, email com PDF — sub-fases 11.1–11.6 |
| 12.1 | CC Global email | Configuração de emails em cópia global |
| 12.2 | CC por envio | CC por envio + merge com CC global |
| 12.3 | Envio em lote | Todos os boletos de um serviço em 1 email |
| 12.4 | PDF Orçamento | WeasyPrint para orçamentos, anexo no email |
| R | **Corpo da Nota de Serviço** | Ciclos, corpos, contratos, wizard 5 passos — commits `1167252`, `6754c46`, `1da01ed` |
| N1 | Corpo da Nota de Produto | `corpo_nota_model.py` já tem `tipo_nota` + `TipoNotaCorpo` cobrindo produto e serviço |
| N3 | **Boleto Manual — Backend + Frontend** | Endpoints `/boletos/manual`, `/registrar-pagamento`, `/enviar-email` + tela completa (formulário, upload PDF, envio de email com anexo, marcar pago, badges de status por `situacao`) |
| F1.1 | Financeiro — Backend CRUD | Models `fin_*` + seeds + schemas + repos + services + routers — tudo implementado |
| F1.2 | Financeiro — Inter Extrato | `sincronizar_inter` + `buscar_extrato` + endpoint `/financeiro/sincronizar-inter` implementados |
| **CI/CD** | Deploy: GitHub Actions + Docker Hub | Build condicional (só backend ou frontend conforme mudança) → push Docker Hub → VPS `docker pull` via `.github/workflows/deploy.yml`. `git push vps master` mantido como fallback |
| **C1** | **Corpo da Nota — Melhorias** | Fase 1 (tabs ORÇAMENTO/MANUAL visíveis em PRODUTO), Fase 2 (auto-vínculo XML PRODUTO standalone via CNPJ + criação automática de serviço) e Fase 3 (`GET /corpo-notas/{id}/pre-gerar-termo` + botão "Gerar Termo" em `/corpos-nota/[id]` e `/servicos/[id]`) — todas confirmadas no código |
| — | **Vínculo Automático CorpoNota ↔ Nota Fiscal ↔ Serviço** | Executado à parte do `Refatoracao.md` (ver `Plano_CorpoNota_Vinculo_Automatico.md`): `servico.corpo_nota_id`, `GET /corpo-notas/por-servico/{id}`, ressincronização de `servico_id` quando OS/nota mudam, matching por CNPJ, navegação bidirecional serviço↔corpo, card de serviço vinculado no detalhe da nota |
| — | **Módulo de Recibos** *(novo, fora do plano original)* | Backend completo (`recibo_model/service/repository/router/schema`) + frontend (`/recibos`, `/recibos/novo`) — tipo ENTRADA/SAIDA, vínculo com cliente/condomínio/serviço, geração automática de serviço ASSISTENCIA, cliente externo Auvo |
| — | **Módulo de Clientes** *(novo, fora do plano original)* | Página dedicada `/clientes` com vínculo opcional a condomínio (`condominio_id` nullable) |
| — | **Declarações Fiscais** *(novo, fora do plano original)* | INSS + Simples Nacional — model, repository, service, router, templates HTML, fluxo Gerar/Visualizar/Baixar/Regerar/Remover |
| D2 | **Dados — Fevereiro 2026** | Banco sincronizado com produção + 114 notas + 2 recibos aplicados, R$ 63.750,41 (100% da planilha). Resíduo: recibo Eraseg sem `condominio_id` (mesma pendência do D1) |
| D3 | **Dados — Março 2026** | Banco sincronizado com produção + 101 notas + 8 recibos aplicados, R$ 83.275,82 (100% da planilha, sem resíduo — JRI identificado como CONDOMINIO EDIFICIO J.R I, id 620, em 2026-07-23) |
| D4 | **Dados — Abril 2026** | Banco sincronizado com produção + 106 notas + 6 recibos aplicados, R$ 82.190,94 (100% da planilha, sem resíduo). Ricardo (id 647), Shift (id 592), Green Park (id 617) e Piazza Fontana R$14.150 (valor confirmado) resolvidos em 2026-07-24 |
| D5 | **Dados — Maio 2026** | Banco sincronizado com produção + 88 notas + 5 recibos aplicados, R$ 66.496,12 (100% da planilha, sem resíduo — zero pendências neste mês) |
| D6 | **Dados — Junho e Julho 2026 (parcial, análise de sobreposição)** | Descoberta: sistema já gera notas de Manutenção mensal automaticamente desde Junho (99 notas já existentes, valor bruto). Inseridas só as 34 notas de Assistência avulsa + 6 recibos genuinamente ausentes (R$ 35.696,81). Ver seção "Junho e Julho 2026" em `RELATORIO_NF_2026.md` |

### 🚧 A Implementar

| # | Módulo | Descrição |
|---|--------|-----------|
| D1 | **Dados — Pendentes Janeiro 2026** | 7 recibos sem condomínio mapeado — ainda aguardando identificação (confirmado em `fluxo-financeiro/pendentes_janeiro.txt`, arquivos movidos para a pasta `fluxo-financeiro/`) |
| N2 | Leitura Nota de Entrada + Gerar Serviço | Import NF-e de entrada → auto-criar serviço — nenhum endpoint `importar-entrada` nem campo `nota_entrada_id` encontrados no backend |
| F1.3 | Financeiro — Frontend | Não existe módulo `/financeiro` dedicado. Em vez disso, indicadores financeiros (cards PAGO/PENDENTE, gráficos, `resumo-financeiro`) foram embutidos direto em `/servicos/[id]` — decidir se isso substitui o escopo original ou se o módulo dedicado (sidebar 4 grupos, dashboard, categorização, sync Inter) ainda será construído |
| F1.4 | Financeiro — QA + Entrega | Depende da decisão acima sobre F1.3 |

### ⏸ Fora do Escopo Atual

| # | Descrição |
|---|-----------|
| 10E | Geração de nota fiscal a partir de orçamento Auvo |

---

## ✅ C1 — Corpo da Nota: Melhorias (Prioridade Alta)

**Concluído.** Confirmado direto no código (2026-07-14):

### Fase 1 — Fix: Orçamentos no Wizard PRODUTO
- [x] `cmport-front/app/corpos-nota/novo/page.tsx`: condições migradas de `tipoNota === 'SERVICO'` para `tipoNota !== 'MANUTENCAO'` (linhas 1039, 1093 e outras)
- [x] Wizard PRODUTO → tabs de Orçamento/OS visíveis e funcionais

### Fase 2 — Fix: Vínculo Automático Nota PRODUTO Standalone
- [x] `corpo_nota_repository.py` e `corpo_nota_service.py`: métodos de candidatos standalone (`list_candidatos_produto_standalone_por_numero_nf`, `_tentar_vincular_nota_produto_standalone`) implementados
- [x] XML nota PRODUTO importado vincula automaticamente ao corpo PRODUTO correto
- [x] Criação automática de serviço mesmo sem OS/orçamento (commit `d240e09`)

### Fase 3 — Termo de Garantia via Corpo da Nota
- [x] `corpo_nota_router.py`: `GET /{corpo_id}/pre-gerar-termo` implementado (linha 585)
- [x] Botão/fluxo "Gerar Termo" presente em `cmport-front/app/corpos-nota/[id]/page.tsx` e `cmport-front/app/servicos/[id]/page.tsx`

### Trabalho adicional (fora do `Refatoracao.md` original)
Executado via `Plano_CorpoNota_Vinculo_Automatico.md`, ampliando o vínculo bidirecional:
- [x] Campo `corpo_nota_id` em `ManutencaoAssistencia` + endpoint `GET /corpo-notas/por-servico/{servico_id}`
- [x] Ressincronização de `servico_id` do corpo quando OS/nota fiscal mudam (commit `d48a042`)
- [x] Matching de nota fiscal por CNPJ em vez de `tipo_nota` (commit `42d0e3f`)
- [x] Navegação bidirecional servico↔corpo + card de serviço vinculado no detalhe da nota (commits `6455ae0`, `0d2ec89`)

**Pendente de confirmação manual:** rodar `npx tsc --noEmit` e smoke test em produção não foram verificados nesta análise — recomenda-se conferir antes de dar como 100% fechado.

---

## D1 — Dados: Pendentes Janeiro 2026

### Contexto
Janeiro/2026 foi importado com sucesso: **109 registros** (notas fiscais + serviços + boletos PAGO, total R$70.400,79).
Ficaram 7 linhas sem mapeamento porque o nome na planilha é apenas o nome do morador, não o condomínio.
Confirmado ainda pendente em 2026-07-14 via `fluxo-financeiro/pendentes_janeiro.txt`.
Arquivos de referência (movidos para a pasta `fluxo-financeiro/`): `PENDENTES_JANEIRO_2026.xlsx`, `gerar_sql_janeiro.py`, `pendentes_janeiro.txt`.

### Pendentes — aguardando identificação do condomínio

| Linha planilha | Nome (planilha) | Data pagto | Valor | Condomínio no sistema |
|---|---|---|---|---|
| 115 | Eraseg | 16/01/2026 | R$ 750,00 | ❓ a identificar |
| 116 | Eraseg | 23/01/2026 | R$ 1.050,00 | ❓ a identificar |
| 117 | Durval | 19/01/2026 | R$ 350,00 | ❓ a identificar |
| 118 | Adelson | 23/01/2026 | R$ 140,00 | ❓ a identificar |
| 119 | Ludmila | 23/01/2026 | R$ 70,00 | ❓ a identificar |
| 121 | Luis | 27/01/2026 | R$ 70,00 | ❓ a identificar |
| 123 | Chistopher | 28/01/2026 | R$ 100,00 | ❓ a identificar |

**Total pendente: R$ 2.530,00**

### Como inserir após identificação
1. Informar qual condomínio (nome ou ID) cada linha pertence
2. Atualizar `COND_IDS` no `gerar_sql_janeiro.py` com os novos mapeamentos (ex: `'Eraseg': 123`)
3. Remover os nomes de `PENDING_NAMES` no mesmo script
4. Rodar `python gerar_sql_janeiro.py` → gera novo SQL apenas para as linhas ainda pendentes
5. Copiar SQL para VPS e executar no banco

### Checklist
- [ ] Identificar condomínio das 7 linhas acima
- [ ] Atualizar `gerar_sql_janeiro.py` com novos mapeamentos
- [ ] Executar SQL no banco de produção
- [ ] Conferir total: deve adicionar R$ 2.530,00 ao total atual (R$ 70.400,79 → R$ 72.930,79)

---

## ✅ D2 — Dados: Fevereiro 2026

**Concluído em 2026-07-14.** Fluxo completo executado, documentado passo a passo em `Refatoracao.md` e `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Fevereiro 2026"). **Runbook reutilizável para Março em diante:** `fluxo-financeiro/PROCESSO_RECONCILIACAO_MENSAL.md`.

1. Banco local sincronizado com produção (dump + restore, contagens idênticas)
2. Seção Fevereiro extraída da planilha mestre arquivada (`_arquivo/docs/financeiro/FLUXO FINANCEIRO - 2026.xlsx`, linhas 348–471)
3. `gerar_sql_fevereiro.py` gerado a partir de `gerar_sql_janeiro.py`, com condomínios novos resolvidos por consulta direta ao banco (Helena Maria, Dakota, Estilo Higienópolis, Ninon + correções de grafia)
4. 114 notas fiscais (Manutenção + Assistência) aplicadas e validadas em local e produção — R$ 62.512,90 via 114 boletos
5. 2 recibos criados via `POST /recibos` (não SQL direto, para acionar geração automática de serviço): Eraseg (REC-2026-021, R$650,00) e Edgar (REC-2026-022, R$587,51, com serviço ASSISTENCIA auto-gerado)
6. NF 7576 A (linha "Marmoraria" na planilha) identificada pelo usuário como CONDOMINIO EDIFICIO COSTA BRAVA (id 394) — aplicada em local e produção

**Total: R$ 63.750,41 — 100% da planilha reconciliado.**

**Resíduo:** recibo Eraseg sem `condominio_id` (mesma pendência de identificação do D1 de Janeiro — ver `PENDENCIAS.md`).

---

## ✅ D3 — Dados: Março 2026

**Concluído em 2026-07-22.** Fluxo executado seguindo `fluxo-financeiro/PROCESSO_RECONCILIACAO_MENSAL.md`, documentado em `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Março 2026").

1. Banco local sincronizado com produção (dump + restore, contagens idênticas nas 5 tabelas-chave)
2. Seção Março extraída da planilha mestre atualizada na raiz do projeto (`FLUXO FINANCEIRO - 2026.xlsx`, linhas 675–791 — planilha da raiz confirmada com o usuário como a versão mais recente, substituindo a cópia arquivada)
3. `gerar_sql_marco.py` gerado a partir de `gerar_sql_fevereiro.py`, com 9 condomínios novos/typos resolvidos (6 automáticos por match exato no banco, 3 confirmados com o usuário: Rosa F Mauro entre 2 candidatos, Octavio Slaaviano/Saviano, Cristina Maria Coelho como 2 recibos reais e não duplicidade)
4. 100 notas fiscais (Manutenção + Assistência) aplicadas e validadas em local e produção — R$ 77.755,66 via 100 boletos
5. 8 recibos criados via `POST /recibos` (não SQL direto): Lucimar, Paloma, Eraseg, Edgar, Dulce, 2× Cristina Maria Coelho (Ap. 604), Octavio Slaaviano — R$ 1.622,51 total, todos com serviço ASSISTENCIA auto-gerado (mudança recente: `ReciboService` agora gera serviço para ENTRADA mesmo sem `condominio_id`)
6. Datas de vencimento inválidas na planilha (Eraseg e Edgar vieram com ano 2020 em vez de 2026) corrigidas usando a data de pagamento como fallback, mesmo padrão do caso `000.000.015 A` de Fevereiro

**Total: R$ 83.275,82 (R$ 81.653,31 notas + R$ 1.622,51 recibos) — 100% da planilha reconciliado.**

**Resíduo resolvido:** nota fiscal JRI (linha 753, NF 7651.071 A, R$ 3.897,65) foi identificada pelo usuário em 2026-07-23 como CONDOMINIO EDIFICIO J.R I (id 620) — inserida em local e produção via `insercao_jri_marco.sql`. Nenhuma pendência restante para Março.

---

## D4 — Dados: Abril 2026

**Concluído em 2026-07-24 (100% reconciliado, sem resíduo).** Fluxo executado seguindo `fluxo-financeiro/PROCESSO_RECONCILIACAO_MENSAL.md`, documentado em `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Abril 2026").

1. Banco local sincronizado com produção (validação rápida das 5 tabelas-chave, sem novo dump — já estava em sincronia após D3)
2. Seção Abril extraída da planilha (linhas 996–1117), limites confirmados por busca de título (batem com o mapa do runbook)
3. `gerar_sql_abril.py` gerado a partir de `gerar_sql_marco.py`, com 8 condomínios novos/typos resolvidos automaticamente (Chanceller/Chanceler, Greville, Rosa F. Mauro, San Marino, Imperial, Tilney, Helbor Foft Evolution, JRI reaproveitado de Março)
4. 103 notas fiscais (Manutenção + Assistência) aplicadas e validadas em local e produção — R$ 63.543,52 via 103 boletos
5. 5 recibos criados via `POST /recibos`: Darnelei (Helbor Controle), Tilney, Eraseg, Edgar, Greville e Flamboyant — R$ 1.991,24 total (REC-2026-031 a 035)
6. Duplicidade de número interno detectada (`000.000.096 A` usado para 2 condomínios diferentes, Cube Vila Ipojuca e Green Park) — resolvida renumerando a nota do Green Park para `000.000.096-B A`
7. **Ricardo** (linha 1070, NF 7721 A, R$ 236,18) resolvido em 2026-07-24: id 647 "CONDOMINIO EDIFICIO RICARDO" identificado por evidência no banco (ativo, com CNPJ, já usado em NFs de Abril) vs. id 531 inativo/sem CNPJ — inserido via `insercao_ricardo_abril.sql`
8. **Shift** (linhas 1073–1075, NF 7590.0058 A ×3, R$ 2.033,82) resolvido em 2026-07-24: usuário confirmou id 592 "SHIFT MOBILIDADE LTDA (SEGUNDO)" (CNPJ final 0154) sem evidência de uso prévio no banco — inserido via `insercao_shift_abril.sql` (1 nota fiscal, 3 boletos)
9. **Green Park** (linha 1109, NF `000.000.096-B A`, R$ 236,18) resolvido em 2026-07-24: usuário confirmou id 617 "CONDOMINIO EDIFICIO SÃO BENTO GREEN PARK" — inserido via `insercao_greenpark_abril.sql`
10. **Piazza Fontana** (linha 1115, recibo, R$ 14.150,00) resolvido em 2026-07-24: usuário confirmou o valor apesar de destoar dos demais recibos do mês — criado via `POST /recibos` (REC-2026-036, condomínio id 678, serviço ASSISTENCIA auto-gerado)

**Total: R$ 82.190,94 (R$ 66.049,70 notas + R$ 16.141,24 recibos) — 100% da planilha reconciliado, sem pendências.**

---

## ✅ D5 — Dados: Maio 2026

**Concluído em 2026-07-27 (100% reconciliado, sem resíduo, zero pendências).** Fluxo executado seguindo `fluxo-financeiro/PROCESSO_RECONCILIACAO_MENSAL.md`, documentado em `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Maio 2026").

1. Banco local sincronizado com produção (validação rápida das 5 tabelas-chave — já estava em sincronia após D4)
2. Seção Maio extraída da planilha (linhas 1326–1426), limites confirmados por busca de título (batem com o mapa do runbook)
3. `gerar_sql_maio.py` gerado a partir de `gerar_sql_abril.py`, com detecção automática de NF duplicada para condomínios diferentes (renumeração automática, lição aprendida do caso Green Park em Abril) — nenhuma ocorrência real neste mês
4. Único caso ambíguo do mês: "Helbor" sozinho (2 linhas) — banco tem 2 candidatos ("Duo Lifestyle by Helbor" id 606 e "Helbor Loft Evolution" id 679), usuário confirmou id 679 para ambas
5. 88 notas fiscais (Manutenção + Assistência) aplicadas e validadas em local e produção — R$ 63.258,61 via 88 boletos
6. 5 recibos criados via `POST /recibos`: Juliana Via Del Corso, Eraseg (×3), Edgar — R$ 3.237,51 total (REC-2026-037 a 041)

**Total: R$ 66.496,12 (R$ 63.258,61 notas + R$ 3.237,51 recibos) — 100% da planilha reconciliado, sem pendências.**

---

## ✅ D6 — Dados: Junho e Julho 2026 (mudança de fluxo — cliente passou a usar o sistema nativamente)

**Concluído em 2026-07-27.** Ao tentar aplicar Junho seguindo o runbook padrão, a conferência de valores não batia — investigação revelou que o cliente passou a criar as notas fiscais de Manutenção mensal diretamente no sistema (provavelmente via geração automática de `contratos_condominio`), com número de NF puro (sem sufixo " M") e valor **bruto** do contrato.

**Confirmação matemática:** `valor_banco × (1 − 15,65%) = valor_planilha`, onde 15,65% = PIS 0,65% + COFINS 3% + CSLL 1% + INSS 11% — a mesma fórmula de `boleto_service.py`. O sistema está calculando o líquido corretamente por conta própria.

1. Extraídas as seções de Junho (linhas 1593–1679) e Julho (linhas 1814–1882) da planilha
2. Todas as NFs do banco exportadas e comparadas programaticamente (normalizando sufixo " M"/" A") contra as da planilha
3. Resultado: **99 notas de Manutenção/Assistência (parcelas recorrentes) já existentes** — não tocadas, por decisão do usuário (sistema é a fonte de verdade agora)
4. **34 notas de Assistência avulsa genuinamente ausentes** aplicadas em local e produção — R$ 34.546,81 (21 em Junho, 13 em Julho)
5. **6 recibos** criados via `POST /recibos` — R$ 1.150,00 (REC-2026-042 a 047). Cuidado especial: recibos com padrão "Pessoa - Cond. X" (ex: "Ricardo - Cond. Helbor") tiveram `condominio_id` resolvido manualmente para não colidir com o alias "Ricardo" (id 647, condomínio diferente resolvido em Abril)
6. 2 condomínios novos resolvidos: Dona Rachel (id 130), Ibirapuera Diamond (id 878)

**Total aplicado: R$ 35.696,81 (R$ 34.546,81 notas + R$ 1.150,00 recibos).**

**Recomendação:** a partir de Agosto, o `PROCESSO_RECONCILIACAO_MENSAL.md` deve focar só em Assistências avulsas + recibos; a seção de Manutenção da planilha vira conferência, não mais fonte de inserção.

---

## ✅ N1 — Corpo da Nota de Produto (NF-e)

**Concluído.** O model `corpo_nota_model.py` já usa campo `tipo_nota` com enum `TipoNotaCorpo` que cobre tanto SERVIÇO quanto PRODUTO. Ciclos, wizard, router, service, schema e repository estão implementados (parte do módulo R — Corpo da Nota de Serviço).

---

## N2 — Leitura de Nota de Entrada + Geração de Serviço

### Objetivo
Importar XML de NF-e de entrada (compras de fornecedores) e auto-criar o serviço
correspondente para controle interno, eliminando lançamento manual duplicado.

### Definição de Escopo
- [ ] Mapear campos da NF-e de entrada → campos de `ManutencaoAssistencia`
- [ ] Decidir tipo de serviço criado (MANUTENCAO / ASSISTENCIA / OUTROS) e regra de default

### Backend
- [ ] Parser XML NF-e de entrada: fornecedor, CNPJ, itens, valor total, data emissão
- [ ] Endpoint `POST /notas-fiscais/importar-entrada` — aceita XML ou ZIP
- [ ] Service: extrair dados + criar `ManutencaoAssistencia` a partir da nota
- [ ] Campo FK nullable `nota_entrada_id` em `ManutencaoAssistencia` (aditivo, sem breaking change)
- [ ] Repository: listar serviços criados a partir de nota de entrada

### Frontend
- [ ] Tela de import: upload XML/ZIP + preview dos dados extraídos antes de confirmar
- [ ] Revisão dos campos mapeados com opção de editar antes de salvar
- [ ] Indicador no serviço: badge "Origem: Nota de Entrada" quando aplicável
- [ ] `npx tsc --noEmit` zerado

### Testes
- [ ] Importar XML válido → revisar preview → confirmar → serviço criado no banco
- [ ] Importar ZIP com múltiplos XMLs → cada um gera um serviço independente
- [ ] Importar XML inválido → erro claro no frontend, sem criar serviço
- [ ] Serviço criado aparece na listagem com badge de origem correto
- [ ] Campo `nota_entrada_id` preenchido no banco
- [ ] Importar mesmo XML duas vezes → comportamento definido (bloquear ou permitir)
- [ ] `npx tsc --noEmit` e `npm run lint` zerados
- [ ] Smoke test em produção após deploy

---

## ✅ N3 — Boleto Manual + Email + Controle

### Objetivo
Registrar manualmente boletos sem API Inter, com envio por email e controle de status.

### Backend — concluído
- [x] Endpoint `POST /boletos/manual` — criação manual (`CriarBoletoManualRequest`)
- [x] Endpoint `POST /boletos/{id}/enviar-email` — envio com PDF anexado, suporta CC e customização de corpo
- [x] Endpoint `POST /boletos/{id}/registrar-pagamento` — registrar pagamento com data
- [x] Upload de PDF: `POST /boletos/{id}/pdf` — armazenamento no MinIO
- [x] `pdf_object_key` no model para boletos sem API Inter
- [x] `forma_pagamento` enum cobre PIX, TRANSFERENCIA, CHEQUE, DINHEIRO, BOLETO_ITAU

### Frontend — concluído (confirmado em `cmport-front/app/boletos/page.tsx`)
- [x] Formulário de cadastro manual: valor, forma de pagamento (`manualForma`), condomínio
- [x] Upload de PDF do boleto (input `type="file"`)
- [x] Envio de email com anexo via `FormData` → `POST /boletos/{id}/enviar-email` (inclusive envio em lote por serviço)
- [x] Registrar pagamento (`POST /boletos/{id}/registrar-pagamento`) com modal e data
- [x] Badge de status colorido por `situacao` (EMABERTO/PAGO/CANCELADO/EXPIRADO/VENCIDO/BAIXADO)

**Pendente de confirmação manual:** `npx tsc --noEmit`, `npm run lint` e smoke test em produção não foram reexecutados nesta análise.

---

## ✅ F1.1 — Financeiro: Backend CRUD

**Concluído.** Toda a camada de backend está implementada:

| Camada | Arquivos |
|--------|----------|
| Models | `fin_categoria_model.py`, `fin_movimentacao_model.py`, `fin_saldo_inicial_model.py` |
| Schemas | `fin_categoria_schema.py`, `fin_movimentacao_schema.py`, `fin_saldo_inicial_schema.py` |
| Repositories | `fin_categoria_repository.py`, `fin_movimentacao_repository.py`, `fin_saldo_inicial_repository.py` |
| Service | `fin_movimentacao_service.py` |
| Routers | `fin_movimentacao_router.py` (`/api/v1/financeiro`), `fin_categoria_router.py` (`/api/v1/categorias-financeiras`) |

Tabelas: `fin_categorias` (enum RECEITA/FORNECEDOR/DESPESA) · `fin_movimentacoes` (origem BANCO/MANUAL, soft delete, `id_externo_banco`) · `fin_saldo_inicial` (UNIQUE ano+mes).

---

## ✅ F1.2 — Financeiro: Inter Extrato

**Concluído.** `fin_movimentacao_service.py` tem `sincronizar_inter(db, data_inicio, data_fim)` que chama `InterClient.buscar_extrato()`, cria movimentações com `origem=BANCO` e deduplica por `id_externo_banco`. Endpoint `POST /financeiro/sincronizar-inter` registrado no router.

---

## F1.3 — Financeiro: Frontend

> **⚠️ Divergência de escopo encontrada em 2026-07-14:** o diretório `cmport-front/app/financeiro/` **não existe**. Em vez do módulo dedicado abaixo, indicadores financeiros (cards PAGO/PENDENTE, gráficos, endpoint `resumo-financeiro`) foram embutidos diretamente em `/servicos/[id]` (commits `fdac079`, `e548919`, `db0ff69`). Antes de continuar, decidir com o cliente/Atila se: (a) essa solução embutida é suficiente e o módulo `/financeiro` dedicado sai do escopo, ou (b) o módulo completo abaixo ainda precisa ser construído à parte.

### Objetivo
Interface completa do módulo financeiro: Sidebar refatorada para grupos,
3 páginas e 6 componentes. Zero erros TypeScript.

### Sidebar (obrigatório antes das páginas)
- [ ] Refatorar `Sidebar.tsx`: array flat → 4 grupos (`MenuGroup[]`)
- [ ] Grupos: OPERACIONAL / FISCAL / FINANCEIRO / SISTEMA
- [ ] Manter todo CSS, animações e lógica de role — apenas estrutura de dados muda
- [ ] Testar navegação em todas as rotas existentes sem regressão

### Interfaces TypeScript
- [ ] `CategoriaFinanceira` — espelha `fin_categorias`
- [ ] `Movimentacao` — espelha `fin_movimentacoes`
- [ ] `DashboardFinanceiro` — resposta do endpoint dashboard
- [ ] `SaldoInicial` — espelha `fin_saldo_inicial`
- [ ] `FormMovimentacaoManual` — payload de criação manual

### Páginas
- [ ] `/financeiro` — Dashboard com cards, breakdown e saldo do período
- [ ] `/financeiro/movimentacoes` — Tabela com filtros, ações e nova movimentação
- [ ] `/financeiro/categorias` — Gestão por grupo com toggles ativo/inativo

### Componentes
- [ ] `DashboardFinanceiro.tsx` — 4 cards topo + breakdown receitas + saldo período
- [ ] `TabelaMovimentacoes.tsx` — colunas, badges por tipo/origem/status, filtros
- [ ] `FormMovimentacaoManual.tsx` — modal: tipo → grupo → categoria → valores
- [ ] `FormCategorizar.tsx` — select inline na tabela, sem modal, salva direto
- [ ] `BotaoSincronizarInter.tsx` — estados: idle / loading / sucesso / erro
- [ ] `SaldoInicialCard.tsx` — exibe valor, clique → input inline, Enter/blur → salva

### Qualidade
- [ ] `npx tsc --noEmit` zerado
- [ ] `npm run lint` sem erros

### Testes
- [ ] Sidebar: 4 grupos visíveis, navegação para todas as rotas existentes sem regressão
- [ ] Dashboard: carrega totais do mês atual, troca de mês/ano atualiza os cards
- [ ] Saldo inicial: editar inline → Enter → salva → valor atualiza sem reload
- [ ] Nova movimentação manual: tipo → grupo → categoria → preencher → salvar → aparece na tabela
- [ ] `FormCategorizar` inline: selecionar categoria → PUT chamado → coluna categoria atualiza
- [ ] `BotaoSincronizarInter`: clicar → loading → resultado "X novas, Y duplicadas" exibido
- [ ] Página categorias: criar nova, editar nome, toggle ativo/inativo
- [ ] Filtros na tabela: mês/ano, grupo (tabs), status funcionando em combinação
- [ ] Badge ENTRADA=verde, SAIDA=vermelho, BANCO=azul, MANUAL=cinza, PENDENTE=amarelo, VALIDADO=verde
- [ ] `npx tsc --noEmit` e `npm run lint` zerados

---

## F1.4 — Financeiro: QA + Entrega

### Objetivo
Validação ponta a ponta com o cliente e deploy em produção.

- [ ] Fluxo completo com cliente: sincronizar Inter → categorizar movimentações → validar → dashboard
- [ ] Verificar saldo acumulado encadeando janeiro até mês atual com dados reais
- [ ] Confirmar que nenhuma tabela existente foi alterada (`git diff` nas migrations/models)
- [ ] Deploy VPS: `git push vps master`
- [ ] Smoke test produção: dashboard carrega, movimentações listam, categorias OK
- [ ] Smoke test Inter em produção: sincronizar 1 dia de extrato → resultado correto
- [ ] Documentar para o cliente: como usar cada página e o fluxo recomendado

### Testes de Regressão
- [ ] Boletos existentes continuam funcionando normalmente
- [ ] Notas fiscais existentes continuam funcionando
- [ ] Corpo da Nota de Serviço sem regressão
- [ ] Sidebar: todas as rotas anteriores acessíveis nos novos grupos
