# Plano — Despesa Funcionário (A3 da Fase 2)

_Criado 27/08/2026. Escopo redefinido pelo Atila: módulo de folha/pessoal com
tabela dedicada, não reuso de Despesa+categoria._

## Decisões do Atila (27–28/08)
- Tabela **dedicada `funcionarios`** (pensada pra uso futuro além da folha).
- **Variáveis por funcionário** geram as despesas (não lançamento avulso).
- Empresa pagadora = **por lançamento** (funcionário tem empresa padrão, cada
  despesa gerada pode ser CMPORT ou TEC, editável).
- Geração das despesas mensais = **automática** (reusa o scheduler que já roda
  pras Despesas RECORRENTE).
- Nome no sistema: **"Despesa Funcionário"**. Página: `/fluxo-financeiro/funcionarios`.
- Histórico a migrar: `despesas_funcionario.json` (240 transações, R$ 258.755,94,
  fonte de verdade confirmada).
- **Salário varia todo mês** → `funcionario_variaveis` guarda o valor **corrente**
  (sugestão); a parcela gerada é **editável** na hora de pagar. Histórico entra com
  o valor real de cada mês. (Não versiona salário por vigência — decisão 28/08.)
- **Dois tipos de custo de funcionário** (medido no histórico 28/08):
  - **Individual** (vincula a `funcionario_id`): salário, adiantamento, VT/VR,
    férias, rescisão, PRL, reembolso.
  - **Folha / consolidado** (SEM `funcionario_id`): encargos (FGTS/GPS/Sindicato,
    pagos como guia da folha inteira) e convênio médico/odontológico (fatura dos
    planos). Viram Despesa categoria grupo FUNCIONARIO, bucket "Folha – Encargos" /
    "Folha – Convênio". O `encargos_percentual` por funcionário é só projeção.
- **Coleta dos dados que faltam:** HTML `docs-e-planilhas/CADASTRO_FUNCIONARIOS.html`
  (gitignored — tem nome+salário de gente real), publicado como Artifact
  **https://claude.ai/code/artifact/aa1ee935-6217-4f90-acea-865a82f378dd**
  (28/08, a pedido do Atila pra mandar pro cliente). Pré-preenchido com os 7 do
  histórico; a cliente confere/completa (salário atual, dia de pagamento, cargo,
  admissão), marca desligados, adiciona novos, e gera um JSON pra devolver. Esse
  JSON alimenta a Fase D.

## Os 7 funcionários no histórico (2026)
André Moreira Rosa · Luis Antonio Melgarejo Neves · Welligton Lucas Menezes
Rodrigues · Pedro Henrique da Silva (**desligado ago/26**) · Fabiana Pedretti
Moreira Rosa · Gabriel Moreira Pedretti (entrou no meio do ano) · Almira Moreira
Rosa Salomão. Todos aparecem pagos pelos 2 CNPJs.

## Modelo de dados

### `funcionarios`
| campo | tipo | nota |
|---|---|---|
| id | int PK | |
| nome | varchar(150) | |
| empresa_padrao_cnpj | varchar(20) | CMPORT ou TEC — default do lançamento |
| cargo | varchar(100) null | |
| data_admissao | date null | |
| data_demissao | date null | null = ativo |
| ativo | bool | soft — desativar pausa geração |
| observacao | text null | |
| criado_em / atualizado_em / deletado_em | datetime | soft delete |

### `funcionario_variaveis` (1:1 com funcionário) — valores CORRENTES (sugestão da geração)
| campo | tipo | nota |
|---|---|---|
| funcionario_id | int FK unique | |
| salario_mensal | numeric(10,2) | valor atual; parcela gerada é editável |
| dia_pagamento_salario | int (1-31) null | |
| adiantamento_tipo | enum NENHUM/FIXO/VARIAVEL | |
| adiantamento_valor | numeric(10,2) default 0 | só usado se tipo=FIXO |
| dia_pagamento_adiantamento | int (1-31) null | |
| vale_transporte | numeric(10,2) default 0 | por pessoa |
| vale_refeicao | numeric(10,2) default 0 | VR/VA, por pessoa |
| tem_plantao | bool default 0 | se sim, a folha do mês inclui linha Plantão (valor entra no fechamento) |
| tem_hora_extra | bool default 0 | idem, linha Hora extra |
| encargos_percentual | numeric(5,2) default 0 | **só projeção** — encargo real é bucket de folha |

Campos batem 1:1 com o que o `CADASTRO_FUNCIONARIOS.html` coleta.
Encargos/convênio NÃO são campos de funcionário (bucket de folha, ver Decisões).
**Comissão** NÃO é campo/flag (poucos têm, caso raro) — é lançamento eventual na tela do funcionário.

### `despesas` — coluna nova
- `funcionario_id` int FK null (ondelete SET NULL). Amarra a despesa ao funcionário.
- ALTER TABLE manual em `main.py::_run_migrations()` (padrão do projeto).

## Categorias (grupo novo FUNCIONARIO)
Seed idempotente, `GrupoCategoria.FUNCIONARIO`:
Salário (folha mensal) · Adiantamento de salário · **Plantão** · **Hora extra** ·
**Comissão** · Encargos trabalhistas (FGTS/GPS) · Sindicato · Benefício — convênio
médico/odontológico · Vale transporte · Vale refeição/alimentação · Férias · 13º salário ·
Rescisão · PRL (participação resultado) · Passagem/reembolso pessoal

