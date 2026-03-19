from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

from app.models.boleto_model import TipoCobranca, SituacaoBoleto, FormaPagamento


class BoletoResponse(BaseModel):
    id: int
    nota_fiscal_id: int
    codigo_solicitacao: Optional[str] = None
    nosso_numero: Optional[str] = None
    seu_numero: Optional[str] = None
    valor_nominal: float
    valor_juros: float
    valor_multa: float
    valor_total_recebido: Optional[float] = None
    data_emissao: date
    data_vencimento: date
    data_pagamento: Optional[date] = None
    tipo_cobranca: TipoCobranca
    situacao: SituacaoBoleto
    numero_parcela: int
    total_parcelas: int
    forma_pagamento: FormaPagamento
    banco_pagamento: Optional[str] = None
    observacao: Optional[str] = None
    criado_em: datetime

    model_config = {"from_attributes": True}


class GerarBoletosRequest(BaseModel):
    nota_ids: List[int]
    data_vencimento_override: Optional[date] = None
    valor_total_override: Optional[float] = None   # Sobrescreve o valor calculado (já líquido)
    mensagem: Optional[str] = None                 # Aparece no boleto — ex: "OS 123"
    # Overrides de percentual de imposto (usa config da tabela se None)
    pct_pis:    Optional[float] = None
    pct_cofins: Optional[float] = None
    pct_inss:   Optional[float] = None
    pct_csll:   Optional[float] = None
    # Juros: None = default por tipo (True para serviço, False para produto)
    aplicar_juros: Optional[bool] = None
    taxa_juros:    Optional[float] = 1.0   # % ao mês


class GerarParcelasFaltantesRequest(BaseModel):
    valor_total_override: Optional[float] = None
    mensagem: Optional[str] = None
    pct_pis:    Optional[float] = None
    pct_cofins: Optional[float] = None
    pct_inss:   Optional[float] = None
    pct_csll:   Optional[float] = None
    aplicar_juros: Optional[bool] = None
    taxa_juros:    Optional[float] = 1.0


class ConfigImpostosResponse(BaseModel):
    pct_pis:    float
    pct_cofins: float
    pct_inss:   float
    pct_csll:   float
    valor_bruto:  float
    valor_liquido: float
    numero_os: Optional[str] = None
    aplicar_juros_default: bool
    alerta_impostos: bool = False
    divergencia_impostos: Optional[dict] = None


class GerarBoletosResponse(BaseModel):
    sucesso: List[BoletoResponse]
    erros: List[dict]


class RegistrarPagamentoRequest(BaseModel):
    data_pagamento: date
    valor_recebido: float
    forma_pagamento: FormaPagamento
    banco_pagamento: Optional[str] = None
    observacao: Optional[str] = None


class CriarBoletoManualRequest(BaseModel):
    nota_fiscal_id: int
    numero_parcela: int = 1
    total_parcelas: int = 1
    valor_nominal: float
    data_vencimento: date
    forma_pagamento: FormaPagamento
    banco_pagamento: Optional[str] = None
    observacao: Optional[str] = None
    ja_pago: bool = False
    data_pagamento: Optional[date] = None
    valor_recebido: Optional[float] = None


class GerarParcelasFaltantesResponse(BaseModel):
    sucesso: List[BoletoResponse]
    erros: List[dict]


class VincularNotaRequest(BaseModel):
    nota_fiscal_id: int


class NotaSemBoletoResponse(BaseModel):
    id: int
    numero_nota: str
    valor: float
    data_vencimento: date
    tipo: str
    condominio_id: Optional[int] = None
    condominio_nome: Optional[str] = None
    dias_atraso: int  # negativo = ainda não venceu


class SincronizarResponse(BaseModel):
    atualizados: int
    erros: List[dict]


class SincronizarInterResponse(BaseModel):
    criados: int
    atualizados: int
    sem_vinculo: int
    erros: List[dict]


class BoletoStats(BaseModel):
    total: int
    em_aberto: int
    pagos: int
    vencidos: int
    cancelados: int
    expirados: int
    baixados: int
    valor_total: float
    valor_pago: float
    valor_pendente: float
