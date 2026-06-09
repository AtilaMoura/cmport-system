# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Este arquivo contém o plano técnico detalhado da tarefa que está sendo implementada no momento.
> É substituído integralmente a cada nova tarefa iniciada.
> O índice mestre e o histórico de tarefas concluídas ficam em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefa Atual

**Nenhuma tarefa em andamento.** A próxima tarefa será definida com base no índice de `PLANO_IMPLEMENTACAO.md`.

---

## Histórico — Última Tarefa Concluída

# Plano Técnico — Módulo Corpo da Nota (Fase 1: Manutenção)

> **Executor:** Outra IA
> **Avaliador:** Atila (audita e faz deploy após execução)
> **Stack:** FastAPI + SQLAlchemy + MySQL | Next.js 16 App Router + TypeScript + Tailwind v4
> **Deploy:** `git push vps master` (hook automático)
> **Data do plano:** 2026-05-22
> **Última atualização:** 2026-05-22
> **Status:** ✅ Concluído — Em produção (commit `1da01ed`)

---

## Status da Implementação

| Fase | Descrição | Status |
|------|-----------|--------|
| A | Models + ImpostoService + main.py migrations | ✅ Concluído |
| B | Repositories (contrato, ciclo, corpo) | ✅ Concluído |
| C | Services (contrato, ciclo, corpo, imposto) | ✅ Concluído |
| D | Schemas + Routers + registro no main.py | ✅ Concluído |
| E | Integrações: nota_fiscal_service + boleto_service + models existentes | ✅ Concluído |
| F | Frontend: páginas, componentes, API calls, TypeScript | ✅ Concluído |
| G | Deploy VPS — build limpo, containers saudáveis | ✅ Concluído |

**Commit do backend:** `1167252` — 22 arquivos, +3016 linhas
**Commit do frontend:** `6754c46` — 8 arquivos, +1744 linhas
**Commit do fix vínculo manual:** `1da01ed` — 2 arquivos

---

## 1. Resumo Executivo

O CMPort hoje importa XML/ZIP de notas fiscais e gera boletos, mas não tem nenhum registro do que foi acordado e preparado *antes* da nota chegar. Isso significa que quando o emitente devolve o ZIP, não há como saber automaticamente a qual serviço pertence, nem há rastreabilidade do ciclo financeiro completo.

Este plano cria o módulo **Corpo da Nota**: um registro persistente gerado pelo operador antes da nota fiscal existir, que funciona como a "intenção" ou "rascunho faturável". Quando o ZIP/XML chega, o sistema localiza o corpo correspondente e vincula automaticamente. O histórico mensal é preservado por ciclo, e o status evolui de forma rastreável até o pagamento.

O foco absoluto da Fase 1 é o tipo **MANUTENÇÃO**. SERVIÇO e PRODUTO ficam na arquitetura como enum, mas sem UI ou fluxo específico nesta fase.

---

## 2. Objetivo da Entrega

Entregar um fluxo completo e operacional para:

1. Criar um **Corpo da Nota** de manutenção com dados puxados automaticamente da OS e complemento manual
2. Controlar o **ciclo mensal** (uma nota por mês por condomínio)
3. Vincular o **ZIP/XML** ao corpo já criado quando a nota voltar do emitente
4. Integrar com o fluxo já existente de **boleto e pagamento**
5. Registrar **contrato simples** por condomínio (ativo/inativo + datas)
6. Garantir **histórico completo** e rastreabilidade em todas as etapas

---

## 3. Escopo da Fase 1

| Item | Incluído |
|------|----------|
| Corpo da Nota — tipo MANUTENÇÃO | Sim |
| Contrato simples (ativo/inativo + datas) | Sim |
| Ciclo mensal com controle de pendência | Sim |
| Preenchimento automático via OS | Sim |
| Preenchimento manual complementar | Sim |
| Preview do corpo antes de salvar | Sim |
| Vínculo com ZIP/XML | Sim |
| Vínculo com boleto existente | Sim |
| Controle de pagamento integrado ao boleto | Sim |
| Suporte a garantia (campo no modelo) | Parcial — campo previsto, UI mínima |
| Histórico e auditoria | Sim |
| Status com máquina de estados | Sim |

---

## 4. Fora de Escopo — Fase 2

| Item | Motivo |
|------|--------|
| Corpo da Nota — tipo SERVIÇO | Fluxo diferente; adiado |
| Corpo da Nota — tipo PRODUTO | NF-e (diferente de NFS-e); adiado |
| Contrato com cláusulas, anexos ou assinatura digital | Complexidade; adiado |
| Fluxo de aprovação de notas | Não solicitado |
| Portal do cliente para download | Fora do escopo atual |
| Geração automática do XML/NFS-e | Depende de integração com prefeitura |
| Notificações automáticas de vencimento | Fase 2 |
| Relatórios e dashboards de ciclo | Fase 2 |

---

## 5. Fluxo Operacional Completo

```
[Técnico executa serviço]
        ↓
[OS criada no Auvo → sincronizada no CMPort]
        ↓
[Operador acessa "Novo Corpo da Nota"]
        ↓
[Seleciona condomínio]
   → sistema exibe: tem contrato? ativo? datas ok?
        ↓
[Sistema busca OS do mês → preenche automaticamente]
   → campos: numero_os, data_servico, descricao, valor_bruto, impostos
        ↓
[Operador complementa manualmente o que faltar]
        ↓
[Preview do corpo gerado]
        ↓
[Salva corpo da nota → status = GERADO]
        ↓
[Emitente gera e envia ZIP/XML]
        ↓
[Operador faz upload do ZIP/XML no CMPort]
   → sistema tenta match automático (CNPJ + tipo + mês/ano + OS)
   → se encontrar: vincula automaticamente → status = XML_VINCULADO
   → se não encontrar: exibe lista de candidatos para seleção manual
        ↓
[Gerar boleto] (fluxo já existente, agora integrado ao corpo)
   → status = BOLETO_GERADO
        ↓
[Pagamento registrado] (via boleto_service já existente)
   → status = PAGO
        ↓
[Ciclo encerrado → histórico preservado]
[Próximo mês → novo ciclo disponível automaticamente]
```

---

## 6. Mapeamento dos Tipos de Nota

| Tipo | Fase 1 | Fonte dados | Documento referência |
|------|--------|-------------|----------------------|
| MANUTENÇÃO | Completo | OS do Auvo | `Corpo da nota de manutenção.docx` |
| SERVIÇO | Arquitetura only | A definir | `CORPO DA NOTA DE SERVIÇO.docx` |
| PRODUTO | Arquitetura only | A definir | Sem referência ainda |

O enum `TipoNotaCorpo` no backend terá: `MANUTENCAO`, `SERVICO`, `PRODUTO`.

---

## 7. Análise das Tabelas Existentes

### 7.1 `manutencoes_assistencias`
- **Campos relevantes:** `id`, `condominio_id`, `nota_fiscal_id` (nullable FK), `numero_os`, `data_servico`, `descricao`, `tipo` (manutencao/assistencia)
- **Reaproveitamento:** Fonte primária de dados para o auto-fill do CorpoNota
- **Modificação necessária:** Nenhuma

### 7.2 `notas_fiscais`
- **Campos relevantes:** `id`, `condominio_id`, `numero_nota`, `tipo`, `status`, `valor`, `data_vencimento`, `xml_original`, `nota_vinculada_id`, `imposto_config_vinculo`
- **TipoNota enum atual:** `ASSISTENCIA`, `MANUTENCAO`, `OUTROS`
- **Reaproveitamento:** Destino do vínculo após upload do ZIP/XML
- **Modificação necessária:** Adicionar `corpo_nota_id` (FK nullable, UNIQUE, ON DELETE SET NULL)

