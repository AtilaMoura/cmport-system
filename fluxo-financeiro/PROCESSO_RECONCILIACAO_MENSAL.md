# Processo de Reconciliação Mensal — Planilha × Sistema

> Runbook criado em 2026-07-14 a partir da execução real de Janeiro e Fevereiro/2026.
> Atualizado em 2026-08-07 com as lições da sessão de 04-07/08 (reconciliação de Jan/Fev/Mar do zero, achou e corrigiu 3 bugs sistêmicos). Use este passo a passo para Abril em diante.
> Atualizado em 2026-08-12 com o script de validação rápida de todos os meses de uma vez (seção abaixo) — usar ele **primeiro**, antes de seguir os passos manuais 1-8, pra saber se o mês já bate ou não.
> Atualizado em 2026-08-12 (2ª vez) com o catálogo de scripts abaixo, `comparar_local_producao.py` (novo) e suporte a `--empresa tec` em `validar_fluxo_todos_meses.py`.

---

## 📋 Scripts disponíveis — confira antes de validar na mão

**Antes de escrever uma query ou script novo pra validação financeira, checar esta tabela primeiro** — é bem provável que já exista algo pronto. Todos os scripts abaixo ficam em `fluxo-financeiro/` e rodam com `cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/<script>.py` (setar `$env:PYTHONIOENCODING="utf-8"` antes, no PowerShell). Os que usam SSH pra produção precisam de `paramiko` instalado no venv (`pip install paramiko` se faltar).

| Script | O que faz | Quando usar |
|---|---|---|
| `comparar_local_producao.py` | `COUNT(*)` de todas as tabelas do schema, local × produção (via SSH, sem dump/restore) | Primeira coisa a rodar em qualquer sessão — confirma que o local não está dessincronizado antes de confiar em validações que leem do local |
| `validar_fluxo_todos_meses.py --empresa cmport\|tec` | Planilha mestre × `/financeiro/fluxo-mensal` (produção), todos os meses de uma vez, por CNPJ | Visão geral rápida de quais meses/categorias têm diferença, pros dois CNPJs (CMPORT e TEC) |
| `verificar_fechamento_mes.py --mes N --ano Y --ambiente local\|producao` | Fecha totais de Manutenção+Assistência de um mês específico | Conferir um mês depois de aplicar correções, sem SSH manual |
| `validar_mes_detalhado.py <mes> <ano>` | Nota a nota / recibo a recibo, planilha × banco local — só considera boleto já **pago** | Depois que `validar_fluxo_todos_meses.py` apontou diferença num mês — acha exatamente o que falta ou sobra, mas reporta como "faltando" qualquer coisa ainda `EMABERTO` |
| `identificar_pendencias_mes.py --mes N --ano Y --empresa cmport\|tec [--ambiente local\|producao]` | Igual ao anterior, mas também acha boletos `EMABERTO`/`VENCIDO`/`EXPIRADO` que já existem com nota+valor batendo — separa "só falta registrar pagamento" de "não existe, precisa criar do zero" | Mês corrente / recém-fechado, onde a maioria das notas já existe no sistema mas ainda não foi marcada como paga (ver Agosto/2026) |

---

## ⚡ Validação rápida — todos os meses de uma vez (comece por aqui)

Script: **`fluxo-financeiro/validar_fluxo_todos_meses.py`**

O que faz: lê a planilha mestre inteira (`docs-e-planilhas/FLUXO FINANCEIRO - 2026.xlsx`, aba "Entradas e SAIDAS - 2026") e compara com o endpoint `/financeiro/fluxo-mensal` em **produção**, mês a mês, pro CNPJ CMPORT — sem precisar mapear range de linha por mês na mão. Funciona porque a coluna A da planilha tem um padrão embutido `<Categoria><Mes><Ano>` (ex: `Contrato42026` = Contrato, mês 4, ano 2026; `Assistencia52026` = Assistência, mês 5) que identifica a seção de cada linha diretamente.