## Motor de geração
- **Componentes fixos** (salário, adiantamento FIXO, VT, VR): variável não-zero →
  `Despesa` RECORRENTE (categoria FUNCIONARIO, `funcionario_id`, `fornecedor_id` null,
  `cnpj` = empresa_padrao, `dia_vencimento` = dia da variável, `valor_recorrente` = valor).
- **Componentes variáveis** (adiantamento VARIÁVEL, plantão se `tem_plantao`, hora extra
  se `tem_hora_extra`): também RECORRENTE, mas `valor_recorrente = 0` — a parcela nasce
  em 0 e é **editada no fechamento do mês** com o valor real.
- Todas as parcelas são editáveis na hora de pagar (o salário também varia).
- Sincronização: ao criar/editar variáveis, `FuncionarioService.sincronizar_recorrentes`
  cria/atualiza/desativa as Despesas RECORRENTE do funcionário.
- `gerar_recorrentes_pendentes` (scheduler existente) gera as parcelas mensais — sem
  código novo de scheduler.
- **Eventuais** (férias, 13º, rescisão, PRL, comissão, reembolso) → lançamento UNICO
  manual na tela do funcionário quando acontece.

## Férias (e 13º) — controle
- **Pagamento:** lançamento UNICO categoria Férias, vinculado ao funcionário, com
  **calculadora** (sugestão `salario_mensal + salario_mensal/3`; editável — pode ter
  abono, dias vendidos, média de variáveis).
- **Alerta de vencimento:** a partir de `data_admissao` + histórico de lançamentos de
  Férias do funcionário, calcular o período aquisitivo aberto e sinalizar quando passa
  de ~11 meses sem férias tiradas. Entra na página de pendências/alertas do fluxo.
- 13º: mesma mecânica (categoria 13º salário, alerta em novembro), 1ª e 2ª parcela.
- **Sem provisão contábil mensal** (1/12) — a planilha da cliente é regime de caixa.

## Fases

### Fase A — cadastro (backend)
- `GrupoCategoria.FUNCIONARIO` + seed idempotente das categorias.
- model `Funcionario` + `FuncionarioVariaveis`; `despesas.funcionario_id` + ALTER.
- schema Pydantic → repository → service → router `/funcionarios` (CRUD + variáveis).
- `despesa_repository.listar`: `origem="FUNCIONARIO"` = `funcionario_id IS NOT NULL`;
  corrigir `origem="GERAL"` pra `funcionario_id IS NULL AND fornecedor_id IS NULL`.
- Sem geração ainda. tsc/testes.

### Fase B — motor de geração
- `FuncionarioService.sincronizar_recorrentes(funcionario_id)`.
- Chamado ao salvar variáveis. Reaproveita `Despesa` RECORRENTE + engine existente.
- Endpoint `POST /funcionarios/{id}/sincronizar-recorrentes` (idempotente).

### Fase C — frontend
- Página `/fluxo-financeiro/funcionarios` — lista + CRUD.
- Form de variáveis por funcionário (inclui flags tem_plantao / tem_hora_extra).
- Lista de despesas do funcionário (reusa componentes de parcela/pagamento);
  fechamento do mês = editar valor das parcelas variáveis (plantão/HE/adiantamento).
- Botão de lançamento avulso (férias c/ calculadora, 13º, rescisão, PRL, comissão, reembolso).
- Alerta de férias vencendo na página de pendências/alertas.
- Link no menu.

### Fase D — migração do histórico
- **Insumo:** o JSON que a cliente devolve do `CADASTRO_FUNCIONARIOS.html` (dados
  reais dos funcionários) + `despesas_funcionario.json` (os 240 lançamentos).
- Mapa **curado** `nome_na_descrição → funcionario_id` (não regex — "Fabiana
  Pedretti" = "Fabiana Pedretti Moreira Rosa"; ver os 7 nomes acima).
- Script `migrar_despesa_funcionario.py`: cria os `funcionarios` + `funcionario_variaveis`
  a partir do JSON da cliente; cada um dos 240 lançamentos vira `Despesa` UNICO PAGO
  + `DespesaParcela` PAGO + `fin_movimentacoes`:
  - individual (salário/adiantamento/VT/VR/férias/rescisão/PRL/reembolso) → com `funcionario_id`
  - folha (encargos/convênio) → SEM `funcionario_id`, categoria "Folha – Encargos"/"Folha – Convênio"
- `id_externo_banco = MIGRACAO-FUNCIONARIO-{cnpj}-{linha_planilha}` (dedup).
- Cuidado: mojibake nas subcategorias do JSON (cp1252); 1 data furada `2006-08-28`
  (era 2026); os 19 itens já reclassificados pra GERAL (ver
  `gerar_sql_incremento_funcionario.py`) NÃO entram.
- Aplicar local → conferir totais por subcategoria x JSON → produção c/ backup + aprovação.

### Fase E — revalidação
- `validar_fluxo_todos_meses.py` — ver se os meses passam a bater com a planilha
  da cliente agora que a folha entrou.

## Requisitos adicionais (Atila, 28/08)
- **Plantão / Hora extra:** valor total em R$ por mês, componente por funcionário
  (flag `tem_plantao` / `tem_hora_extra`), parcela mensal nasce em 0 e é editada no fechamento.
- **Comissão:** poucos têm — lançamento eventual, não componente.
- **Férias:** registrar pagamento (calculadora salário+1/3) + alerta de vencimento do
  período aquisitivo. 13º mesma mecânica.

## Fora do escopo desta rodada (pendências futuras)
- Versionamento histórico das variáveis (mudança de salário com data).
- Férias proporcionais, provisão contábil mensal (1/12).
- Vínculo funcionário ↔ serviço/OS do Auvo.
- eSocial / integração contábil.