### 7.3 `boletos`
- **Campos relevantes:** `id`, `nota_fiscal_id` (NOT NULL FK), `numero_parcela`, `total_parcelas`, `valor_nominal`, `situacao` (SituacaoBoleto), `data_vencimento`, `data_pagamento`
- **Reaproveitamento:** Status de pagamento já controlado aqui
- **Modificação necessária:** Adicionar `corpo_nota_id` (FK nullable, ON DELETE SET NULL) — permite rastrear o ciclo completo mesmo sem nota fiscal ainda

### 7.4 `configuracoes_impostos_servico`
- **Campos relevantes:** percentuais de INSS, COFINS, PIS, CSLL
- **Reaproveitamento:** Base de cálculo dos impostos do CorpoNota
- **Modificação necessária:** Nenhuma

### 7.5 `condominios`
- **Campos relevantes:** `id`, `nome`, `cnpj`, `email`, `codigo_auvo`
- **Reaproveitamento:** Dados para o corpo da nota e para matching do XML
- **Modificação necessária:** Nenhuma

### 7.6 `registros_exclusoes`
- **Campos relevantes:** `id`, `tabela`, `registro_id`, `snapshot_json`, `excluido_por`, `data_exclusao`
- **Reaproveitamento:** Auditoria de soft-deletes de corpos e contratos
- **Modificação necessária:** Nenhuma

---

## 8. Lacunas Encontradas

| # | Lacuna | Impacto |
|---|--------|---------|
| 1 | Não existe registro "pré-nota" — intenção de faturamento antes do XML | Alto — sem isso não há rastreabilidade |
| 2 | Não existe controle de ciclo mensal por condomínio | Alto — cada mês precisa ser um ciclo separado |
| 3 | Não existe contrato por condomínio | Médio — operador não sabe se condomínio tem contrato ativo |
| 4 | Matching XML→serviço é manual | Alto — vinculação deve ser automática com fallback manual |
| 5 | Cálculo de impostos duplicado entre `boleto_service` e lógica futura | Médio — deve ser extraído para `ImpostoService` |
| 6 | Boleto não tem FK para ciclo/corpo | Baixo — rastreabilidade incompleta |
| 7 | Histórico de status da nota não existe | Alto — não há trilha de auditoria do ciclo |

---

## 9. Novas Tabelas Necessárias

### 9.1 `contratos_condominio`

```
id                  INT PK AUTO_INCREMENT
condominio_id       INT FK NOT NULL → condominios.id (CASCADE DELETE)
ativo               BOOLEAN NOT NULL DEFAULT TRUE
data_inicio         DATE NOT NULL
data_termino        DATE NULL
criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP
atualizado_em       DATETIME ON UPDATE CURRENT_TIMESTAMP
criado_por          VARCHAR(100) NULL
deletado_em         DATETIME NULL          ← soft delete

UNIQUE INDEX uq_contrato_condominio (condominio_id)  ← um por condomínio
INDEX ix_contratos_ativo (ativo)
```

**Regra — simples por design:** o contrato é apenas um marcador de que o condomínio tem (ou teve) contrato de manutenção. As quatro operações possíveis são, nada além disso:
1. **Criar** — registrar que o condomínio tem contrato
2. **Editar** — ajustar data_inicio ou data_termino
3. **Ativar/Desativar** — toggle do campo `ativo` (liga/desliga visual)
4. **Excluir** — soft delete via `registrar_exclusao()` + `deletado_em`

Sem fluxo de aprovação, sem cláusulas, sem lógica de vigência nesta fase.

---

### 9.2 `ciclos_nota`

```
id                  INT PK AUTO_INCREMENT
condominio_id       INT FK NOT NULL → condominios.id (CASCADE DELETE)
tipo_nota           ENUM('MANUTENCAO','SERVICO','PRODUTO') NOT NULL
ano                 SMALLINT NOT NULL
mes                 TINYINT NOT NULL         ← 1-12
status_ciclo        ENUM('PENDENTE','EM_ANDAMENTO','CONCLUIDO') NOT NULL DEFAULT 'PENDENTE'
criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP
atualizado_em       DATETIME ON UPDATE CURRENT_TIMESTAMP

UNIQUE INDEX uq_ciclo (condominio_id, tipo_nota, ano, mes)
INDEX ix_ciclo_status (status_ciclo)
INDEX ix_ciclo_periodo (ano, mes)
```

**Propósito — é o "mês de referência":** `ciclos_nota` representa exatamente um mês de faturamento de um condomínio. É a entidade de agrupamento e controle de pendência mensal.

> **Regra de uso obrigatória:** qualquer consulta do tipo "o que aconteceu no mês X do condomínio Y?" deve usar `ciclos_nota` como ponto de entrada, nunca `corpos_nota` diretamente. `corpos_nota` são os documentos *dentro* de um ciclo. **Não usar `corpos_nota` como substituto do ciclo** — isso duplicaria lógica e quebraria a separação de responsabilidades.

---

### 9.3 `corpos_nota`

```
id                    INT PK AUTO_INCREMENT
ciclo_id              INT FK NOT NULL → ciclos_nota.id
condominio_id         INT FK NOT NULL → condominios.id
tipo_nota             ENUM('MANUTENCAO','SERVICO','PRODUTO') NOT NULL
servico_id            INT FK NULL → manutencoes_assistencias.id  ← OS vinculada
numero_os             VARCHAR(50) NULL      ← pode vir da OS ou preenchimento manual
data_servico          DATE NULL
descricao_servico     TEXT NULL
valor_bruto           DECIMAL(10,2) NULL
percentual_inss       DECIMAL(5,2) NULL
percentual_cofins     DECIMAL(5,2) NULL
percentual_pis        DECIMAL(5,2) NULL
percentual_csll       DECIMAL(5,2) NULL
valor_inss            DECIMAL(10,2) NULL    ← calculado
valor_cofins          DECIMAL(10,2) NULL
valor_pis             DECIMAL(10,2) NULL
valor_csll            DECIMAL(10,2) NULL
valor_liquido         DECIMAL(10,2) NULL    ← calculado
data_vencimento       DATE NULL
mes_referencia        VARCHAR(7) NULL       ← ex: "05/2026"
observacoes           TEXT NULL
preenchimento_manual  BOOLEAN NOT NULL DEFAULT FALSE  ← flag de origem dos dados
status                ENUM(ver seção 21) NOT NULL DEFAULT 'PENDENTE'
nota_fiscal_id        INT FK NULL → notas_fiscais.id (SET NULL)  ← preenchido após XML
tem_garantia          BOOLEAN NOT NULL DEFAULT FALSE
termo_garantia_id     INT FK NULL → termos_garantia.id (SET NULL)
conteudo_gerado       TEXT NULL             ← texto final renderizado do corpo
criado_em             DATETIME DEFAULT CURRENT_TIMESTAMP
atualizado_em         DATETIME ON UPDATE CURRENT_TIMESTAMP
criado_por            VARCHAR(100) NULL
deletado_em           DATETIME NULL         ← soft delete

INDEX ix_corpo_condominio (condominio_id)
INDEX ix_corpo_ciclo (ciclo_id)
INDEX ix_corpo_status (status)
INDEX ix_corpo_servico (servico_id)
INDEX ix_corpo_nota_fiscal (nota_fiscal_id)
```

---

## 10. Alterações em Tabelas Existentes

### 10.1 `notas_fiscais`
```sql
ALTER TABLE notas_fiscais
  ADD COLUMN corpo_nota_id INT NULL,
  ADD CONSTRAINT fk_nf_corpo_nota
    FOREIGN KEY (corpo_nota_id) REFERENCES corpos_nota(id)
    ON DELETE SET NULL,
  ADD UNIQUE INDEX uq_nf_corpo_nota (corpo_nota_id);
```

**Motivo:** 1:1 entre CorpoNota e NotaFiscal. O UNIQUE garante que um corpo não pode ser vinculado a duas notas diferentes. O SET NULL preserva a nota fiscal se o corpo for excluído.

