from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional
from .model import TipoNota, StatusNota


# ---------------- BASE ----------------
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


# --------- CREATE MANUAL (FRONT) ---------
class NotaFiscalCreate(NotaFiscalBase):
    pass


# --------- USADO PELO SERVICE (IMPORTAÇÃO XML) ---------
class NotaFiscalImportada(NotaFiscalBase):
    xml_original: str
    status: StatusNota = StatusNota.AUTORIZADA  # ✅ Fix: campo status obrigatório


# --------- RESPONSE ---------
class NotaFiscalResponse(BaseModel):
    id: int
    numero_nota: str
    tipo: TipoNota
    status: StatusNota  # ✅ retorna status ao frontend
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


# --------- RESPOSTA DE IMPORTAÇÃO EM MASSA ---------
class ImportacaoResponse(BaseModel):
    processados: int
    canceladas: int = 0  # ✅ Fix: quantas canceladas foram bloqueadas
    erros: list[dict]


class NotaFiscalUpdate(BaseModel):
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    observacao: Optional[str] = None
    cliente_nome: Optional[str] = None

    model_config = {"from_attributes": True}