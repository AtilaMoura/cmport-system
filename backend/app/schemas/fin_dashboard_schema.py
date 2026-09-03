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