### 10.2 `boletos`
```sql
ALTER TABLE boletos
  ADD COLUMN corpo_nota_id INT NULL,
  ADD CONSTRAINT fk_boleto_corpo_nota
    FOREIGN KEY (corpo_nota_id) REFERENCES corpos_nota(id)
    ON DELETE SET NULL,
  ADD INDEX ix_boleto_corpo_nota (corpo_nota_id);
```

**Motivo:** Permite rastrear que um boleto pertence a um ciclo específico, mesmo quando o vínculo via nota fiscal não é suficiente. Não é UNIQUE porque uma nota pode ter múltiplas parcelas (vários boletos por corpo).

---

## 11. Modelagem dos Relacionamentos

```
Condominio (1)──────────────(0..1) ContratoCondominio
Condominio (1)──────────────(N) CicloNota
CicloNota (1)───────────────(N) CorpoNota
CorpoNota (0..1)────────────(1) ManutencaoAssistencia   [OS vinculada]
CorpoNota (0..1)────────────(0..1) NotaFiscal            [após XML]
CorpoNota (0..1)────────────(0..1) TermoGarantia
NotaFiscal (1)──────────────(N) Boleto
Boleto (0..N)───────────────(0..1) CorpoNota             [FK direto para rastreio]

ConfiguracaoImpostosServico  →  lida por ImpostoService  →  usada por CorpoNotaService
```

**Invariante crítica:** `corpos_nota.condominio_id` deve sempre ser igual a `ciclos_nota.condominio_id` do ciclo ao qual pertence. Validar no service, nunca confiar só no FK.

---

## 12. Regras de Negócio

### 12.1 Contrato
**Regra central: o contrato é um marcador simples — o condomínio tem ou não tem.** As operações são exatamente quatro:
1. **Criar** — INSERT quando não existe (UNIQUE por `condominio_id` garante no máximo um)
2. **Editar** — UPDATE em `data_inicio` e `data_termino` somente
3. **Ativar/Desativar** — UPDATE `ativo = True/False` (toggle, sem efeito em outras operações)
4. **Excluir** — soft delete via `registrar_exclusao()` + `deletado_em = now()`

Contrato inativo **não bloqueia** nenhuma operação — é apenas informação visual para o operador. Nenhuma validação de vigência de datas nesta fase.

### 12.2 Ciclo Mensal
- `ciclos_nota` é o "mês de referência" — identifica exatamente um mês por condomínio/tipo. **Não confundir com `corpos_nota`.**
- Ciclo é identificado por `(condominio_id, tipo_nota, ano, mes)` — UNIQUE no banco
- Ao criar um CorpoNota, o service verifica se existe ciclo; se não existir, cria automaticamente
- Um ciclo pode ter múltiplos corpos (ex: nota cancelada → recriada), mas o `status_ciclo` reflete o estado do corpo mais avançado
- `PENDENTE` = nenhum corpo criado ainda | `EM_ANDAMENTO` = há corpo em status intermediário | `CONCLUIDO` = corpo atingiu PAGO

### 12.3 Corpo da Nota — Criação
- Só pode existir um CorpoNota não-cancelado por ciclo (PENDENTE→PAGO) — validar no service
- Se o operador precisar recriar, deve cancelar o anterior primeiro
- `preenchimento_manual = True` é setado automaticamente quando qualquer campo crítico não veio da OS

### 12.4 Corpo da Nota — Cálculo
- Percentuais vêm de `ConfiguracaoImpostosServico` (tabela existente)
- Valores calculados: `valor_X = valor_bruto * (percentual_X / 100)`
- `valor_liquido = valor_bruto - (valor_inss + valor_cofins + valor_pis + valor_csll)`
- Armazenar todos os percentuais no corpo no momento da criação (snapshot) — não referenciar a tabela depois

### 12.5 Vínculo com XML
- Vínculo automático exige: CNPJ do condomínio bate com o XML E tipo E mês/ano E (numero_os bate se disponível)
- Se 0 candidatos → importa a nota normalmente, sem vínculo. Operador vincula manualmente depois pelo detalhe do corpo.
- Se 1 candidato → vincula automaticamente → atualiza status do corpo para XML_VINCULADO
- **[OBRIGATÓRIO]** Se 2+ candidatos → **NÃO vincular automaticamente**. O sistema **DEVE** exibir a lista de candidatos (CNPJ + mês/ano + numero_os) para seleção manual pelo operador. Este fallback é obrigatório — não pode ser silenciado ou ignorado.
- Vincular = setar `notas_fiscais.corpo_nota_id = corpo.id` E `corpos_nota.nota_fiscal_id = nf.id` E atualizar status

### 12.6 Soft Delete
- Chamar `registrar_exclusao(db, tabela, id, snapshot_json, usuario)` antes de qualquer delete
- Setar `deletado_em = now()` no registro
- Nunca fazer DELETE físico em CorpoNota, CicloNota ou ContratoCondominio

### 12.7 Garantia
- Campo `tem_garantia` e `termo_garantia_id` existem no modelo
- Nesta fase: apenas setar o flag; sem UI específica além de uma checkbox
- Integração com `TermoGarantia` já existente é opcional nesta fase

---

## 13. Estratégia de Cálculo de Impostos

### Problema atual
O cálculo está duplicado: `boleto_service._calcular_valor_liquido()` e qualquer lógica futura no CorpoNotaService calculariam separado, podendo divergir.

### Solução: `ImpostoService`

**Arquivo:** `backend/app/services/imposto_service.py` — **NOVO**

**Responsabilidade:** único ponto de cálculo de impostos para MANUTENCAO/ASSISTENCIA.

**Método principal:**
```
calcular_impostos(db, valor_bruto, percentuais_override=None) → ImpostosCalculados
```
onde `ImpostosCalculados` é um dataclass/schema com: `percentual_inss`, `percentual_cofins`, `percentual_pis`, `percentual_csll`, `valor_inss`, `valor_cofins`, `valor_pis`, `valor_csll`, `valor_liquido`.

**Fonte dos percentuais:**
1. Se `percentuais_override` fornecido → usa esses (caso: reimportar nota com percentuais diferentes)
2. Senão → lê `ConfiguracaoImpostosServico` (primeira linha ativa)

**Uso:**
- `CorpoNotaService` chama `ImpostoService.calcular_impostos()` ao criar/editar corpo
- `boleto_service._calcular_valor_liquido()` passa a chamar `ImpostoService` internamente

**Migração:** `boleto_service` existente não quebra — apenas refatora internamente para chamar `ImpostoService`. Sem mudança de assinatura externa.

---

## 14. Estratégia de Geração do Corpo da Nota

O "corpo da nota" é um **texto estruturado** gerado a partir dos dados do CorpoNota e armazenado no campo `conteudo_gerado`.

### Template de Manutenção (baseado no documento de referência)

O texto segue esta estrutura:
```
[Nome do Condomínio]
Referente ao mês de [MÊS/ANO]

Serviços prestados: [descricao_servico]
OS nº: [numero_os]
Data de execução: [data_servico]

Valor bruto: R$ [valor_bruto]
(-) INSS [percentual_inss]%: R$ [valor_inss]
(-) COFINS [percentual_cofins]%: R$ [valor_cofins]
(-) PIS [percentual_pis]%: R$ [valor_pis]
(-) CSLL [percentual_csll]%: R$ [valor_csll]

Valor líquido: R$ [valor_liquido]
Vencimento: [data_vencimento]

[observacoes se houver]
```

### Geração
- **Quando:** ao salvar o CorpoNota com status `GERADO`
- **Onde:** `CorpoNotaService._gerar_conteudo(corpo: CorpoNota, condominio: Condominio) → str`
- **Armazenamento:** campo `conteudo_gerado` TEXT no banco
- **Regeneração:** permitida enquanto status < `XML_VINCULADO`

### Preview
- Endpoint `GET /api/v1/corpos-nota/preview` aceita os dados do formulário e retorna o texto sem salvar
- Frontend renderiza o preview em `<pre>` ou componente formatado antes do save final

