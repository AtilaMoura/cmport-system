from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

from app.models.boleto_model import TipoCobranca, SituacaoBoleto


class BoletoResponse(BaseModel):
    id: int
    nota_fiscal_id: int
    codigo_solicitacao: Optional[str]
    nosso_numero: Optional[str]
    seu_numero: Optional[str]
    valor_nominal: float
    valor_juros: float
    valor_multa: float
    valor_total_recebido: Optional[float]
    data_emissao: date
    data_vencimento: date
    data_pagamento: Optional[date]
    tipo_cobranca: TipoCobranca
    situacao: SituacaoBoleto
    criado_em: datetime

    model_config = {"from_attributes": True}


class GerarBoletosRequest(BaseModel):
    nota_ids: List[int]


class GerarBoletosResponse(BaseModel):
    sucesso: List[BoletoResponse]
    erros: List[dict]


class SincronizarResponse(BaseModel):
    atualizados: int
    erros: List[dict]
