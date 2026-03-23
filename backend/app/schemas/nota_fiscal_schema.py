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
    # campos de impostos e parcelas (opcionais na importação)
    valor_boleto_parcela: Optional[float] = None
    parcelas_json: Optional[list] = None
    iss:    Optional[float] = None
    pis:    Optional[float] = None
    cofins: Optional[float] = None
    inss:   Optional[float] = None
    csll:   Optional[float] = None
    icms:   Optional[float] = None
    prev:   Optional[float] = None
    # descartado no schema (não persistido diretamente), mas aceito no dict dos parsers
    data_emissao: Optional[date] = None
    data_servico: Optional[date] = None
    numero_os:    Optional[str] = None


class NotaFiscalResponse(BaseModel):
    id: int
    numero_nota: str
    tipo: TipoNota
    status: StatusNota
    parcelas: int
    valor: float
    valor_boleto_parcela: Optional[float] = None
    parcelas_json: Optional[list] = None
    data_vencimento: date
    data_pagamento: Optional[date] = None
    cliente_nome: Optional[str] = None
    observacao: Optional[str] = None
    descricao_servico: Optional[str] = None
    condominio_id: Optional[int] = None
    # impostos
    iss:    Optional[float] = None
    pis:    Optional[float] = None
    cofins: Optional[float] = None
    inss:   Optional[float] = None
    csll:   Optional[float] = None
    icms:   Optional[float] = None
    prev:   Optional[float] = None
    # alertas de divergência de impostos
    alerta_impostos:      int = 0
    divergencia_impostos: Optional[dict] = None
    # vínculo entre notas
    nota_vinculada_id:      Optional[int]  = None
    imposto_config_vinculo: Optional[dict] = None
    criado_em: datetime

    model_config = {"from_attributes": True}


class ImportacaoResponse(BaseModel):
    processados: int
    ja_existentes: int = 0
    canceladas: int = 0
    erros: list[dict]


class NotaFiscalUpdate(BaseModel):
    numero_nota: Optional[str] = None
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    observacao: Optional[str] = None
    cliente_nome: Optional[str] = None
    valor: Optional[float] = None
    parcelas: Optional[int] = None
    descricao_servico: Optional[str] = None
    status: Optional[StatusNota] = None
    tipo: Optional[TipoNota] = None
    condominio_id: Optional[int] = None

    model_config = {"from_attributes": True}


class VincularNotasRequest(BaseModel):
    nota_a_id: int
    nota_b_id: int


class CandidataVinculoResponse(BaseModel):
    id: int
    numero_nota: str
    valor: float
    tipo: TipoNota
    parcelas: int
    data_vencimento: date
    cliente_nome: Optional[str] = None

    model_config = {"from_attributes": True}
