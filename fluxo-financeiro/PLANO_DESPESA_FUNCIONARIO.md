# Plano — Despesa Funcionário (A3 da Fase 2)

_Criado 27/08/2026. Escopo redefinido pelo Atila: módulo de folha/pessoal com
tabela dedicada, não reuso de Despesa+categoria._

## Decisões do Atila (27/08)
- Tabela **dedicada `funcionarios`** (pensada pra uso futuro além da folha).
- **Variáveis por funcionário** geram as despesas (não lançamento avulso).
- Encargos trabalhistas = **% sobre o salário** (campo por funcionário).
- Empresa pagadora = **por lançamento** (funcionário tem empresa padrão, cada
  despesa gerada pode ser CMPORT ou TEC, editável).
- Geração das despesas mensais = **automática** (reusa o scheduler que já roda
  pras Despesas RECORRENTE).
- Nome no sistema: **"Despesa Funcionário"**. Página: `/fluxo-financeiro/funcionarios`.
- Histórico a migrar: `despesas_funcionario.json` (240 transações, R$ 258.755,94,
  fonte de verdade confirmada).

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

### `funcionario_variaveis` (1:1 com funcionário, começa simples)
| campo | tipo | nota |
|---|---|---|
| funcionario_id | int FK unique | |
| salario_mensal | numeric(10,2) | 0 = não gera |
| dia_pagamento_salario | int (1-28) null | |
| adiantamento_valor | numeric(10,2) default 0 | |
| dia_pagamento_adiantamento | int (1-28) null | |
| vale_transporte | numeric(10,2) default 0 | |
| vale_refeicao | numeric(10,2) default 0 | VR/VA |
| convenio_medico | numeric(10,2) default 0 | |
| encargos_percentual | numeric(5,2) default 0 | % sobre salario_mensal (FGTS+GPS patronal) |
| sindicato_valor | numeric(10,2) default 0 | fixo mensal, opcional |
| dia_pagamento_encargos | int (1-28) null | |

### `despesas` — coluna nova
- `funcionario_id` int FK null (ondelete SET NULL). Amarra a despesa ao funcionário.
- ALTER TABLE manual em `main.py::_run_migrations()` (padrão do projeto).

## Categorias (grupo novo FUNCIONARIO)
Seed idempotente, `GrupoCategoria.FUNCIONARIO`:
Salário (folha mensal) · Adiantamento de salário · Encargos trabalhistas (FGTS/GPS) ·
Sindicato · Benefício — convênio médico/odontológico · Vale transporte ·
Vale refeição/alimentação · Férias · Rescisão · PRL (participação resultado) ·
Passagem/reembolso pessoal

## Motor de geração
- Cada variável não-zero do funcionário → uma `Despesa` tipo RECORRENTE
  (categoria FUNCIONARIO correspondente, `funcionario_id` setado, `fornecedor_id` null,
  `cnpj` = empresa_padrao, `dia_vencimento` = o dia da variável, `valor_recorrente` = valor).
  Encargo: `valor = salario_mensal * encargos_percentual / 100`.
- Sincronização: ao criar/editar variáveis, cria/atualiza/desativa as Despesas
  RECORRENTE do funcionário (`FuncionarioService.sincronizar_recorrentes`).
- `gerar_recorrentes_pendentes` (já roda no scheduler) passa a gerar as parcelas
  mensais dessas despesas automaticamente — sem código novo de scheduler.
- Eventuais (férias, rescisão, PRL, reembolso) → lançamento UNICO manual na tela
  do funcionário quando acontece.

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
- Form de variáveis por funcionário.
- Lista de despesas do funcionário (reusa componentes de parcela/pagamento).
- Botão de lançamento avulso (férias/rescisão/PRL).
- Link no menu.

### Fase D — migração do histórico
- Script `migrar_despesa_funcionario.py`: extrai nomes das descrições dos 240
  lançamentos → cria `funcionarios` (empresa_padrao = CNPJ mais frequente do nome)
  → cada lançamento vira `Despesa` UNICO PAGO + `DespesaParcela` PAGO +
  `fin_movimentacoes`, com `funcionario_id` e categoria conforme subcategoria.
- `id_externo_banco = MIGRACAO-FUNCIONARIO-{cnpj}-{linha_planilha}` (dedup).
- Cuidado: mojibake nas subcategorias do JSON; os 19 itens já reclassificados
  pra GERAL (ver `gerar_sql_incremento_funcionario.py`) NÃO entram.
- Aplicar local → conferir totais por subcategoria x JSON → produção c/ backup + aprovação.

### Fase E — revalidação
- `validar_fluxo_todos_meses.py` — ver se os meses passam a bater com a planilha
  da cliente agora que a folha entrou.

## Fora do escopo desta rodada (pendências futuras)
- Versionamento histórico das variáveis (mudança de salário com data).
- Cálculo de 13º, férias proporcionais, provisões.
- Vínculo funcionário ↔ serviço/OS do Auvo.
- eSocial / integração contábil.