---

## 15. Estratégia de Preenchimento Automático via OS

### Fluxo no service ao criar CorpoNota

1. Recebe `condominio_id`, `ano`, `mes`, `tipo_nota` (+ dados manuais opcionais)
2. Busca no banco: `ManutencaoAssistencia WHERE condominio_id = X AND MONTH(data_servico) = mes AND YEAR(data_servico) = ano AND tipo = 'manutencao' AND nota_fiscal_id IS NULL ORDER BY data_servico DESC LIMIT 1`
3. Se encontrada → preenche automaticamente: `numero_os`, `data_servico`, `descricao_servico`, e seta `servico_id`
4. Se não encontrada → campos ficam vazios para preenchimento manual; seta `preenchimento_manual = True`
5. Busca `ConfiguracaoImpostosServico` → preenche percentuais e calcula valores
6. Se `valor_bruto` não vier da OS (ManutencaoAssistencia não tem valor_bruto direto) → campo fica vazio para preenchimento manual

**Atenção:** `ManutencaoAssistencia` pode não ter o valor faturável (tem `valor_total` de orçamento, não de faturamento). O operador deve confirmar/inserir o `valor_bruto` no formulário.

### Fallback manual
- Qualquer campo que não vier da OS automaticamente é editável no formulário
- Frontend destaca visualmente quais campos foram auto-preenchidos vs manuais
- `preenchimento_manual` é setado como `True` se qualquer campo crítico foi inserido manualmente

---

## 16. Estratégia de Preenchimento Manual

- Todos os campos de `CorpoNota` são editáveis no formulário enquanto `status IN (PENDENTE, EM_MONTAGEM)`
- Após `GERADO`: ainda editável com regeneração do `conteudo_gerado`
- Após `XML_VINCULADO`: campos financeiros bloqueados (nota já existe); apenas `observacoes` editável
- O frontend deve:
  - Marcar com ícone/cor diferente os campos que vieram da OS automaticamente
  - Exibir aviso se nenhuma OS foi encontrada para o período
  - Permitir busca manual de OS por número ou data como alternativa

---

## 17. Estratégia de Vínculo com ZIP/XML

### Fluxo existente (preservado)
O endpoint `POST /api/v1/notas-fiscais/importar` em `nota_fiscal_router.py` já aceita ZIP/XML e chama `nota_fiscal_service.importar_xmls()`.

### Modificação necessária em `nota_fiscal_service.py`

Após criar o registro `NotaFiscal` durante a importação, chamar nova função:

```
_tentar_vincular_corpo_nota(db, nota_fiscal: NotaFiscal) → Optional[CorpoNota]
```

**Lógica de matching:**
```
1. Extrair CNPJ do emitente/tomador do XML → buscar Condominio pelo CNPJ
2. Se não encontrar condomínio → não pode vincular
3. Extrair mês/ano do XML (data_emissao ou data_competencia)
4. Extrair número da OS (regex em discriminação) → campo numero_os
5. Buscar CorpoNota:
   WHERE condominio_id = X
     AND tipo_nota = tipo_da_nota
     AND ciclo.mes = mes_xml AND ciclo.ano = ano_xml
     AND status IN ('PENDENTE','EM_MONTAGEM','GERADO')
     AND nota_fiscal_id IS NULL
     AND deletado_em IS NULL
   → Se numero_os disponível: filtrar também por numero_os
6. Se 0 resultados → retornar None (sem vínculo, continua import normal)
7. Se 1 resultado → vincular automaticamente:
   - notas_fiscais.corpo_nota_id = corpo.id
   - corpos_nota.nota_fiscal_id = nota.id
   - corpos_nota.status = 'XML_VINCULADO'
   - ciclos_nota.status_ciclo = 'EM_ANDAMENTO'
8. **[FALLBACK MANUAL OBRIGATÓRIO]** Se 2+ resultados → retornar lista de candidatos com: `id`, `condominio_nome`, `mes/ano`, `numero_os`, `status`. NÃO vincular automaticamente. O frontend DEVE exibir o `VincularManualModal` com essa lista. O operador seleciona e confirma. Esta etapa não pode ser pulada ou silenciada.
```

> **Por que o fallback é obrigatório:** o matching automático é conveniente mas ambíguo em casos de manutenções recorrentes ou OSs não capturadas no XML. A UI deve sempre oferecer vínculo manual em dois pontos: (a) durante importação quando há 2+ candidatos e (b) no detalhe do corpo via botão "Vincular nota" sempre que `nota_fiscal_id IS NULL`.

### Endpoint adicional para vínculo manual
```
POST /api/v1/corpos-nota/{corpo_id}/vincular-nota
Body: { nota_fiscal_id: int }
```

---

## 18. Estratégia de Vínculo com Boleto

### Fluxo
O boleto já é gerado via endpoint existente `POST /api/v1/boletos/gerar` com base em `nota_fiscal_id`.

### Integração com CorpoNota
1. Quando `boleto_service.gerar_boletos()` cria um boleto vinculado a uma `NotaFiscal` que tem `corpo_nota_id`, setar automaticamente `boleto.corpo_nota_id = nota.corpo_nota_id`
2. Atualizar `corpos_nota.status = 'BOLETO_GERADO'`

### Endpoint alternativo (para casos sem nota fiscal ainda)
Não previsto na Fase 1 — o boleto sempre vem depois da nota fiscal, que vem depois do XML.

### Dados do CorpoNota no fluxo de boleto
`boleto_service._preparar_dados_manutencao()` deve aceitar parâmetro opcional `corpo_nota: Optional[CorpoNota]`. Se fornecido:
- Usar `corpo_nota.descricao_servico` como `descricao_servicos`
- Usar `corpo_nota.numero_os` como `numero_os`
- Usar `corpo_nota.data_servico` como `data_execucao`
- Usar `corpo_nota.conteudo_gerado` como base do corpo do email

---

## 19. Estratégia de Controle de Pagamento

### Fonte da verdade
O pagamento já é controlado por `boletos.situacao = SituacaoBoleto` e `boletos.data_pagamento`. Não criar nova tabela de pagamento.

### Integração com CorpoNota
- Um scheduler ou endpoint de webhook já atualiza `boleto.situacao = LIQUIDADO` quando pago
- `boleto_service` existente deve, ao marcar boleto como LIQUIDADO, verificar `boleto.corpo_nota_id` e:
  - Se existe: atualizar `corpos_nota.status = 'PAGO'`
  - E se todos os boletos da nota estão LIQUIDADOS: atualizar `ciclos_nota.status_ciclo = 'CONCLUIDO'`

### Status do ciclo pelo pagamento
```
Qualquer boleto LIQUIDADO e corpo vinculado → corpo.status = PAGO
Todos os boletos da nota LIQUIDADOS → ciclo.status_ciclo = CONCLUIDO
```

---

## 20. Estratégia de Controle Mensal / Pendência por Ciclo

### Filosofia
- Cada (condominio, tipo, ano, mes) = 1 ciclo
- O ciclo existe independentemente do corpo — pode ser consultado como "lista de pendências"
- Um corpo cancelado não encerra o ciclo — o ciclo continua PENDENTE para o próximo corpo

### Listagem de pendências mensais
Endpoint para dashboard:
```
GET /api/v1/ciclos-nota?ano=2026&mes=5&status=PENDENTE
```
Retorna todos os condomínios que ainda não têm corpo gerado para o mês.

### Criação automática de ciclos
- Ciclos NÃO são criados automaticamente no início do mês (evitar lixo no banco)
- Ciclo é criado **on demand** pelo `CorpoNotaService` ao criar o primeiro corpo do período
- A lista de "pendências" pode ser derivada: condomínios com contrato ativo que ainda não têm ciclo para o mês = pendentes

