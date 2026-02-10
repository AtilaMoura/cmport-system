from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional
from .model import TipoNota


# ---------------- BASE ----------------
class NotaFiscalBase(BaseModel):
    numero_nota: str
    tipo: TipoNota
    parcelas: int = 1
    valor: float
    data_vencimento: date
    cliente_nome: Optional[str] = None
    observacao: Optional[str] = None
    condominio_id: Optional[int] = None


# --------- CREATE MANUAL (FRONT) ---------
class NotaFiscalCreate(NotaFiscalBase):
    """
    Schema para criação manual via frontend
    Não requer o XML original
    """
    pass


# --------- USADO PELO SERVICE (IMPORTAÇÃO XML) ---------
class NotaFiscalImportada(NotaFiscalBase):
    """
    Schema para importação via XML
    Requer o XML completo armazenado
    """
    xml_original: str


# --------- RESPONSE ---------
class NotaFiscalResponse(BaseModel):
    """
    Schema de resposta da API
    Retorna todos os dados da nota
    """
    id: int
    numero_nota: str
    tipo: TipoNota
    parcelas: int
    valor: float
    data_vencimento: date
    data_pagamento: Optional[date] = None
    cliente_nome: Optional[str] = None
    observacao: Optional[str] = None
    condominio_id: Optional[int] = None
    criado_em: datetime

    model_config = {"from_attributes": True}


# --------- RESPOSTA DE IMPORTAÇÃO EM MASSA ---------
class ImportacaoResponse(BaseModel):
    """
    Retorno do endpoint de importação
    """
    processados: int
    erros: list[dict]