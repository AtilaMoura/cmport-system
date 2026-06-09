Você é especialista no backend do módulo financeiro do CMPort (Fase 1).
Antes de agir, leia os arquivos relevantes. Nunca pule camadas. Nunca altere tabelas existentes.

## Arquivos principais
```
backend/app/models/fin_categoria_model.py
backend/app/models/fin_movimentacao_model.py
backend/app/models/fin_saldo_inicial_model.py
backend/app/schemas/fin_categoria_schema.py
backend/app/schemas/fin_movimentacao_schema.py
backend/app/schemas/fin_saldo_inicial_schema.py
backend/app/repositories/fin_categoria_repository.py
backend/app/repositories/fin_movimentacao_repository.py
backend/app/repositories/fin_saldo_inicial_repository.py
backend/app/services/fin_movimentacao_service.py
backend/app/services/inter_extrato_service.py
backend/app/routers/fin_movimentacao_router.py
backend/app/routers/fin_categoria_router.py
```

---

## Models — Campos Completos

### CategoriaFinanceira (`fin_categorias`)
```python
id           INT PK autoincrement
nome         String(100) NOT NULL
grupo        Enum('RECEITA','FORNECEDOR','DESPESA') NOT NULL
tipo         Enum('ENTRADA','SAIDA') NOT NULL  # derivado do grupo — RECEITA=ENTRADA, FORN/DESP=SAIDA
ativo        Boolean NOT NULL default=True
ordem        SmallInteger NOT NULL default=0   # ordem de exibição dentro do grupo
criado_em    DateTime server_default=now()

UNIQUE(nome, grupo)  # "Diversos" pode existir em FORNECEDOR e em DESPESA
INDEX(grupo), INDEX(ativo)
```

### MovimentacaoFinanceira (`fin_movimentacoes`)
```python
id                  INT PK autoincrement
data                Date NOT NULL               # data da transação (não do lançamento)
descricao           String(500) NOT NULL
valor               Numeric(10,2) NOT NULL      # SEMPRE positivo — sinal está em `tipo`
tipo                Enum('ENTRADA','SAIDA') NOT NULL
categoria_id        INT FK → fin_categorias.id  NULL  ON DELETE SET NULL
origem              Enum('BANCO','MANUAL') NOT NULL default='MANUAL'
status              Enum('PENDENTE','VALIDADO') NOT NULL default='PENDENTE'
id_externo_banco    String(100) NULL UNIQUE     # ID único do Inter — deduplicação
observacao          Text NULL
criado_em           DateTime server_default=now()
atualizado_em       DateTime server_default=now() onupdate=now()
deletado_em         DateTime NULL               # soft delete — NULL = ativo

INDEX(data), INDEX(tipo), INDEX(status), INDEX(origem)
INDEX(data, deletado_em)  # query principal de período
```

### SaldoInicial (`fin_saldo_inicial`)
```python
id            INT PK autoincrement
ano           SmallInteger NOT NULL
mes           TinyInteger NOT NULL   # 1-12
valor         Numeric(10,2) NOT NULL default=0.00
observacao    Text NULL
criado_em     DateTime server_default=now()
atualizado_em DateTime server_default=now() onupdate=now()

UNIQUE(ano, mes)
```

---

## Enums Python

```python
class GrupoCategoria(str, enum.Enum):
    RECEITA    = "RECEITA"
    FORNECEDOR = "FORNECEDOR"
    DESPESA    = "DESPESA"

class TipoMovimentacao(str, enum.Enum):
    ENTRADA = "ENTRADA"
    SAIDA   = "SAIDA"

class OrigemMovimentacao(str, enum.Enum):
    BANCO  = "BANCO"
    MANUAL = "MANUAL"

class StatusMovimentacao(str, enum.Enum):
    PENDENTE  = "PENDENTE"
    VALIDADO  = "VALIDADO"
```

---

## Seeds de Categorias

Inserir no startup se `COUNT(fin_categorias) == 0` — mesmo padrão das seeds de impostos.