### Histórico
- Ciclos antigos nunca são deletados
- Todos os corpos vinculados ao ciclo ficam no histórico
- Corpo cancelado: `status = CANCELADO`, `deletado_em = NULL` (não é soft-delete, só mudança de status)

---

## 21. Estratégia de Status da Nota (Máquina de Estados)

### Enum `StatusCorpoNota`
```
PENDENTE        → corpo criado mas sem dados suficientes para gerar
EM_MONTAGEM     → operador está editando
GERADO          → conteudo_gerado preenchido, pronto para envio ao emitente
XML_VINCULADO   → nota fiscal (ZIP/XML) foi vinculada
BOLETO_GERADO   → boleto criado
PAGO            → todos os boletos da nota liquidados (estado final do corpo)
CANCELADO       → corpo cancelado (o ciclo continua aberto para novo corpo)
```

> **Importante:** `CONCLUIDO` **não existe no corpo da nota**. O estado final do corpo é `PAGO`. O status `CONCLUIDO` pertence exclusivamente a `ciclos_nota.status_ciclo` e é atualizado quando o corpo vinculado ao ciclo atinge `PAGO`. Isso evita redundância e mantém responsabilidades separadas: o corpo controla seu próprio fluxo de documento; o ciclo controla o fechamento do mês.

### Transições permitidas
```
PENDENTE → EM_MONTAGEM        (ao começar edição)
EM_MONTAGEM → GERADO          (ao salvar com dados completos)
GERADO → XML_VINCULADO        (ao vincular nota fiscal)
XML_VINCULADO → BOLETO_GERADO (ao gerar boleto)
BOLETO_GERADO → PAGO          (ao liquidar boleto)
QUALQUER → CANCELADO          (pelo operador, exceto PAGO)
CANCELADO → PENDENTE          (recriação — novo corpo para o mesmo ciclo)
```

### Validação no service
Qualquer transição de status passa por `CorpoNotaService._validar_transicao(atual, novo) → bool`. Transições inválidas lançam `HTTPException(422)`.

---

## 22. Estrutura Backend

### Arquivos a CRIAR

```
backend/app/
├── models/
│   ├── contrato_condominio_model.py    ← ContratoCondominio ORM
│   ├── ciclo_nota_model.py             ← CicloNota ORM
│   └── corpo_nota_model.py             ← CorpoNota ORM + enums
├── repositories/
│   ├── contrato_repository.py          ← CRUD ContratoCondominio
│   ├── ciclo_nota_repository.py        ← CRUD + busca CicloNota
│   └── corpo_nota_repository.py        ← CRUD + busca CorpoNota
├── services/
│   ├── imposto_service.py              ← ImpostoService (extração do cálculo)
│   ├── contrato_service.py             ← ContratoService
│   ├── ciclo_nota_service.py           ← CicloNotaService
│   └── corpo_nota_service.py           ← CorpoNotaService (principal)
├── schemas/
│   ├── contrato_schema.py              ← ContratoCreate, ContratoResponse, ContratoUpdate
│   ├── ciclo_nota_schema.py            ← CicloNotaResponse
│   └── corpo_nota_schema.py            ← CorpoNotaCreate, CorpoNotaUpdate, CorpoNotaResponse, CorpoNotaPreview
└── routers/
    ├── contrato_router.py              ← /api/v1/contratos
    ├── ciclo_nota_router.py            ← /api/v1/ciclos-nota
    └── corpo_nota_router.py            ← /api/v1/corpos-nota
```

### Arquivos a MODIFICAR

```
backend/app/
├── models/
│   ├── nota_fiscal_model.py            ← ADD corpo_nota_id FK + UNIQUE
│   └── boleto_model.py                 ← ADD corpo_nota_id FK
├── services/
│   ├── boleto_service.py               ← Refatorar _calcular_valor_liquido para usar ImpostoService
│   │                                      ADD corpo_nota_id propagation ao criar boleto
│   │                                      ADD atualizar status corpo ao liquidar boleto
│   └── nota_fiscal_service.py          ← ADD _tentar_vincular_corpo_nota após importar XML
└── main.py                             ← ADD imports dos 3 novos models + 3 novos routers
```

### Arquivos a REUTILIZAR (sem modificação)

```
backend/app/
├── models/manutencoes_assistencias.py  ← fonte de dados para auto-fill
├── models/configuracao_model.py        ← ConfiguracaoImpostosServico
├── models/base_model.py               ← Base SQLAlchemy
├── core/database.py                   ← get_db, SessionLocal
├── core/security.py                   ← get_current_user
└── services/registros_exclusao_service.py ← registrar_exclusao()
```

---

## 23. Estrutura Frontend

### Páginas a CRIAR

```
cmport-front/app/
├── contratos/
│   └── page.tsx                        ← Lista de condomínios + status de contrato
├── corpos-nota/
│   ├── page.tsx                        ← Lista de ciclos/corpos (visão mensal)
│   ├── novo/
│   │   └── page.tsx                    ← Stepper: selecionar → preencher → preview → salvar
│   └── [id]/
│       └── page.tsx                    ← Detalhe do corpo: status, ações, vínculo XML, boleto
```

### Componentes a CRIAR

```
cmport-front/components/corpos-nota/
├── ContratoStatusBadge.tsx             ← Badge: "Contrato Ativo" / "Sem Contrato" / "Expirado"
├── ContratoForm.tsx                    ← Form: data_inicio, data_termino, ativo toggle
├── CorpoNotaStepper.tsx                ← Stepper wrapper (steps 1-4)
├── StepSelecionarCondominio.tsx        ← Busca condomínio + mostra badge de contrato
├── StepSelecionarOS.tsx                ← Exibe OS encontrada ou formulário manual
├── StepPreencherCorpo.tsx              ← Formulário completo (campos auto + manuais)
├── StepPreviewConfirmar.tsx            ← Preview do conteudo_gerado + botão salvar
├── CorpoNotaStatusBadge.tsx            ← Badge colorido por status
├── VincularXmlButton.tsx               ← Botão + modal para upload/vínculo do ZIP/XML
├── VincularManualModal.tsx             ← Seletor de nota fiscal candidata (matching manual)
├── CicloMensalCard.tsx                 ← Card de resumo do ciclo para a lista mensal
└── HistoricoCorpoNota.tsx              ← Timeline de mudanças de status
```

### Arquivos a MODIFICAR

```
cmport-front/
├── lib/
│   └── api.ts                          ← ADD funções de API para corpos-nota, contratos, ciclos
├── app/condominios/
│   └── [id]/page.tsx (ou similar)      ← ADD seção de contrato no detalhe do condomínio
└── app/notas-fiscais/
    └── page.tsx (ou importar)          ← ADD trigger de matching após import ZIP/XML
```

### Interfaces TypeScript a CRIAR (`lib/types.ts` ou arquivo dedicado)

```typescript
interface ContratoCondominio {
  id: number
  condominio_id: number
  ativo: boolean
  data_inicio: string        // ISO date
  data_termino: string | null
  criado_em: string
}

interface CicloNota {
  id: number
  condominio_id: number
  tipo_nota: 'MANUTENCAO' | 'SERVICO' | 'PRODUTO'
  ano: number
  mes: number
  status_ciclo: 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO'
}

type StatusCorpoNota =
  | 'PENDENTE' | 'EM_MONTAGEM' | 'GERADO'
  | 'XML_VINCULADO' | 'BOLETO_GERADO' | 'PAGO'
  | 'CANCELADO'
// CONCLUIDO não existe no corpo — pertence a ciclos_nota.status_ciclo

interface CorpoNota {
  id: number
  ciclo_id: number
  condominio_id: number
  tipo_nota: 'MANUTENCAO' | 'SERVICO' | 'PRODUTO'
  servico_id: number | null
  numero_os: string | null
  data_servico: string | null
  descricao_servico: string | null
  valor_bruto: number | null
  percentual_inss: number | null
  percentual_cofins: number | null
  percentual_pis: number | null
  percentual_csll: number | null
  valor_inss: number | null
  valor_cofins: number | null
  valor_pis: number | null
  valor_csll: number | null
  valor_liquido: number | null
  data_vencimento: string | null
  mes_referencia: string | null
  observacoes: string | null
  preenchimento_manual: boolean
  status: StatusCorpoNota
  nota_fiscal_id: number | null
  tem_garantia: boolean
  termo_garantia_id: number | null
  conteudo_gerado: string | null
  criado_em: string
}

interface CorpoNotaCreate {
  condominio_id: number
  tipo_nota: 'MANUTENCAO' | 'SERVICO' | 'PRODUTO'
  ano: number
  mes: number
  servico_id?: number
  numero_os?: string
  data_servico?: string
  descricao_servico?: string
  valor_bruto?: number
  data_vencimento?: string
  observacoes?: string
  tem_garantia?: boolean
}
```

