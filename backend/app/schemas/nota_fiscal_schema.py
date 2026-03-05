from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

from app.models.nota_fiscal_model import TipoNota, StatusNota


class NotaFiscalBase(BaseModel):
    numero_nota: str
    tipo: TipoNota
    parcelas: int = 1
    valor: float
    data_vencimento: date
    cliente_nome: Optional[str] = None
    observacao: Optional[str] = None
    descricao_servico: Optional[str] = None
    condominio_id: Optional[int] = None


class NotaFiscalCreate(NotaFiscalBase):
    pass


class NotaFiscalImportada(NotaFiscalBase):
    xml_original: str
    status: StatusNota = StatusNota.AUTORIZADA


class NotaFiscalResponse(BaseModel):
    id: int
    numero_nota: str
    tipo: TipoNota
    status: StatusNota
    parcelas: int
    valor: float
    data_vencimento: date
    data_pagamento: Optional[date] = None
    cliente_nome: Optional[str] = None
    observacao: Optional[str] = None
    descricao_servico: Optional[str] = None
    condominio_id: Optional[int] = None
    criado_em: datetime

    model_config = {"from_attributes": True}


class ImportacaoResponse(BaseModel):
    processados: int
    canceladas: int = 0
    erros: list[dict]


class NotaFiscalUpdate(BaseModel):
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    observacao: Optional[str] = None
    cliente_nome: Optional[str] = None

    model_config = {"from_attributes": True}