**Como rodar:**
```bash
cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/validar_fluxo_todos_meses.py --empresa cmport
cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/validar_fluxo_todos_meses.py --empresa tec
# no Windows/PowerShell, setar antes: $env:PYTHONIOENCODING="utf-8" (nomes com acento quebram o print sem isso)
```

Saída: tabela `mês × categoria (manutenção/assistência/recibos) × planilha × sistema × diferença`, mais um resumo só das linhas com diferença ≥ R$0,01. Não aplica nenhuma correção sozinho — só reporta, a decisão de corrigir é manual (mesmo padrão dos Passos 6-7 abaixo).

**Limitações conhecidas (12/08/2026):**
- Só cobre Manutenção + Assistência + Recibos (as 2 seções que viram nota fiscal/serviço — mesmo escopo do Passo 2 abaixo). **Não cobre** Entrada/Bancos, Despesas Escritório, Fornecedores ainda — dá pra fazer via tabela `fin_movimentacoes` (módulo Financeiro Fase 1, tem dado real Jan-Jul/2026), mas falta mapear como ela categoriza os lançamentos (`fin_categorias`) antes de comparar contra essas 3 seções da planilha.
- Suporta os dois CNPJs via `--empresa cmport|tec` (adicionado 12/08/2026). **Atenção ao ler a coluna `categoria` das duas planilhas:** ela vem com casing inconsistente (`'Assistencia'` maiúsculo marca a seção real de Assistência, `'assistencia'` minúsculo marca transferência interna na seção Entrada/Bancos — confirmado nas duas planilhas). O script compara com o texto **exato** (`"Contrato"`/`"Assistencia"`) de propósito — normalizar pra case-insensitive parece um fix óbvio mas na verdade infla o total incluindo transferências que não são receita (testado e revertido nesta sessão).
- Resultado do `--empresa tec` bate com o levantamento manual anterior (~R$75.553,55 faltando de Maio a Setembro, ver `PENDENCIAS.md`) — Jun/Jul/Ago batem exato, Abr/Mai já têm correções parciais aplicadas desde então.
- Falsos positivos esperados: pequenas diferenças entre "assistência" e "recibo" no mesmo mês costumam ser só bug de classificação do script (ex: planilha grafa `PIX` maiúsculo em vez de `Pix`), não erro real — sempre olhar o **total do mês**, não só a categoria isolada, antes de investigar.

---

## ⚠️ Leia isso primeiro — lições da sessão de 04-07/08/2026

Essas são as armadilhas que já morderam essa reconciliação uma vez. Não pular nenhuma.

### 1. Coluna 7 é PAGTO, coluna 8 é VENCTO (não o contrário)
Confirmado no próprio cabeçalho da planilha (linha 6: `'PAGTO ', 'VENCTO '`). Inverter isso faz o script contar parcelas de outro mês (venceu no mês X mas foi pago em Y) — já gerou uma diferença de ~R$30 mil numa validação. **Sempre filtrar por PAGTO (coluna 7, índice 6 em `iter_rows`).**

### 2. Ler a planilha com `iter_rows(values_only=True)`, nunca `.cell()` linha a linha
A aba tem dimensão inflada (~16 mil colunas fantasma) — `.cell(row, col)` individual trava/demora minutos num range grande. `ws.iter_rows(min_row=X, max_row=1520, min_col=1, max_col=9, values_only=True)` é rápido (segundos) porque lê em bloco.

### 3. Comparar sempre contra PRODUÇÃO, nunca contra o local isolado
O local já ficou corrompido/desatualizado sozinho várias vezes nesta sessão (sync mal feito, reset acidental). Todo "está faltando" ou "está sobrando" descoberto comparando só contra o local pode ser mentira — sempre confirmar contra produção antes de inserir ou apagar qualquer coisa. Script pronto: `validar_mes_detalhado.py <mes> <ano>` (roda contra o banco que estiver configurado em `LOCAL_DB` — sincronizar local com produção antes, ou apontar pra produção via túnel).

