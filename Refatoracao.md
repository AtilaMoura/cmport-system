# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## ⏸ PAUSADO em 2026-07-30 — retomar por aqui

Sessão longa, muita coisa concluída. Resumo executivo de onde as coisas estão **agora**:

- **Código:** tudo commitado local. `origin/master` está em `b2970ef` (deployado em produção e confirmado funcionando). Há **1 commit local não pushado ainda**: `8be0113` (fix pequeno, sem risco — ver abaixo). Nada mais pendente de código.
- **Banco local:** tem TODAS as correções de dado aplicadas (recibos duplicados + serviços duplicados de nota fiscal).
- **Banco de produção:** tem só a correção de **recibos** (Edgar/Juliana/Cristina) aplicada. A correção dos **81 serviços duplicados de nota fiscal** está **só no local** — não subiu ainda, aguardando aprovação explícita (usuário pediu pra avisar quando for a hora).
- **Não fazer sem aprovação:** subir a correção dos 81 serviços pra produção. Usuário disse explicitamente que vai avisar quando for a hora, e quer validar mais algumas coisas antes.

### O que falta (nesta ordem sugerida)

1. **Push do commit `8be0113`** (fix do retrofit de recibo) — pequeno, testado, baixo risco, mas ainda não subiu. Confirmar com o usuário antes.
2. **Investigar as diferenças não explicadas** na validação Entrada (ver `Validacao_Entrada_Sistema_vs_Planilha.md`): Maio (+R$1.800), Junho (-R$2.618) e Julho (+R$5.750) da CMPORT Principal — precisam de mais uma rodada de investigação linha a linha (provavelmente mais casos de duplicata ou contaminação de CNPJ, no estilo do que já foi achado).
3. **Aplicar em produção** (só depois de aprovação explícita, e só depois de checar de novo se produção não recebeu nada novo do cliente nesse meio-tempo — mesmo protocolo de sempre):
   - Os 81 serviços duplicados de nota fiscal (`Analise_Servicos_Duplicados_Nota_Fiscal.md`)
   - O commit `8be0113`
4. **Decisão em aberto de antes:** CNPJ obrigatório no formulário de novo recibo — usuário ainda não decidiu, ficou como estava (opcional).
5. **TEC com boletos em aberto** (68 de 77) — usuário confirmou que é situação conhecida/esperada, não precisa de ação por enquanto.

---

## Tudo que foi feito nesta sessão (cronológico, resumido)

### 1. Recibo: parcelas + gerar_servico editável + despesa por parcela paga
Feature completa: parcelamento (`numero_parcela`/`total_parcelas`/`recibo_pai_id`), checkbox "gerar serviço" editável pra ENTRADA, categoria obrigatória + despesa por parcela paga pra SAÍDA, endpoint `GET /recibos/{id}/parcelas`, cascade delete (excluir recibo remove o serviço vinculado), cards "Recibo Vinculado"/"Cobranças por Parcela" no detalhe do serviço. Commit `247d11a`.

### 2. Recibo: valor de cada parcela editável (com validação de soma)
`valores_parcelas` opcional em `ReciboCreate`, validado (quantidade, valores > 0, soma com tolerância 0,01). Frontend com inputs editáveis por parcela, soma ao vivo, botão "Dividir igualmente". 3 testes novos. Testado no navegador via Playwright. Commit `5bd3baa`.

### 3. Análise e correção de recibos duplicados (Edgar, Juliana, Cristina)
Cruzando a planilha (coluna PARCELA) com os 39 recibos do sistema, confirmado: **Edgar** (4 recibos separados deveriam ser 1 recibo de 4 parcelas, incluindo uma parcela de R$1.750 — entrada maior — que nunca tinha sido lançada no sistema), **Juliana Via Del Corso** (2 recibos → 1 de 2 parcelas), **Cristina Maria Coelho** (duplicata simples, nome digitado errado). **Eraseg** investigado e descartado (falso positivo — 8 lançamentos reais e distintos). Corrigido em ambos os bancos (local e produção) — ver `Analise_Recibos_Parcelas_Duplicadas.md`.

