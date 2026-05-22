from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime

from app.models.ciclo_nota_model import TipoNotaCorpo
from app.models.corpo_nota_model import StatusCorpoNota


class CorpoNotaCreate(BaseModel):
    condominio_id: int
    tipo_nota: TipoNotaCorpo = TipoNotaCorpo.MANUTENCAO
    ano: int
    mes: int
    servico_id: Optional[int] = None
    numero_os: Optional[str] = None
    data_servico: Optional[date] = None
    descricao_servico: Optional[str] = None
    valor_bruto: Optional[float] = None
    data_vencimento: Optional[date] = None
    observacoes: Optional[str] = None
    tem_garantia: bool = False

    @field_validator("mes")
    @classmethod
    def valida_mes(cls, v):
        if v < 1 or v > 12:
            raise ValueError("mes deve ser entre 1 e 12.")
        return v

    @field_validator("ano")
    @classmethod
    def valida_ano(cls, v):
        if v < 2020:
            raise ValueError("ano deve ser >= 2020.")
        return v


class CorpoNotaUpdate(BaseModel):
    numero_os: Optional[str] = None
    data_servico: Optional[date] = None
    descricao_servico: Optional[str] = None
    valor_bruto: Optional[float] = None
    data_vencimento: Optional[date] = None
    observacoes: Optional[str] = None
    percentual_inss: Optional[float] = None
    percentual_cofins: Optional[float] = None
    percentual_pis: Optional[float] = None
    percentual_csll: Optional[float] = None
    tem_garantia: Optional[bool] = None
    termo_garantia_id: Optional[int] = None


class CorpoNotaStatusUpdate(BaseModel):
    status: StatusCorpoNota
    motivo: Optional[str] = None


class VincularNotaRequest(BaseModel):
    nota_fiscal_id: int


class CorpoNotaPreviewRequest(BaseModel):
    condominio_id: int
    tipo_nota: TipoNotaCorpo = TipoNotaCorpo.MANUTENCAO
    numero_os: Optional[str] = None
    data_servico: Optional[date] = None
    descricao_servico: Optional[str] = None
    valor_bruto: Optional[float] = None
    data_vencimento: Optional[date] = None
    mes_referencia: Optional[str] = None
    observacoes: Optional[str] = None
    pct_inss: Optional[float] = None
    pct_cofins: Optional[float] = None
    pct_pis: Optional[float] = None
    pct_csll: Optional[float] = None


class ImpostosCalculadosResponse(BaseModel):
    percentual_inss: float
    percentual_cofins: float
    percentual_pis: float
    percentual_csll: float
    percentual_iss: float = 0.0
    valor_inss: float
    valor_cofins: float
    valor_pis: float
    valor_csll: float
    valor_iss: float = 0.0
    valor_liquido: float


class CorpoNotaPreviewResponse(BaseModel):
    conteudo_gerado: str
    impostos_calculados: Optional[ImpostosCalculadosResponse] = None


class CorpoNotaResumoResponse(BaseModel):
    id: int
    ciclo_id: int
    condominio_id: int
    tipo_nota: TipoNotaCorpo
    numero_os: Optional[str] = None
    numero_referencia: Optional[str] = None
    mes_referencia: Optional[str] = None
    status: StatusCorpoNota
    valor_bruto: Optional[float] = None
    valor_liquido: Optional[float] = None
    preenchimento_manual: bool
    nota_fiscal_id: Optional[int] = None
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CorpoNotaResponse(CorpoNotaResumoResponse):
    servico_id: Optional[int] = None
    data_servico: Optional[date] = None
    descricao_servico: Optional[str] = None
    percentual_inss: Optional[float] = None
    percentual_cofins: Optional[float] = None
    percentual_pis: Optional[float] = None
    percentual_csll: Optional[float] = None
    valor_inss: Optional[float] = None
    valor_cofins: Optional[float] = None
    valor_pis: Optional[float] = None
    valor_csll: Optional[float] = None
    data_vencimento: Optional[date] = None
    observacoes: Optional[str] = None
    tem_garantia: bool = False
    termo_garantia_id: Optional[int] = None
    conteudo_gerado: Optional[str] = None
    criado_por: Optional[str] = None

    model_config = {"from_attributes": True}