### 4. Nota nativa (tem XML) mas com ZERO boletos não significa "coberta" — pode estar vazia
Antes de marcar um placeholder `NNN A` como "já coberto por nota nativa" (e descartar), checar se a nota nativa **realmente tem boleto**. Várias vezes a nota nativa existia (XML importado) mas nunca gerou boleto — nesse caso o placeholder é a ÚNICA fonte real do pagamento, e descartá-lo apagaria a receita. Se a nativa estiver vazia, gerar os boletos direto do XML (campo `xml_original`, seção `<Discriminacao>`, tem "Quantidade parcelas" e lista "Vencimentos" com valor de cada parcela) em vez de inserir um placeholder duplicado.

### 5. Nunca confiar cegamente em documentação antiga de "já coberto"/"já resolvido"
Achamos duas vezes nesta sessão que uma nota marcada como "já coberta" ou "resolvida" numa sessão anterior na verdade não estava — sempre reconferir contra o estado ATUAL de produção antes de reaproveitar uma decisão antiga.

### 6. Checklist obrigatório em qualquer INSERT manual (SQL direto)
Um único registro com campo obrigatório NULL derruba a listagem inteira pro cliente (Pydantic valida a lista toda de uma vez, um erro quebra tudo — não é erro por linha). Sempre preencher:
- `manutencoes_assistencias.criado_em` e `.atualizado_em` (sem default no banco)
- `boletos.valor_juros` e `.valor_multa` = `0` (não aceita NULL no schema de resposta)
- `notas_fiscais.cnpj_emitente` e `recibos.cnpj_emitente` = CNPJ da empresa certa (sem punctuation, ex: `22761557000188` pra CMPORT) — **sem isso o registro existe no banco mas fica invisível na tela de Fluxo Financeiro**, que filtra por esse campo. Foi o bug mais traiçoeiro: banco certo, tela mostrando quase zero.

Depois de qualquer INSERT manual: testar `GET /servicos`, `GET /boletos` e `GET /financeiro/fluxo-mensal?ano=X&mes=Y` (não só somar direto no banco).

### 7. Detecção de duplicata por ID, não só por texto
Se reinserir uma nota que já existe mas com número de texto diferente (`1267` vs `1267 A`), um `WHERE numero_nota = 'X'` não pega a duplicata. Sempre checar por **condomínio + valor + data**, e depois de aplicar, rodar `validar_mes_detalhado.py` de novo pra achar "sobrando" (duas notas representando a mesma coisa).

### 8. Não apagar dado inserido manualmente sem necessidade — só completar o que falta
Nas primeiras correções desta sessão (Jan/Fev), a abordagem foi apagar tudo manual e reconstruir do zero — funcionou, mas foi arriscado e gerou os bugs acima. **A partir de Abril, abordagem padrão: validar o que já existe, inserir só o que falta, e só apagar algo específico se for confirmado como duplicata real (nota+condomínio+valor+data batendo com outra já existente).**

---

## Visão geral

Objetivo: garantir que o banco de dados (produção) tenha **todas** as notas/recibos que estão na planilha mestre `FLUXO FINANCEIRO - 2026.xlsx`, para o mês em questão, com valores batendo exatamente.

Ordem de execução (nunca pular etapa):

1. Sincronizar banco local com produção
2. Extrair a seção do mês na planilha mestre
3. Mapear condomínios (reaproveitar dicionário acumulado)
4. Separar linhas com NF (→ nota fiscal) das linhas "Recibo" (→ módulo Recibo)
5. Gerar e conferir o SQL (bater valor total antes de aplicar)
6. Aplicar no local → validar → aplicar em produção → validar
7. Criar recibos via API (não SQL direto)
8. Atualizar `RELATORIO_NF_2026.md` e o índice em `PLANO_IMPLEMENTACAO.md`

---

## Passo 1 — Sincronizar banco local com produção

Sempre que retomar esse processo (o local pode ter ficado desatualizado por trabalho de dev entre uma sessão e outra):