### 4. Incidente de deploy (resolvido)
Ao tentar aplicar a correção do Edgar em produção, descobri que produção ainda rodava código antigo (nada tinha sido deployado apesar do `git push` anterior). Causa: o build do frontend quebrou no GitHub Actions (`useSearchParams()` sem `Suspense` nas 5 páginas de `/fluxo-financeiro` — Next.js exige isso pra pré-renderização estática). Corrigido (commit `b2970ef`), mas o workflow só builda/deploya o que mudou *naquele push* — como o primeiro push (com as mudanças de backend) tinha falhado no frontend antes de chegar no deploy, o backend ficou pra trás mesmo já tendo imagem nova pronta no Docker Hub. Resolvido puxando a imagem manualmente via SSH e reiniciando o container. **Produção e local sincronizados e com o mesmo código desde então.**

### 5. Verificação de dados novos em produção
Confirmado múltiplas vezes (contagens de tabelas + timestamps `criado_em`/`atualizado_em`/`data_pagamento`) que produção não recebeu nenhum dado novo do cliente durante toda a sessão — sempre idêntica ao local antes de qualquer correção ser aplicada lá.

### 6. Análise e correção de serviços duplicados por Nota Fiscal parcelada
Achado o mesmo tipo de bug do Edgar, só que do lado Nota Fiscal/Boleto: **46 notas fiscais com 81 serviços duplicados** (um serviço por mês/boleto pago, quando deveria ser 1 serviço por nota). Confirmado com certeza que não é nada inserido pelo cliente — os 127 registros envolvidos têm `criado_em` concentrado em só 6 dias (todos de scripts de importação/reconciliação, não de uso real do sistema). Corrigido **só no banco local** (81 exclusões via soft delete) — ver `Analise_Servicos_Duplicados_Nota_Fiscal.md`. **Não aplicado em produção ainda.**

### 7. Auditoria de código: confirmação de que o bug não se repete no fluxo normal
Fluxo Explore/auditoria confirmou: nem a criação de Nota Fiscal parcelada, nem marcar boleto como pago, nem `Recibo.marcar_pago()` criam serviço duplicado no código atual — o bug histórico era só do script de importação, não do sistema em uso normal. Achado 1 vetor de risco teórico (retrofit de serviço em `ReciboService.atualizar()` não checava se o recibo era parcela filha) — **corrigido e commitado** (`8be0113`, ainda não pushado).

### 8. Validação: Entrada do sistema x planilha
Comparado o total "Entrada de Serviços" (Manutenção+Assistência+Recibos) do sistema contra as planilhas, por empresa e combinado — ver `Validacao_Entrada_Sistema_vs_Planilha.md`. Confirmado que a limpeza dos 81 serviços não afeta esses totais. Jan e Mar batem exatamente com as correções feitas (Edgar +R$1.750, Cristina -R$70). Abril bate exato quando as duas empresas (Principal + TEC) são somadas juntas — mesmo cada uma isolada tendo uma diferença de R$280 que se cancela — sinal de contaminação cruzada de CNPJ entre as duas empresas. Mai/Jun/Jul da Principal ainda têm diferenças não explicadas (ver seção "o que falta" acima). TEC com boletos em aberto confirmado como esperado pelo usuário.

---

## Arquivos de análise gerados nesta sessão (todos na raiz do repo)

- `Analise_Recibos_Parcelas_Duplicadas.md` — recibos (resolvido, local + produção)
- `Analise_Servicos_Duplicados_Nota_Fiscal.md` — nota fiscal (resolvido só local)
- `Mapeamento_Planilhas_Fluxo_Financeiro.md` — mapa completo das duas planilhas
- `Validacao_Entrada_Sistema_vs_Planilha.md` — comparação de totais mais recente

*(Tarefas ainda mais antigas: ver histórico em `PLANO_IMPLEMENTACAO.md` e `PENDENCIAS.md`.)*
