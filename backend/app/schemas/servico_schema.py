from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date, datetime
from enum import Enum
import json


class TipoServico(str, Enum):
    MANUTENCAO = "manutencao"
    ASSISTENCIA = "assistencia"


class ServicoBase(BaseModel):
    tipo: TipoServico
    data_servico: date
    descricao: Optional[str] = None
    nota_fiscal_id: Optional[int] = None
    numero_os: Optional[str] = None


class ServicoCreate(ServicoBase):
    # Opcional: serviço gerado a partir de Recibo pode não ter condomínio (usa dados
    # do próprio recibo/cliente nesse caso) — Nota Fiscal continua sempre preenchendo.
    condominio_id: Optional[int] = None


class ServicoUpdate(BaseModel):
    tipo: Optional[TipoServico] = None
    data_servico: Optional[date] = None
    descricao: Optional[str] = None
    nota_fiscal_id: Optional[int] = None
    numero_os: Optional[str] = None

    model_config = {"from_attributes": True}


class ServicoResponse(ServicoBase):
    id: int
    condominio_id: Optional[int] = None
    recibo_id: Optional[int] = None
    numero_os: Optional[str] = None
    orcamento_id: Optional[int] = None
    criado_em: datetime
    atualizado_em: datetime
    email_enviado_em: Optional[datetime] = None
    email_destinatarios: Optional[List[str]] = None

    @field_validator('email_destinatarios', mode='before')
    @classmethod
    def parse_destinatarios(cls, v):
        if v is None or isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return None
        return None

    class Config:
        from_attributes = True