```bash
# 1.1 Backup do local (segurança, antes de sobrescrever)
docker exec cmport_db mysqldump -u cmport -pcmport123 cmport_gerenciamento > fluxo-financeiro/backup_local_pre_sync_$(date +%Y%m%d_%H%M).sql

# 1.2 Dump de produção via SSH
ssh -i ~/.ssh/id_ed25519 root@168.231.96.184 \
  "docker exec cmport_db sh -c 'exec mysqldump -u root -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --no-tablespaces --routines --triggers cmport_gerenciamento'" \
  > fluxo-financeiro/dump_producao_$(date +%Y%m%d).sql

# 1.3 Restaurar no local
docker exec -i cmport_db mysql -u root -pcmport2026 cmport_gerenciamento < fluxo-financeiro/dump_producao_YYYYMMDD.sql

# 1.4 Validar (contagens devem bater exatamente local == produção)
# condominios, notas_fiscais, manutencoes_assistencias, boletos, recibos
```

**Nota:** `mysqldump` sem `--no-tablespaces` falha com "Access denied; PROCESS privilege" no usuário não-root — sempre incluir essa flag.

---

## Passo 2 — Extrair a seção do mês na planilha mestre

**Fonte confirmada (2026-07-14):** `_arquivo/docs/financeiro/FLUXO FINANCEIRO - 2026.xlsx`, aba `Entradas e SAIDAS - 2026`. Esse é o arquivo mais completo (1515 linhas, cobre Jan–Maio). Existe uma cópia fora do repo (`C:\Users\amand\OneDrive\Documentos\CMport\FLUXO FINANCEIRO - 2026 .xlsx`) que fica **defasada** — sempre confirmar com o usuário qual é a atual antes de come compilar um mês novo, caso a estrutura pareça diferente do esperado.

### ⚠️ Armadilha técnica: dimensão inflada da planilha

A aba tem ~16.353 colunas (provavelmente formatação aplicada à planilha inteira). Isso trava `openpyxl` indefinidamente se você chamar `ws.max_row` ou `ws.max_column`, ou usar `load_workbook(..., read_only=True)` seguido de iteração sem limites. **Nunca fazer isso.** Sempre ler com range fixo:

```python
import openpyxl
wb = openpyxl.load_workbook('_arquivo/docs/financeiro/FLUXO FINANCEIRO - 2026.xlsx', data_only=True, read_only=True)
ws = wb['Entradas e SAIDAS - 2026']
for row in ws.iter_rows(min_row=X, max_row=Y, min_col=1, max_col=13, values_only=True):
    print(row)
```

### Como achar os limites de linha do mês

Cada mês tem 5 seções nesta ordem: `MANUTENÇÕES`, `ASSISTÊNCIAS`, `ENTRADA/BANCOS`, `DESPESAS ESCRITÓRIO`, `FORNECEDORES`. Rode uma busca por título (coluna A, contém "MES"/"MÊS") num range amplo para achar as linhas de início de cada seção do mês em questão — o título da próxima seção marca o fim da anterior.

Mapa já levantado (linhas confirmadas nesta sessão):

| Mês | Manutenções | Assistências | Entrada/Bancos | Despesas Escritório | Fornecedores |
|---|---|---|---|---|---|
| Janeiro | ~4 | ~55 | ~129 | ~153 | ~315 |
| Fevereiro | 348 | 397 | 472 | 500 | 636 |
| Março | 675 | 726 | 792 | 814 | 961 |
| Abril | 996 | 1048 | 1118 | 1143 | 1293 |
| Maio | 1326 | 1377 | 1421 | 1432 | 1497 |

Para os meses seguintes (Junho em diante), a planilha pode ter sido atualizada — refaça a busca de títulos antes de assumir os números acima.

**Escopo confirmado com o usuário (Fevereiro):** só `MANUTENÇÕES` + `ASSISTÊNCIAS` viram nota fiscal/serviço. `ENTRADA/BANCOS`, `DESPESAS ESCRITÓRIO` e `FORNECEDORES` são fluxo de caixa administrativo (salários, contas, repasses bancários) — não têm condomínio/NF e não entram nessa reconciliação. Reconfirmar esse escopo a cada mês, caso a natureza dos lançamentos mude.