---

## 24. APIs Necessárias

### Contratos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/v1/contratos` | Listar contratos (com filtro opcional por condominio_id) |
| GET | `/api/v1/contratos/{condominio_id}` | Contrato de um condomínio |
| POST | `/api/v1/contratos` | Criar/atualizar contrato (upsert) |
| PATCH | `/api/v1/contratos/{id}/toggle` | Liga/desliga ativo |
| DELETE | `/api/v1/contratos/{id}` | Soft delete |

### Ciclos de Nota

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/v1/ciclos-nota` | Listar ciclos (filtros: ano, mes, tipo, status, condominio_id) |
| GET | `/api/v1/ciclos-nota/{id}` | Detalhe de um ciclo + corpos vinculados |

### Corpos de Nota

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/v1/corpos-nota` | Listar corpos (filtros: status, condominio_id, ciclo_id) |
| GET | `/api/v1/corpos-nota/{id}` | Detalhe de um corpo |
| POST | `/api/v1/corpos-nota` | Criar corpo (dispara auto-fill da OS) |
| PATCH | `/api/v1/corpos-nota/{id}` | Editar campos |
| PATCH | `/api/v1/corpos-nota/{id}/status` | Atualizar status (com validação de transição) |
| POST | `/api/v1/corpos-nota/preview` | Retorna conteudo_gerado sem salvar |
| POST | `/api/v1/corpos-nota/{id}/vincular-nota` | Vincular nota fiscal manualmente |
| DELETE | `/api/v1/corpos-nota/{id}` | Soft delete (somente PENDENTE/CANCELADO) |
| GET | `/api/v1/corpos-nota/buscar-os` | Busca OS disponíveis para um condomínio/mês |

---

## 25. DTOs e Schemas

### `contrato_schema.py`

```
ContratoCreate:
  condominio_id: int
  ativo: bool = True
  data_inicio: date
  data_termino: Optional[date] = None

ContratoUpdate:
  ativo: Optional[bool]
  data_inicio: Optional[date]
  data_termino: Optional[date]

ContratoResponse:
  id, condominio_id, ativo, data_inicio, data_termino, criado_em, atualizado_em
```

### `ciclo_nota_schema.py`

```
CicloNotaResponse:
  id, condominio_id, tipo_nota, ano, mes, status_ciclo, criado_em
  corpos: List[CorpoNotaResumo]  ← lista resumida dos corpos

CicloNotaResumo:
  id, condominio_id, tipo_nota, ano, mes, status_ciclo
```

### `corpo_nota_schema.py`

```
CorpoNotaCreate:
  condominio_id, tipo_nota, ano, mes
  servico_id?, numero_os?, data_servico?, descricao_servico?
  valor_bruto?, data_vencimento?, observacoes?, tem_garantia?

CorpoNotaUpdate:
  numero_os?, data_servico?, descricao_servico?
  valor_bruto?, data_vencimento?, observacoes?
  percentual_inss?, percentual_cofins?, percentual_pis?, percentual_csll?
  tem_garantia?, termo_garantia_id?

CorpoNotaStatusUpdate:
  status: StatusCorpoNota
  motivo?: str  ← obrigatório para CANCELADO

CorpoNotaResponse:
  todos os campos do modelo
  condominio: CondominioResumo  ← embedded
  ciclo: CicloNotaResumo
  nota_fiscal: Optional[NotaFiscalResumo]

CorpoNotaPreviewRequest:
  mesmos campos de CorpoNotaCreate + dados de valor e impostos

CorpoNotaPreviewResponse:
  conteudo_gerado: str
  impostos_calculados: ImpostosCalculados

ImpostosCalculados:
  percentual_inss, percentual_cofins, percentual_pis, percentual_csll
  valor_inss, valor_cofins, valor_pis, valor_csll, valor_liquido

VincularNotaRequest:
  nota_fiscal_id: int
```

---

## 26. Validações

### Backend (service layer)

| Validação | Onde | Erro |
|-----------|------|------|
| Ciclo duplicado (condominio+tipo+ano+mes) | CorpoNotaService.criar | 409 Conflict |
| Corpo não-cancelado já existe no ciclo | CorpoNotaService.criar | 409 Conflict |
| Transição de status inválida | CorpoNotaService._validar_transicao | 422 |
| Editar corpo com status >= XML_VINCULADO (campos financeiros) | CorpoNotaService.atualizar | 403 |
| vincular_nota: nota_fiscal já tem corpo vinculado | CorpoNotaService.vincular | 409 |
| vincular_nota: nota fiscal é de condomínio diferente | CorpoNotaService.vincular | 422 |
| Soft delete de corpo com status PAGO | CorpoNotaService.deletar | 403 |
| Contrato: upsert (não criar duplicata) | ContratoService.criar_ou_atualizar | tratado |
| data_termino < data_inicio | ContratoService | 422 |
| mes deve ser 1-12 | schema CicloNotaCreate | 422 |
| ano deve ser >= 2020 | schema | 422 |

### Frontend (TypeScript)

- `valor_bruto` > 0 (obrigatório para GERADO)
- `data_vencimento` >= hoje
- `data_servico` <= hoje
- `data_termino` >= `data_inicio` no contrato
- `mes` 1-12 (select options garantem)

---

## 27. Auditoria e Histórico

### Soft Delete
Todos os models novos têm `deletado_em: Optional[DateTime]`. Ao excluir:
1. Chamar `registrar_exclusao(db, tabela="corpos_nota", registro_id=id, snapshot_json=..., excluido_por=user.nome)`
2. Setar `deletado_em = datetime.utcnow()`
3. Nunca fazer DELETE físico

### Histórico de Status — Fase 1 (simplificado)
Na Fase 1, **não será criada uma tabela separada de histórico de status**. A rastreabilidade é garantida por:

1. `corpos_nota.status` — estado atual do corpo
2. `corpos_nota.atualizado_em` — timestamp da última mudança
3. `corpos_nota.criado_por` — quem criou
4. `corpos_nota.deletado_em` — quando foi excluído (soft delete)
5. `registros_exclusoes` — snapshot JSON completo no momento do soft delete

Isso é suficiente para o uso diário. O operador consegue ver em que estado o corpo está e quando foi modificado pela última vez.

> **Fase 2:** se a equipe precisar de trilha completa de quem mudou o status e quando (ex: auditoria regulatória), criar `historico_status_corpo_nota` com campos: `corpo_nota_id`, `status_anterior`, `status_novo`, `alterado_em`, `alterado_por`, `motivo`. Não implementar agora para não adicionar complexidade sem uso imediato.

### Auditoria de Vínculo
Quando `_tentar_vincular_corpo_nota()` é chamado com sucesso, registrar via `print`/`logging.info` no backend:
```
INFO: CorpoNota {id} vinculado automaticamente à NotaFiscal {nf_id}
```
Log é suficiente para rastrear vinculos nesta fase.

---

## 28. Estratégia de Migração

### Princípio
O CMPort usa `Base.metadata.create_all()` no startup para criar novas tabelas. Para colunas novas em tabelas existentes, usa `_run_migrations()` com `ALTER TABLE` idempotentes.

