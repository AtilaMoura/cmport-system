from pydantic import BaseModel
from datetime import date
from typing import List, Optional


class FluxoFinanceiroLinha(BaseModel):
    origem_id: int
    condominio_id: Optional[int] = None
    condominio_nome: str
    numero_nota: str
    numero_nota_normalizado: str
    tipo: str  # MANUTENCAO | ASSISTENCIA | PRODUTO | RECIBO
    valor: float
    data_pagamento: date
    origem: str  # BOLETO | RECIBO
    banco_id: Optional[int] = None
    banco_nome: Optional[str] = None


class FluxoFinanceiroCnpj(BaseModel):
    cnpj: str
    razao_social: Optional[str] = None
    total_manutencao: float
    total_assistencia: float
    total_produto: float
    total_recibos: float
    total_geral: float
    linhas: List[FluxoFinanceiroLinha]


class FluxoFinanceiroResponse(BaseModel):
    ano: int
    mes: int
    cnpjs: List[FluxoFinanceiroCnpj]
    total_geral: float


class AlertaDuplicata(BaseModel):
    condominio_id: Optional[int] = None
    condominio_nome: str
    nota_id_1: int
    nota_id_2: int
    numero_nota_1: str
    numero_nota_2: str
    valor: float
    data_pagamento_1: date
    data_pagamento_2: date


class DispensarDuplicataRequest(BaseModel):
    nota_id_1: int
    nota_id_2: int


class AlertaNotaSemBoleto(BaseModel):
    nota_id: int
    numero_nota: str
    condominio_id: Optional[int] = None
    condominio_nome: str
    tipo: str
    valor: float
    data_vencimento: date
    cnpj_emitente: Optional[str] = None
    # True quando tipo=PRODUTO sem nota_vinculada_id -- causa provavel e' falta
    # de vinculo com a nota de Assistencia (que carrega o boleto combinado),
    # nao falta de boleto proprio. Ver NotaFiscalService.vincular_notas.
    possivel_falta_vinculo: bool = False


class DispensarNotaSemBoletoRequest(BaseModel):
    nota_id: int


class AlertaNotaSemServico(BaseModel):
    nota_id: int
    numero_nota: str
    condominio_id: Optional[int] = None
    condominio_nome: str
    tipo: str
    valor: float
    data_vencimento: date
    cnpj_emitente: Optional[str] = None


class DispensarNotaSemServicoRequest(BaseModel):
    nota_id: int


class AlertaParcelaFaltando(BaseModel):
    nota_id: int
    numero_nota: str
    condominio_id: Optional[int] = None
    condominio_nome: str
    tipo: str
    numero_parcela: int
    total_parcelas: int
    valor_parcela: float
    data_vencimento: date
    origem_data: str  # "corpo" | "nota" | "estimado"
    cnpj_emitente: Optional[str] = None


class DispensarParcelaFaltandoRequest(BaseModel):
    nota_id: int
    numero_parcela: int


class PendenciaLinha(BaseModel):
    origem_id: int
    origem: str  # BOLETO | RECIBO
    condominio_id: Optional[int] = None
    condominio_nome: str
    numero_nota: str
    numero_parcela: int
    total_parcelas: int
    tipo: str  # MANUTENCAO | ASSISTENCIA | PRODUTO | RECIBO
    valor: float
    data_vencimento: date
    data_pagamento: Optional[date] = None
    situacao: str  # PAGO | PENDENTE | VENCIDO
    valor_recebido: Optional[float] = None  # preenchido so quando situacao == PARCIAL
    valor_pendente: float  # valor - valor_recebido (PARCIAL); valor (nao pago); 0 (PAGO)


class PendenciasResponse(BaseModel):
    ano: int
    mes: int
    total: float
    total_pago: float
    total_pendente: float
    linhas: List[PendenciaLinha]
