import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Numeric, Date, Boolean,
    DateTime, Text, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.ordem_servico_model import OrdemServico


class OrigemMovimentacao(str, enum.Enum):
    BANCO  = "BANCO"
    MANUAL = "MANUAL"


class StatusMovimentacao(str, enum.Enum):
    PENDENTE = "PENDENTE"
    VALIDADO = "VALIDADO"


class MovimentacaoFinanceira(Base):
    __tablename__ = "fin_movimentacoes"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    data              = Column(Date, nullable=False)
    descricao         = Column(String(500), nullable=False)
    valor             = Column(Numeric(10, 2), nullable=False)   # sempre positivo
    tipo              = Column(String(10), nullable=False)        # ENTRADA | SAIDA
    categoria_id      = Column(Integer, ForeignKey("fin_categorias.id", ondelete="SET NULL"), nullable=True)
    categoria         = relationship("CategoriaFinanceira")
    origem            = Column(String(10), nullable=False, default="MANUAL")
    status            = Column(String(10), nullable=False, default="PENDENTE")
    id_externo_banco  = Column(String(100), nullable=True, unique=True)
    observacao        = Column(Text, nullable=True)
    criado_em         = Column(DateTime, server_default=func.now())
    atualizado_em     = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deletado_em       = Column(DateTime, nullable=True)

    # Rastreia que essa despesa nasceu de um recibo SAIDA (uma por parcela paga)
    recibo_id         = Column(Integer, ForeignKey("recibos.id", ondelete="SET NULL"), nullable=True, index=True)
    # Conta afetada pelo lancamento — pra transferencia entre contas proprias,
    # representa a conta de DESTINO (onde o dinheiro entrou). banco_origem_id
    # (abaixo) guarda a conta de ORIGEM, quando aplicavel/conhecida.
    banco_id          = Column(Integer, ForeignKey("bancos.id", ondelete="SET NULL"), nullable=True, index=True)
    banco             = relationship("Banco", foreign_keys=[banco_id])
    banco_origem_id   = Column(Integer, ForeignKey("bancos.id", ondelete="SET NULL"), nullable=True, index=True)
    banco_origem      = relationship("Banco", foreign_keys=[banco_origem_id])

    # Fornecedor pago (condominios.tipo='FORNECEDOR') — quem recebeu, um só por lancamento
    fornecedor_id     = Column(Integer, ForeignKey("condominios.id", ondelete="SET NULL"), nullable=True, index=True)
    fornecedor        = relationship("Condominio")

    # Forma de pagamento (PIX default)
    forma_pagamento   = Column(String(20), nullable=True, default='PIX')

    # Servicos/orcamentos cobertos por essa saida — N:N, preenchimento opcional
    # e a qualquer momento (a compra pode acontecer antes de existir OS/servico)
    servicos          = relationship("ManutencaoAssistencia", secondary="fin_movimentacao_servicos")
    orcamentos        = relationship("Orcamento", secondary="fin_movimentacao_orcamentos")
    os_fornecedor     = relationship(OrdemServico, secondary="fin_movimentacao_os_fornecedor")

    __table_args__ = (
        Index("ix_fin_mov_data",          "data"),
        Index("ix_fin_mov_tipo",          "tipo"),
        Index("ix_fin_mov_status",        "status"),
        Index("ix_fin_mov_origem",        "origem"),
        Index("ix_fin_mov_data_del",      "data", "deletado_em"),
    )


class MovimentacaoServico(Base):
    """Vinculo N:N entre uma saida de fornecedor e o(s) servico(s) que ela cobriu."""
    __tablename__ = "fin_movimentacao_servicos"

    movimentacao_id = Column(Integer, ForeignKey("fin_movimentacoes.id", ondelete="CASCADE"), primary_key=True)
    servico_id      = Column(Integer, ForeignKey("manutencoes_assistencias.id", ondelete="CASCADE"), primary_key=True)


class MovimentacaoOrcamento(Base):
    """Vinculo N:N entre uma saida de fornecedor e o(s) orcamento(s) relacionados."""
    __tablename__ = "fin_movimentacao_orcamentos"

    movimentacao_id = Column(Integer, ForeignKey("fin_movimentacoes.id", ondelete="CASCADE"), primary_key=True)
    orcamento_id    = Column(Integer, ForeignKey("orcamentos.id", ondelete="CASCADE"), primary_key=True)


class MovimentacaoOsFornecedor(Base):
    """Vinculo N:N entre uma saida de fornecedor e a(s) OS do Auvo (tipo Material - Fornecedores) que geraram ela."""
    __tablename__ = "fin_movimentacao_os_fornecedor"

    movimentacao_id  = Column(Integer, ForeignKey("fin_movimentacoes.id", ondelete="CASCADE"), primary_key=True)
    ordem_servico_id = Column(Integer, ForeignKey("ordens_servico.id", ondelete="CASCADE"), primary_key=True)