```python
FIN_CATEGORIAS_SEED = [
    # RECEITAS (tipo ENTRADA)
    ("Contrato Manutenção","RECEITA","ENTRADA",1), ("Assistência","RECEITA","ENTRADA",2),
    ("Juros","RECEITA","ENTRADA",3), ("Rendimento","RECEITA","ENTRADA",4),
    ("Ajustes","RECEITA","ENTRADA",5), ("Outros Recebimentos","RECEITA","ENTRADA",6),

    # FORNECEDORES (tipo SAIDA) — empresas reais que o cliente paga por OS
    ("Center G","FORNECEDOR","SAIDA",1), ("Depósito Iracema","FORNECEDOR","SAIDA",2),
    ("Tugumi","FORNECEDOR","SAIDA",3), ("JT Thenário","FORNECEDOR","SAIDA",4),
    ("M&L","FORNECEDOR","SAIDA",5), ("ZN Distribuidora","FORNECEDOR","SAIDA",6),
    ("Porto Seg","FORNECEDOR","SAIDA",7), ("Speed Door","FORNECEDOR","SAIDA",8),
    ("Telman","FORNECEDOR","SAIDA",9), ("NSA","FORNECEDOR","SAIDA",10),
    ("Islene","FORNECEDOR","SAIDA",11), ("Mauricio Motores","FORNECEDOR","SAIDA",12),
    ("Metais Silva","FORNECEDOR","SAIDA",13), ("Linear","FORNECEDOR","SAIDA",14),
    ("Interseg","FORNECEDOR","SAIDA",15), ("Paulo Port","FORNECEDOR","SAIDA",16),
    ("LM Distribuidora","FORNECEDOR","SAIDA",17), ("PPA Leste","FORNECEDOR","SAIDA",18),
    ("Sinapar","FORNECEDOR","SAIDA",19), ("Aquarios","FORNECEDOR","SAIDA",20),
    ("2M2N","FORNECEDOR","SAIDA",21), ("Outros Fornecedores","FORNECEDOR","SAIDA",22),

    # DESPESAS (tipo SAIDA) — custos operacionais da empresa
    ("Salários","DESPESA","SAIDA",1), ("Adiantamento de Salário","DESPESA","SAIDA",2),
    ("Combustível — André","DESPESA","SAIDA",3), ("Combustível — Outro","DESPESA","SAIDA",4),
    ("Celular","DESPESA","SAIDA",5), ("Telefone/Fone","DESPESA","SAIDA",6),
    ("Internet","DESPESA","SAIDA",7), ("Contabilidade","DESPESA","SAIDA",8),
    ("Sindical","DESPESA","SAIDA",9), ("Impostos (FGTS/GPS/ISS)","DESPESA","SAIDA",10),
    ("Convênio","DESPESA","SAIDA",11), ("Sistema da Empresa","DESPESA","SAIDA",12),
    ("Seguro","DESPESA","SAIDA",13), ("Água/Luz","DESPESA","SAIDA",14),
    ("Aluguel","DESPESA","SAIDA",15), ("Escritório","DESPESA","SAIDA",16),
    ("Estacionamento/Zona Azul","DESPESA","SAIDA",17), ("Alimentação","DESPESA","SAIDA",18),
    ("Tarifa Bancária","DESPESA","SAIDA",19), ("Uber","DESPESA","SAIDA",20),
    ("Diversos","DESPESA","SAIDA",21),
]
```

---

## Endpoints

### Router `/api/v1/financeiro` (`fin_movimentacao_router.py`)

| Método | Rota | Função |
|---|---|---|
| GET | `/movimentacoes` | Listar com filtros: `mes`, `ano`, `tipo`, `grupo`, `categoria_id`, `origem`, `status` |
| POST | `/movimentacoes` | Criar movimentação manual |
| PUT | `/movimentacoes/{id}` | Editar categoria, status, descrição, valor, data |
| DELETE | `/movimentacoes/{id}` | Soft delete + `registrar_exclusao()` |
| POST | `/movimentacoes/{id}/validar` | Setar `status=VALIDADO` |
| GET | `/dashboard` | Totais do mês: entradas, saídas por grupo, saldo, saldo acumulado |
| POST | `/sincronizar-inter` | Buscar extrato Inter e salvar novas movimentações |
| GET | `/saldo-inicial/{ano}/{mes}` | Buscar saldo inicial (retorna 0 se não existe) |
| PUT | `/saldo-inicial/{ano}/{mes}` | Criar ou atualizar saldo inicial |

### Router `/api/v1/categorias-financeiras` (`fin_categoria_router.py`)

| Método | Rota | Função |
|---|---|---|
| GET | `/` | Listar — filtrável por `grupo`, `ativo` |
| POST | `/` | Criar categoria |
| PUT | `/{id}` | Editar nome, ordem |
| DELETE | `/{id}` | Desativar (setar `ativo=False`, não deletar) |

---

## Fórmula de Saldo (service)