---

## Passo 3 — Mapear condomínios

Reaproveitar e **evoluir** o dicionário `COND_IDS` de `gerar_sql_fevereiro.py` (que já herda de `gerar_sql_janeiro.py`). Para nomes novos que não batem:

```sql
SET NAMES utf8mb4;
SELECT id, nome FROM condominios WHERE nome LIKE '%<pedaço do nome>%';
```

Rodar essa query via arquivo `.sql` temporário + `docker exec -i cmport_db mysql ... < arquivo.sql` (rodar `-e "..."` direto com acento pode corromper o encoding — sempre usar arquivo com `SET NAMES utf8mb4;` no topo).

- Nomes com correspondência clara (typo, abreviação): adicionar ao `COND_IDS` como chave adicional (não confiar só no fuzzy-match substring do `map_cond()` — ele erra fácil com nomes parecidos mas diferentes).
- Nomes sem nenhuma correspondência: **parar e perguntar ao usuário** antes de inserir qualquer coisa. Não adivinhar condomínio de dado financeiro.

---

## Passo 4 — Separar NF de Recibo

Na planilha, a coluna "NF" às vezes vem com o texto literal `"Recibo"` em vez de um número — isso indica que não houve nota fiscal formal emitida. Tratamento:

- **Tem número de NF** → segue para `notas_fiscais` + `manutencoes_assistencias` + `boletos` (Passo 5)
- **Coluna NF = "Recibo"** → vai para o módulo Recibo via API (Passo 7), **nunca** SQL direto na tabela `recibos` (perderia a geração automática de serviço e a numeração `REC-2026-XXX`)

### ⚠️ Sufixo " A" em numero_nota — não é padrão do cliente

O sufixo `" A"` no final de `numero_nota` (ex: `1185 A`, `000.000.131 A`) é uma convenção interna dos scripts de importação/reconciliação (marca nota criada por script, sem XML real por trás) — **não** é como o número aparece quando alguém cadastra a nota pelo fluxo normal do sistema (form do front / `POST /notas-fiscais`), que grava o número puro (ex: `7857`, `63`, `TEC 000.000.009`). O próprio sistema já reconhece essa diferença: `normalizar_numero_nota()` em `backend/app/services/fluxo_financeiro_service.py:17` remove esse sufixo (junto com prefixo `TEC`, zeros à esquerda, sufixo de parcela `-N`) antes de comparar/detectar duplicata.

**Sempre que gerar um artefato de validação/comparação** (ex: `Validacao_<Mes>_2026.json`, relatórios de pendência por nota) **que exponha o campo `nota`/`numero_nota` pra leitura humana ou comparação com a planilha**, remover esse sufixo `" A"` (regex `\s[Aa]$`) do valor exibido — inclusive em textos livres de `observacoes`/`pendencias` que citem o número — pra manter o mesmo padrão das notas reais do sistema. Isso é só normalização de exibição/comparação: **nunca reescrever `numero_nota` no banco** com base nisso (é dado histórico, já teve boleto/PDF/email gerado com o número como está).

### ⚠️ Padrão `NNNN.NNNN` em numero_nota — nota que devia ser duas (Assistência + Produto)

Quando o número da NF na planilha aparece como dois números separados por ponto (ex: `1411.7407`, `1415.7411`, `7643.0059`), isso indica que o cliente cobrou **serviço (Assistência) e produto na mesma visita**, com **duas notas fiscais reais distintas** — uma de cada tipo — mas o script de reconciliação, sem conseguir separar o valor de cada uma, criou **uma única nota placeholder** com os dois números grudados.

**Nunca inserir como nota única nesse padrão.** Tratamento correto ao reinserir:
1. Criar duas notas separadas: uma `tipo=ASSISTENCIA` (primeiro número) e uma `tipo=PRODUTO` (segundo número), cada uma com seu próprio valor real (perguntar ao usuário se não tiver como descobrir o valor de cada uma na planilha/XML — **nunca dividir o valor total ao meio como chute**).
2. **Anotar o par no campo `observacao` das duas notas antes de vincular** (rastreável mesmo se o vínculo ainda não rodou ou for desfeito depois):
   - Nota Assistência: `"Par vinculado (NF combinada original: 1411.7407) — Produto: nota 7407 A"`
   - Nota Produto: `"Par vinculado (NF combinada original: 1411.7407) — Assistência: nota 1411 A"`
