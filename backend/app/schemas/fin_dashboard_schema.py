from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal


class EntradasBreakdown(BaseModel):
    boleto: Decimal = Decimal(0)         # boletos de serviço PAGO/BAIXADO/PARCIAL
    recibo: Decimal = Decimal(0)         # recibos ENTRADA PAGO sem nota
    avulso: Decimal = Decimal(0)         # fin_movimentacoes ENTRADA que não é transferência nem rendimento


class SaidasBreakdown(BaseModel):
    fornecedor:  Decimal = Decimal(0)
    despesa:     Decimal = Decimal(0)
    funcionario: Decimal = Decimal(0)    # folha — depende da migração Fase D2 pra ficar completa jan–jul
    tarifa:      Decimal = Decimal(0)    # tarifa bancária / juros / IOF / IR


class DashboardBancoLinha(BaseModel):
    banco_id:                 Optional[int] = None       # None = linha "Sem banco identificado" ou consolidado
    banco_nome:               str
    empresa:                  Optional[str] = None        # "CMPORT" | "TEC"
    saldo_inicial:            Optional[Decimal] = None    # None = não informado pra essa conta
    saldo_inicial_informado:  bool = False

    entradas:                 EntradasBreakdown = EntradasBreakdown()
    entradas_total:           Decimal = Decimal(0)
    transf_recebidas:         Decimal = Decimal(0)        # transferência interna que caiu nessa conta
    transf_enviadas:          Decimal = Decimal(0)        # transferência interna que saiu dessa conta
    rendimento:               Decimal = Decimal(0)

    saidas:                   SaidasBreakdown = SaidasBreakdown()
    saidas_total:             Decimal = Decimal(0)

    saldo_calculado:          Optional[Decimal] = None    # None quando não há saldo inicial
    saldo_extrato:            Optional[Decimal] = None
    saldo_extrato_fonte:      Optional[str] = None         # MANUAL | INTER
    diferenca:                Optional[Decimal] = None      # saldo_calculado - saldo_extrato
    bate:                     Optional[bool] = None         # |diferenca| < 0,02


class DashboardPorBancoResponse(BaseModel):
    ano:          int
    mes:          int
    bancos:       List[DashboardBancoLinha]                # contas ativas + "Sem banco identificado" (se houver)
    consolidado:  DashboardBancoLinha


# ── Dashboard "por CNPJ" (Fechamento do Fluxo separado por empresa) ───────────

class EntradasCnpjBreakdown(BaseModel):
    manutencao:       Decimal = Decimal(0)
    assistencia:      Decimal = Decimal(0)
    produto:          Decimal = Decimal(0)
    recibos:          Decimal = Decimal(0)
    rendimento:       Decimal = Decimal(0)   # rendimento de conta (entra no total pra bater com o extrato)
    transf_recebidas: Decimal = Decimal(0)   # transferência interna que caiu em conta desse CNPJ


class SaidasCnpjBreakdown(BaseModel):
    despesa:          Decimal = Decimal(0)
    fornecedor:       Decimal = Decimal(0)
    funcionario:      Decimal = Decimal(0)
    tarifa:           Decimal = Decimal(0)
    transf_enviadas:  Decimal = Decimal(0)   # transferência interna que saiu de conta desse CNPJ


class DashboardCnpjLinha(BaseModel):
    cnpj:            Optional[str] = None      # None = bloco "Sem CNPJ" / "Consolidado"
    razao_social:    str
    empresa:         Optional[str] = None      # "CMPORT" | "TEC" | None

    entradas:        EntradasCnpjBreakdown = EntradasCnpjBreakdown()
    entradas_total:  Decimal = Decimal(0)      # soma do breakdown de entradas
    saidas:          SaidasCnpjBreakdown = SaidasCnpjBreakdown()
    saidas_total:    Decimal = Decimal(0)      # soma do breakdown de saídas
    rendimento:      Decimal = Decimal(0)
    saldo_movimento: Decimal = Decimal(0)      # entradas_total + rendimento - saidas_total (fluxo do mês)

    # Conferência com o extrato (soma das contas desse CNPJ, do dashboard "por banco").
    # Só é conclusiva quando TODAS as contas do CNPJ têm saldo inicial E saldo do extrato.
    saldo_inicial:        Optional[Decimal] = None
    saldo_calculado:      Optional[Decimal] = None
    saldo_extrato:        Optional[Decimal] = None
    diferenca:            Optional[Decimal] = None   # saldo_calculado - saldo_extrato
    bate:                 Optional[bool]    = None   # |diferenca| < 0,02
    conferencia_completa: bool = False               # True só quando deu pra fechar a conta
    contas_sem_saldo:     List[str] = []             # contas sem saldo inicial e/ou extrato


class DashboardPorCnpjResponse(BaseModel):
    ano:          int
    mes:          int
    empresas:     List[DashboardCnpjLinha]              # uma por CNPJ configurado (ordem das configs)
    sem_cnpj:     Optional[DashboardCnpjLinha] = None   # entradas/saídas sem banco → sem CNPJ
    consolidado:  DashboardCnpjLinha                    # soma de empresas + sem_cnpj


# ── Lançamentos do período (fluxo detalhado com filtros avançados) ────────────

class LancamentoLinha(BaseModel):
    data:        str                       # ISO YYYY-MM-DD
    descricao:   str
    valor:       Decimal
    tipo:        str                       # ENTRADA | SAIDA | TRANSFERENCIA
    subtipo:     str                       # MANUTENCAO|ASSISTENCIA|PRODUTO|RECIBO|FORNECEDOR|DESPESA|FUNCIONARIO|TARIFA|RENDIMENTO|TRANSF_ENTRADA|TRANSF_SAIDA|AVULSO
    cnpj:        Optional[str] = None
    empresa:     Optional[str] = None      # "CMPORT" | "TEC" | None
    categoria:   Optional[str] = None
    banco_nome:  Optional[str] = None
    origem:      str                       # BOLETO | RECIBO | MOVIMENTACAO
    origem_id:   int


class LancamentosCnpjResumo(BaseModel):
    cnpj:        Optional[str] = None
    razao_social: str
    empresa:     Optional[str] = None
    entradas:    Decimal = Decimal(0)
    saidas:      Decimal = Decimal(0)
    saldo:       Decimal = Decimal(0)
    qtd:         int = 0


class LancamentosResponse(BaseModel):
    ano:         int
    mes_inicio:  int
    mes_fim:     int
    linhas:      List[LancamentoLinha]
    por_cnpj:    List[LancamentosCnpjResumo]
    consolidado: LancamentosCnpjResumo