### Passos de migração

**Passo 1 — Novas tabelas (automático via create_all):**
- `contratos_condominio` — criada automaticamente ao importar o model
- `ciclos_nota` — criada automaticamente
- `corpos_nota` — criada automaticamente
- ~~`historico_status_corpo_nota`~~ — **adiado para Fase 2** (ver seção 27)

**Passo 2 — Colunas novas em tabelas existentes (via `_run_migrations()`):**

```python
# Em main.py → _run_migrations()

# Adicionar corpo_nota_id em notas_fiscais
"ALTER TABLE notas_fiscais ADD COLUMN corpo_nota_id INT NULL"
"ALTER TABLE notas_fiscais ADD CONSTRAINT fk_nf_corpo_nota FOREIGN KEY (corpo_nota_id) REFERENCES corpos_nota(id) ON DELETE SET NULL"
"ALTER TABLE notas_fiscais ADD UNIQUE INDEX uq_nf_corpo_nota (corpo_nota_id)"

# Adicionar corpo_nota_id em boletos
"ALTER TABLE boletos ADD COLUMN corpo_nota_id INT NULL"
"ALTER TABLE boletos ADD CONSTRAINT fk_boleto_corpo_nota FOREIGN KEY (corpo_nota_id) REFERENCES corpos_nota(id) ON DELETE SET NULL"
"ALTER TABLE boletos ADD INDEX ix_boleto_corpo_nota (corpo_nota_id)"
```

Cada ALTER deve ser envolvido em try/except para ser idempotente (ignorar `Duplicate column name`).

**Passo 3 — Seeds:** Nenhum seed necessário para as novas tabelas.

**Passo 4 — Dados existentes:** Notas fiscais e boletos existentes ficam com `corpo_nota_id = NULL`. Isso é correto — eles existiam antes do módulo.

---

## 29. Estratégia de Testes

### Backend

**Unitários (pytest):**
- `ImpostoService.calcular_impostos()` com vários valores e percentuais
- `CorpoNotaService._validar_transicao()` para todas as combinações válidas e inválidas
- `CorpoNotaService._gerar_conteudo()` com dados completos e com campos nulos
- `ContratoService.criar_ou_atualizar()` — upsert, toggle, soft delete
- `_tentar_vincular_corpo_nota()` — matching exato, sem match, múltiplos candidatos

**Integração (banco real):**
- Criar ciclo ao criar corpo
- Criar corpo com auto-fill da OS
- Ciclo único por (condominio, tipo, ano, mes)
- Vincular nota fiscal ao corpo + atualizar status
- Propagação de corpo_nota_id ao criar boleto
- Atualização de status ao liquidar boleto

### Frontend

**TypeScript:** `npx tsc --noEmit` deve passar sem erros (obrigatório antes de commitar).

**Lint:** `npm run lint` deve passar sem erros.

**Manual (golden path):**
1. Criar contrato para um condomínio
2. Abrir "Novo Corpo da Nota" → selecionar condomínio (ver badge de contrato)
3. Verificar auto-fill da OS
4. Editar campos manualmente
5. Ver preview
6. Salvar → status GERADO
7. Importar ZIP/XML → verificar vínculo automático
8. Verificar status XML_VINCULADO
9. Gerar boleto → verificar status BOLETO_GERADO
10. Simular pagamento → verificar status PAGO

---

## 30. Ordem Ideal de Implementação

### Fase A — Base (backend, sem dependência entre si)
1. `imposto_service.py` — extrair cálculo (refatorar `boleto_service` para usar)
2. Novos models: `contrato_condominio_model.py`, `ciclo_nota_model.py`, `corpo_nota_model.py`
3. Registrar novos models em `main.py` (imports + create_all funciona)
4. `_run_migrations()` em `main.py` para as FKs nas tabelas existentes

### Fase B — Repositories
5. `contrato_repository.py`
6. `ciclo_nota_repository.py`
7. `corpo_nota_repository.py`

### Fase C — Services
8. `contrato_service.py`
9. `ciclo_nota_service.py`
10. `corpo_nota_service.py` (depende dos repositories + ImpostoService)

### Fase D — Schemas + Routers
11. `contrato_schema.py` + `contrato_router.py`
12. `ciclo_nota_schema.py` + `ciclo_nota_router.py`
13. `corpo_nota_schema.py` + `corpo_nota_router.py`
14. Registrar routers em `main.py`

### Fase E — Integrações backend existentes
15. Modificar `nota_fiscal_service.py` → adicionar `_tentar_vincular_corpo_nota()`
16. Modificar `nota_fiscal_model.py` → adicionar `corpo_nota_id`
17. Modificar `boleto_model.py` → adicionar `corpo_nota_id`
18. Modificar `boleto_service.py` → propagar `corpo_nota_id` + atualizar status ao liquidar

### Fase F — Frontend
19. Interfaces TypeScript e funções de API (`lib/types.ts`, `lib/api.ts`)
20. Componentes base: `ContratoStatusBadge`, `CorpoNotaStatusBadge`
21. Página de contratos (`contratos/page.tsx`)
22. Stepper de criação do corpo (componentes + `corpos-nota/novo/page.tsx`)
23. Lista de ciclos/corpos (`corpos-nota/page.tsx`)
24. Detalhe do corpo (`corpos-nota/[id]/page.tsx`)
25. Integrar vínculo XML no fluxo de importação de notas fiscais

### Fase G — Testes e ajustes
26. Testes unitários do `ImpostoService` e máquina de estados
27. Golden path manual completo
28. `npx tsc --noEmit` + lint
29. Deploy em VPS

---

## 31. Riscos Técnicos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Matching XML falha: condomínio sem CNPJ cadastrado | Alta | Alto | Validar CNPJ nos condominios antes de ativar matching |
| Ciclo duplicado por race condition (dois requests simultâneos) | Baixa | Alto | UNIQUE INDEX no banco + tratamento de IntegrityError no service |
| `boleto_service` refatoração quebra fluxo existente | Média | Alto | Refatorar somente a parte interna; manter assinatura pública idêntica |
| `nota_fiscal_model.py` ADD COLUMN em produção com dados existentes | Média | Médio | ALTER TABLE é non-destructive; coluna nullable |
| Frontend TypeScript: tipo CorpoNota desatualizado vs backend | Média | Médio | Gerar types a partir dos schemas Pydantic (ou definir manualmente com cuidado) |
| OS não encontrada para o mês → operador confuso | Alta | Baixo | UI clara: "Nenhuma OS encontrada. Preencha manualmente." |
| Dois corpos para o mesmo ciclo (bug de UI) | Média | Médio | Validação no service: 409 se já existe corpo não-cancelado |

---

## 32. Possíveis Problemas Futuros

| Problema | Contexto | Observação |
|----------|----------|------------|
| OS tem múltiplas visitas no mesmo mês | Manutenção pode ter 2+ visitas/mês | Futuro: permitir múltiplas OS por corpo |
| Nota com valor diferente do corpo | Emitente pode alterar valor | Futuro: campo `valor_divergencia` + alerta |
| Nota cancelada e reemitida | Emitente cancela e reemite XML | Futuro: status `XML_CANCELADO` no corpo |
| Parcelamento no corpo da nota | Hoje o corpo tem valor_liquido único | Futuro: vincular parcelas ao ciclo |
| Múltiplas competências em um XML | XML com período diferente do mês do corpo | Futuro: campo `mes_competencia` explícito no XML |
| SERVICO e PRODUTO | Fora do escopo Fase 1 | Arquitetura preparada: enum e tabelas suportam |
| Auditoria de quem alterou campos | Só quem mudou status é registrado | Futuro: log de todas as alterações de campo |

---

## 33. Estratégia de Escalabilidade