3. Vincular as duas via `POST /notas-fiscais/vincular-notas` (mesmo condomínio, nenhuma das duas já vinculada, nenhuma com boleto ativo — ver `NotaFiscalService.vincular_notas`, exige exatamente um `ASSISTENCIA` + um `PRODUTO`).
4. Se o valor de cada nota individual não for conhecido ainda, marcar como pendência e não inventar — mesmo protocolo do resto do processo.

Ao gerar `Validacao_<Mes>_2026.json`, sinalizar esses casos com um campo tipo `possivel_nota_vinculada: {candidatos: [nota_a, nota_b], obs: "..."}` na entrada da nota, pra não perder o achado entre sessões.

---

## Passo 5 — Gerar e conferir o SQL

Copiar `gerar_sql_fevereiro.py` para `gerar_sql_<mes>.py`, ajustar:
- `ROW_START` / `ROW_END` para o mês
- `SKIP` (linhas de título/header/subtotal — sempre 8 linhas: 2 títulos + 2 headers + 2 subtítulos + 2 subtotais, uma seção Manutenções + uma Assistências)
- `COND_IDS` com os novos mapeamentos do Passo 3

**Conferência obrigatória antes de aplicar:** a planilha tem uma linha de subtotal ao final de cada seção (soma automática do Excel). Somar os valores do SQL gerado e comparar:

```
subtotal_manutencoes + subtotal_assistencias == soma(SQL) + soma(pendentes) + soma(recibos)
```

Se não bater exatamente, **não aplicar** — tem linha duplicada, perdida, ou mal classificada.

**Cuidado com datas inválidas:** já apareceu um caso de vencimento gravado como `1901-01-09` (erro de parse do Excel). Nunca inserir uma data assim — perguntar ao usuário como resolver (nesse caso, usou-se a data de pagamento como fallback).

---

## Passo 6 — Aplicar: local → validar → produção → validar

```bash
# Local primeiro
docker exec -i cmport_db mysql -u root -pcmport2026 cmport_gerenciamento < fluxo-financeiro/insercao_<mes>_2026.sql

# Validar
SELECT COUNT(*), SUM(valor_nominal) FROM boletos WHERE data_pagamento BETWEEN '2026-MM-01' AND '2026-MM-28';
# deve bater com soma(SQL) calculada no Passo 5

# Backup de produção antes de aplicar lá
ssh -i ~/.ssh/id_ed25519 root@168.231.96.184 "docker exec cmport_db sh -c 'exec mysqldump -u root -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --no-tablespaces --routines --triggers cmport_gerenciamento'" > fluxo-financeiro/backup_producao_pre_<mes>_$(date +%Y%m%d_%H%M).sql

# Aplicar em produção
ssh -i ~/.ssh/id_ed25519 root@168.231.96.184 "docker exec -i cmport_db sh -c 'exec mysql -u root -p\"\$MYSQL_ROOT_PASSWORD\" cmport_gerenciamento'" < fluxo-financeiro/insercao_<mes>_2026.sql

# Validar produção (mesma query acima via SSH)
```

**Nota sobre `notas_fiscais.numero_nota` UNIQUE:** se a mesma NF aparecer 2x na planilha (parcelas diferentes de um contrato parcelado), o `INSERT ... ON DUPLICATE KEY UPDATE` só atualiza a nota (não duplica), mas os 2 `boletos` são criados normalmente — isso é o comportamento correto, não um bug. A contagem de `notas_fiscais` pode ficar menor que o número de linhas processadas; a contagem de `boletos` é a autoritativa para conferir o valor total.

---

## Passo 7 — Criar recibos via API

