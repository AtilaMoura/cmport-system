import enum

from sqlalchemy import (
    Column, Integer, SmallInteger, Boolean, Date, DateTime, Enum, ForeignKey,
    JSON, Numeric, String, Text, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.ciclo_nota_model import TipoNotaCorpo


class StatusCorpoNota(str, enum.Enum):
    PENDENTE = "PENDENTE"
    EM_MONTAGEM = "EM_MONTAGEM"
    GERADO = "GERADO"
    XML_VINCULADO = "XML_VINCULADO"
    BOLETO_GERADO = "BOLETO_GERADO"
    PAGO = "PAGO"
    CANCELADO = "CANCELADO"
    # CONCLUIDO não existe aqui — pertence a ciclos_nota.status_ciclo


class CorpoNota(Base):
    __tablename__ = "corpos_nota"

    id = Column(Integer, primary_key=True, autoincrement=True)

    ciclo_id = Column(Integer, ForeignKey("ciclos_nota.id"), nullable=False, index=True)
    ciclo = relationship("CicloNota", back_populates="corpos")

    condominio_id = Column(Integer, ForeignKey("condominios.id"), nullable=False, index=True)
    condominio = relationship("Condominio")

    tipo_nota = Column(Enum(TipoNotaCorpo), nullable=False)

    # CNPJ selecionado antes de criar (determina qual conta Inter para boleto)
    configuracao_inter_id = Column(Integer, ForeignKey("configuracao_inter.id", ondelete="SET NULL"), nullable=True)
    configuracao_inter = relationship("ConfiguracaoInter")

    # OS vinculada (preenchimento automático)
    servico_id = Column(Integer, ForeignKey("manutencoes_assistencias.id", ondelete="SET NULL"), nullable=True, index=True)
    servico = relationship("ManutencaoAssistencia")

    # Orçamento vinculado (quando o corpo vem de um orçamento Auvo)
    orcamento_id = Column(Integer, ForeignKey("orcamentos.id", ondelete="SET NULL"), nullable=True)
    orcamento = relationship("Orcamento")

    # Dados do serviço (auto-fill ou manual)
    numero_os = Column(String(200), nullable=True)  # Expandido para múltiplos números (SERVIÇO)
    data_servico = Column(Date, nullable=True)
    descricao_servico = Column(Text, nullable=True)

    # Valores financeiros
    valor_bruto = Column(Numeric(10, 2), nullable=True)
    percentual_inss = Column(Numeric(5, 2), nullable=True)
    percentual_cofins = Column(Numeric(5, 2), nullable=True)
    percentual_pis = Column(Numeric(5, 2), nullable=True)
    percentual_csll = Column(Numeric(5, 2), nullable=True)
    valor_inss = Column(Numeric(10, 2), nullable=True)
    valor_cofins = Column(Numeric(10, 2), nullable=True)
    valor_pis = Column(Numeric(10, 2), nullable=True)
    valor_csll = Column(Numeric(10, 2), nullable=True)
    valor_liquido = Column(Numeric(10, 2), nullable=True)

    # Campos específicos para tipo SERVIÇO
    data_servico_texto = Column(String(200), nullable=True)  # Texto livre: "06.05.2026 e 07.05.2026"
    descricao_garantia = Column(Text, nullable=True)         # Ex: "06 meses" ou "Motor: 3 meses"
    valor_nota_produto = Column(Numeric(10, 2), nullable=True)  # Valor NF produto (boleto consolidado)

    data_vencimento = Column(Date, nullable=True)
    mes_referencia = Column(String(7), nullable=True)   # ex: "05/2026"
    observacoes = Column(Text, nullable=True)

    # True quando qualquer campo crítico foi preenchido manualmente
    preenchimento_manual = Column(Boolean, nullable=False, default=False)

    status = Column(Enum(StatusCorpoNota), nullable=False, default=StatusCorpoNota.PENDENTE, index=True)

    # Vínculo com nota fiscal (preenchido após upload do ZIP/XML)
    nota_fiscal_id = Column(Integer, ForeignKey("notas_fiscais.id", ondelete="SET NULL"), nullable=True, index=True)
    nota_fiscal = relationship("NotaFiscal", foreign_keys=[nota_fiscal_id])

    # Garantia
    tem_garantia = Column(Boolean, nullable=False, default=False)
    termo_garantia_id = Column(Integer, ForeignKey("termos_garantia.id", ondelete="SET NULL"), nullable=True)
    termo_garantia = relationship("TermoGarantia")

    # Número de referência sequencial interno (ex: MAT-2026/0001)
    numero_referencia = Column(String(20), nullable=True, unique=True, index=True)

    # Número da NF atribuído na criação (auto-incrementado a partir de ConfiguracaoInter)
    numero_nf = Column(Integer, nullable=True)

    # Quantidade de parcelas para geração do parcelamento no corpo
    numero_parcelas = Column(SmallInteger, nullable=True, default=1)

    # Parcelas com valor e data definidos pelo operador
    # [{"valor": 1180.0, "data": "2026-05-20"}, ...]
    parcelas_json = Column(JSON, nullable=True)

    # Produtos listados na nota (abaixo da garantia no corpo)
    # [{"nome": "Motor MKN", "quantidade": 3}, ...]
    produtos_json = Column(JSON, nullable=True)

    # Texto gerado do corpo da nota
    conteudo_gerado = Column(Text, nullable=True)

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())
    criado_por = Column(String(100), nullable=True)
    deletado_em = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_corpo_condominio_status", "condominio_id", "status"),
    )