### Banco de dados
- Índices previstos cobrem os padrões de query mais frequentes: por condomínio, por ciclo, por status, por período
- `ciclos_nota` é a tabela de pivot — queries de dashboard devem usar ela como base, não `corpos_nota` diretamente
- Soft delete com `deletado_em` significa que queries de lista SEMPRE devem incluir `WHERE deletado_em IS NULL`

### Backend
- `ImpostoService` é stateless — pode ser chamado de qualquer context sem estado global
- `CorpoNotaService` não mantém estado entre requests — escalável horizontalmente
- Matching XML é síncrono na importação → se volume aumentar, extrair para tarefa assíncrona (Celery/BackgroundTasks)

### Frontend
- Stepper é componentizado → cada step pode evoluir independentemente
- Interfaces TypeScript centralizadas em `lib/types.ts` → mudança de schema propaga consistentemente

### Dados históricos
- Ciclos e corpos antigos nunca são deletados → crescimento linear com o tempo
- Futuramente: particionamento por ano no MySQL para ciclos e histórico de status

---

## 34. Checklist Final

### Antes de começar a implementar
- [ ] Ler este documento inteiro
- [ ] Verificar que `Base.metadata.create_all()` está em `main.py`
- [ ] Verificar padrão de `_run_migrations()` no `main.py` existente
- [ ] Confirmar estrutura de `registrar_exclusao()` no projeto
- [ ] Confirmar estrutura de `get_current_user` para injeção de auth

### Backend — Models
- [ ] `contrato_condominio_model.py` criado com UNIQUE INDEX
- [ ] `ciclo_nota_model.py` criado com UNIQUE constraint (condominio, tipo, ano, mes)
- [ ] `corpo_nota_model.py` criado com todos os campos e enums (sem `CONCLUIDO` no StatusCorpoNota)
- [ ] Models importados em `main.py`

### Backend — Migrations
- [ ] `notas_fiscais.corpo_nota_id` adicionado via `_run_migrations()`
- [ ] `boletos.corpo_nota_id` adicionado via `_run_migrations()`
- [ ] FKs e índices corretos
- [ ] Idempotência garantida (try/except em cada ALTER)

### Backend — Repositories
- [ ] `contrato_repository.py` com get_by_condominio, upsert, soft_delete
- [ ] `ciclo_nota_repository.py` com get_or_create, list_by_periodo
- [ ] `corpo_nota_repository.py` com todos os CRUDs + busca por condominio/ciclo/status

### Backend — Services
- [ ] `imposto_service.py` extrai lógica de `boleto_service._calcular_valor_liquido()`
- [ ] `boleto_service` refatorado para usar `ImpostoService` internamente (sem quebrar API)
- [ ] `contrato_service.py` com upsert, toggle, soft_delete
- [ ] `ciclo_nota_service.py` com get_or_create
- [ ] `corpo_nota_service.py` com criar, editar, status, preview, auto-fill, vincular
- [ ] `nota_fiscal_service.py` com `_tentar_vincular_corpo_nota()` após import
- [ ] `boleto_service` propaga `corpo_nota_id` e atualiza status ao liquidar

### Backend — Schemas + Routers
- [ ] Schemas criados para contrato, ciclo, corpo (Create, Update, Response)
- [ ] Routers criados e registrados em `main.py`
- [ ] Nenhum router chama repository diretamente

### Frontend
- [ ] Interfaces TypeScript criadas em `lib/types.ts`
- [ ] Funções de API em `lib/api.ts` para todos os endpoints
- [ ] `npx tsc --noEmit` passa sem erros
- [ ] `npm run lint` passa sem erros
- [ ] Página de contratos funcional
- [ ] Stepper de novo corpo funcional (4 steps)
- [ ] Preview do corpo da nota renderiza corretamente
- [ ] Badge de contrato exibido na seleção de condomínio
- [ ] Lista de ciclos/corpos com filtros por mês/status
- [ ] Detalhe do corpo com data de última atualização de status visível
- [ ] Botão de vínculo XML funcional
- [ ] Modal de seleção manual de nota candidata funcional (`VincularManualModal`)
- [ ] Botão "Vincular nota" visível no detalhe quando `nota_fiscal_id IS NULL`

### Integração e testes
- [ ] Golden path completo testado manualmente (seção 29)
- [ ] Matching automático XML testado: caso único (vínculo auto) + caso ambíguo (modal manual)
- [ ] Liquidação de boleto atualiza status do corpo para PAGO e ciclo para CONCLUIDO
- [ ] Soft delete registra em `registros_exclusoes`
- [ ] `CONCLUIDO` não aparece em lugar nenhum no código do corpo (apenas no ciclo)
- [ ] Deploy em VPS sem erros de migration

---

## Domínios / Agentes e Responsabilidades

### `/backend`
**Responsabilidade:** Implementar todos os models, repositories, services e routers novos. Refatorar `boleto_service` e `nota_fiscal_service`.

**Arquivos que deve LER antes de começar:**
- `backend/app/main.py` — padrão de `_run_migrations()` e `include_router()`
- `backend/app/models/nota_fiscal_model.py` — ver FK patterns e enums
- `backend/app/models/boleto_model.py` — ver relações existentes
- `backend/app/services/boleto_service.py` — funções `_calcular_valor_liquido()` e `_preparar_dados_manutencao()`
- `backend/app/services/nota_fiscal_service.py` — função `importar_xmls()` e `extrair_numero_os()`
- `backend/app/services/registros_exclusao_service.py` — padrão de soft delete

**Ordem de implementação:** Fase A → B → C → D → E (ver seção 30)

---

### `/frontend`
**Responsabilidade:** Implementar todas as páginas e componentes. Garantir TypeScript sem erros.

**Arquivos que deve LER antes de começar:**
- `cmport-front/lib/api.ts` — padrão de funções de API
- `cmport-front/app/notas-fiscais/page.tsx` — ver padrão de listagem existente
- `cmport-front/app/boletos/page.tsx` — ver padrão de status e ações
- `cmport-front/lib/types.ts` (ou equivalente) — ver interfaces existentes

**Ordem de implementação:** Fase F (ver seção 30)

---

### `/nfe`
**Responsabilidade:** Modificar o fluxo de importação XML/ZIP para tentar vincular o corpo da nota após import.

**Arquivos que deve LER:**
- `backend/app/services/nota_fiscal_service.py` — especialmente `importar_xmls()` e `extrair_numero_os()`
- `backend/app/models/nota_fiscal_model.py`
- `backend/app/repositories/nota_fiscal_repository.py`

**Implementar:** `_tentar_vincular_corpo_nota(db, nota_fiscal)` e chamá-la após `db.commit()` da nova nota.

---

### `/boleto`
**Responsabilidade:** Integrar `corpo_nota_id` no fluxo de geração de boleto e atualizar status do corpo ao liquidar.

**Arquivos que deve LER:**
- `backend/app/services/boleto_service.py` — `_calcular_valor_liquido()`, `gerar_boletos()`, lógica de liquidação
- `backend/app/models/boleto_model.py`

**Implementar:**
1. Refatorar `_calcular_valor_liquido()` para chamar `ImpostoService`
2. Propagar `corpo_nota_id` ao criar boleto
3. Atualizar `corpos_nota.status` ao marcar boleto como LIQUIDADO

---

### `/orquestrador`
**Responsabilidade:** Coordenar a ordem de execução dos agentes acima para evitar conflitos.

**Ordem recomendada:**
1. `/backend` → Fase A (models + migrations)
2. `/backend` → Fase B + C (repositories + services)
3. `/nfe` e `/boleto` em paralelo (integração nos services existentes)
4. `/backend` → Fase D (schemas + routers)
5. `/frontend` → Fase F (páginas e componentes)
6. Testes integrados (golden path manual)
7. Deploy

**Conflitos a evitar:**
- `/nfe` e `/boleto` não devem modificar `main.py` ao mesmo tempo que `/backend`
- `/frontend` só deve começar após `/backend` Fase D ter endpoints funcionando