O módulo Recibo tem geração automática de serviço embutida (`ReciboService.criar` → se `gerar_servico=True` e há `condominio_id`, cria `ManutencaoAssistencia` automaticamente). Fazer isso via SQL direto perderia essa lógica.

### 7.1 Subir o backend local numa porta livre

⚠️ **A porta 8000 pode estar ocupada por outro projeto local** (aconteceu nesta sessão: container `nia_backend` já usava 8000). Confirmar antes:

```bash
netstat -ano | grep ":8000"
```

Se ocupada, subir o CMPort numa porta alternativa (ex: 8001), **sempre com `run_in_background: true` na tool** (usar `&` do shell não sobrevive entre chamadas de tool):

```bash
cd backend && ./venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Esperar ~5-8s e testar `curl http://127.0.0.1:8001/openapi.json` antes de prosseguir.

### 7.2 Login + criar recibo

```python
import requests
BASE = "http://127.0.0.1:8001/api/v1"  # trocar para http://168.231.96.184/api/v1 na hora de produção
token = requests.post(f"{BASE}/auth/login", json={"email": "atila.dev@cmport.com", "senha": "..."}).json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

payload = {
    "tipo": "ENTRADA",
    "condominio_id": 148,  # None se não identificado ainda
    "cliente_nome_avulso": "Nome da planilha",
    "descricao_servico": "...",
    "valor": 587.51,
    "data_emissao": "2026-MM-DD",
    "data_vencimento": "2026-MM-DD",
    "data_pagamento": "2026-MM-DD",
    "status": "PAGO",
    "observacao": "Importado da planilha FLUXO FINANCEIRO 2026 (secao Assistencias <Mes>, linha N).",
    "gerar_servico": True,       # só funciona se condominio_id != None
    "tipo_servico": "ASSISTENCIA",
}
requests.post(f"{BASE}/recibos", json=payload, headers=headers)
```

Rodar primeiro contra o local (porta 8001), validar (`SELECT * FROM manutencoes_assistencias WHERE recibo_id=...`), depois repetir exatamente o mesmo payload contra produção (`http://168.231.96.184/api/v1`, direto, sem precisar subir nada — a API de produção já está sempre no ar).

**Credenciais:** ver memória `auth_credentials.md` — não colar em arquivos versionados do repo.

### 7.3 Limpeza

Depois de terminar: derrubar o backend local de teste (`taskkill //PID <pid> //F`) e apagar os scripts temporários que contêm senha (nunca deixar `_criar_recibos_*.py` commitado).

---

## Passo 8 — Atualizar documentação

1. `fluxo-financeiro/RELATORIO_NF_2026.md`: nova seção `## <Mês> 2026` no mesmo formato das anteriores (métricas, tabela completa de NFs, pendências) + atualizar "Resumo Executivo" no final.
2. `PLANO_IMPLEMENTACAO.md`: novo item `D<n>` na tabela de concluídos, com total em R$ e qualquer resíduo (condomínio não identificado etc.).
3. `PENDENCIAS.md`: se sobrar algum item tipo "Eraseg" (recibo sem condomínio), registrar ali para retomar quando o usuário identificar.

---

## Checklist rápido por mês

- [ ] Passo 1: local sincronizado com produção (contagens batem)
- [ ] Passo 2: seção do mês localizada (título + linhas de início/fim de Manutenções e Assistências)
- [ ] Passo 3: todos os condomínios mapeados ou explicitamente pendentes (perguntado ao usuário)
- [ ] Passo 4: linhas "Recibo" separadas das linhas com NF
- [ ] Passo 5: soma do SQL gerado bate com o subtotal da planilha (conferência matemática antes de aplicar)
- [ ] Passo 6: aplicado e validado em local, depois em produção (com backup antes)
- [ ] Passo 7: recibos criados via API (não SQL), serviço auto-gerado conferido quando aplicável
- [ ] Passo 8: `RELATORIO_NF_2026.md` + `PLANO_IMPLEMENTACAO.md` + `PENDENCIAS.md` atualizados
- [ ] Scripts temporários com senha apagados, backend de teste local encerrado