```python
# Nunca gravar saldo acumulado — calcular sempre em runtime

def calcular_totais_mes(db, mes: int, ano: int) -> dict:
    movs = db.query(MovimentacaoFinanceira).filter(
        extract('month', data) == mes,
        extract('year',  data) == ano,
        deletado_em == None
    ).all()
    entradas = sum(m.valor for m in movs if m.tipo == 'ENTRADA')
    saidas   = sum(m.valor for m in movs if m.tipo == 'SAIDA')
    saldo_ini = db.query(SaldoInicial).filter_by(ano=ano, mes=mes).first()
    saldo_mes = (saldo_ini.valor if saldo_ini else 0) + entradas - saidas
    return {"entradas": entradas, "saidas": saidas, "saldo_mes": saldo_mes}

def calcular_saldo_acumulado(db, mes: int, ano: int) -> Decimal:
    # Soma todos os meses de janeiro até o mês atual no ano
    total = Decimal(0)
    for m in range(1, mes + 1):
        t = calcular_totais_mes(db, m, ano)
        total += t["saldo_mes"]
    return total
```

---

## Integração Inter — Extrato (`inter_extrato_service.py`)

O `InterClient` existente usa scope `boleto-cobranca.read boleto-cobranca.write`.
Para extrato, o scope é **diferente**: `extrato.read`.

Padrão: criar método separado no `InterClient` ou instanciar com scope distinto.

```python
# Opção recomendada — adicionar ao InterClient existente:
def _obter_token_extrato(self) -> Optional[str]:
    # Mesmo fluxo de _obter_token, mas scope="extrato.read"
    data = {"grant_type": "client_credentials", "scope": "extrato.read"}
    # ... mesmo código de requisição

def buscar_extrato(self, data_inicio: str, data_fim: str) -> list:
    # GET /banking/v3/extrato?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
    # Headers: Authorization Bearer <token_extrato>, x-conta-corrente
    # Retorna lista de transações com campos:
    # dataEntrada, tipo (CREDITO/DEBITO), valor, descricao, codigoTransacao (= id_externo_banco)
    ...

def buscar_saldo_inter(self) -> Decimal:
    # GET /banking/v3/saldo
    ...
```

**Serviço de sincronização:**
```python
def sincronizar_extrato(db, data_inicio, data_fim):
    client = _get_inter_client_extrato(db)  # usa ConfiguracaoInter ativa
    transacoes = client.buscar_extrato(data_inicio, data_fim)
    novas = 0
    duplicadas = 0
    for t in transacoes:
        existe = db.query(MovimentacaoFinanceira).filter_by(
            id_externo_banco=t['codigoTransacao']
        ).first()
        if existe:
            duplicadas += 1
            continue
        mov = MovimentacaoFinanceira(
            data=t['dataEntrada'],
            descricao=t['descricao'],
            valor=abs(t['valor']),
            tipo='ENTRADA' if t['tipo'] == 'CREDITO' else 'SAIDA',
            origem='BANCO',
            status='PENDENTE',
            id_externo_banco=t['codigoTransacao'],
        )
        db.add(mov)
        novas += 1
    db.commit()
    return {"novas": novas, "duplicadas": duplicadas}
```

**ATENÇÃO:** verificar se `extrato.read` está habilitado nas credenciais Inter antes de implementar.
Endpoint de teste: `GET /banking/v3/extrato?dataInicio=2026-05-01&dataFim=2026-05-01`

---

## Regras de Negócio

- `valor` sempre positivo no banco. O sinal está em `tipo`.
- Filtros obrigatórios no repository: `WHERE deletado_em IS NULL`.
- Ao deletar: chamar `registrar_exclusao(db, "fin_movimentacao", id, dados_json)` ANTES de setar `deletado_em`.
- `id_externo_banco` UNIQUE — se INSERT duplicar, capturar `IntegrityError` e contar como duplicata.
- Não deletar `fin_categorias` que têm movimentações — apenas desativar (`ativo=False`).
- Seeds inseridas apenas se `COUNT(fin_categorias) == 0` — nunca re-inserir.

---

## Registro no `__init__.py` e `main.py`

```python
# backend/app/models/__init__.py — adicionar:
from app.models.fin_categoria_model    import CategoriaFinanceira
from app.models.fin_movimentacao_model import MovimentacaoFinanceira
from app.models.fin_saldo_inicial_model import SaldoInicial

# backend/app/main.py — adicionar nos includes:
from app.routers.fin_movimentacao_router import router as fin_mov_router
from app.routers.fin_categoria_router    import router as fin_cat_router
app.include_router(fin_mov_router,  prefix="/api/v1/financeiro",            tags=["Financeiro"])
app.include_router(fin_cat_router,  prefix="/api/v1/categorias-financeiras", tags=["Financeiro"])
```

`Base.metadata.create_all(bind=engine)` cria as tabelas automaticamente. Tabelas existentes não são recriadas.
