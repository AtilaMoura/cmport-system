import enum
from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Enum as SQLEnum, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.ordem_servico_model import OrdemServico


class TipoPagamentoDespesa(str, enum.Enum):
    UNICO = "UNICO"
    PARCELADO = "PARCELADO"
    RECORRENTE = "RECORRENTE"


class StatusParcelaDespesa(str, enum.Enum):
    PENDENTE = "PENDENTE"
    PAGO = "PAGO"


class Despesa(Base):
    __tablename__ = "despesas"

    id = Column(Integer, primary_key=True, index=True)
    descricao = Column(String(255), nullable=False)
    categoria_id = Column(Integer, ForeignKey("fin_categorias.id", ondelete="SET NULL"), nullable=True, index=True)
    categoria = relationship("CategoriaFinanceira")
    fornecedor_id = Column(Integer, ForeignKey("condominios.id", ondelete="SET NULL"), nullable=True, index=True)
    fornecedor = relationship("Condominio")
    cnpj = Column(String(20), nullable=False)
    banco_previsto_id = Column(Integer, ForeignKey("bancos.id", ondelete="SET NULL"), nullable=True)
    tipo_pagamento = Column(SQLEnum(TipoPagamentoDespesa), default=TipoPagamentoDespesa.UNICO, nullable=False)
    # Para UNICO: valor total do lancamento. Para PARCELADO: soma das parcelas
    # (informativo, calculado na criacao). Para RECORRENTE: valor atual usado
    # como sugestao ao gerar as proximas pendencias mensais.
    valor_total = Column(Numeric(10, 2, asdecimal=False), nullable=False)
    total_parcelas = Column(Integer, default=1, nullable=False)
    # So' usado quando tipo_pagamento=RECORRENTE (dia do mes, 1-28)
    dia_vencimento = Column(Integer, nullable=True)
    # So' relevante pra RECORRENTE -- desativar pausa a geracao de novas pendencias
    ativo = Column(Boolean, default=True, nullable=False)
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deletado_em = Column(DateTime, nullable=True)

    parcelas = relationship("DespesaParcela", backref="despesa", cascade="all, delete-orphan")
    servicos = relationship("ManutencaoAssistencia", secondary="despesa_servicos")
    orcamentos = relationship("Orcamento", secondary="despesa_orcamentos")
    os_fornecedor = relationship(OrdemServico, secondary="despesa_os_fornecedor")


class DespesaParcela(Base):
    __tablename__ = "despesa_parcelas"

    id = Column(Integer, primary_key=True, index=True)
    despesa_id = Column(Integer, ForeignKey("despesas.id", ondelete="CASCADE"), nullable=False, index=True)
    numero_parcela = Column(Integer, nullable=False)
    total_parcelas = Column(Integer, nullable=False)
    valor = Column(Numeric(10, 2, asdecimal=False), nullable=False)
    data_vencimento = Column(Date, nullable=False)
    status = Column(SQLEnum(StatusParcelaDespesa), default=StatusParcelaDespesa.PENDENTE, nullable=False, index=True)
    data_pagamento = Column(Date, nullable=True)
    banco_id = Column(Integer, ForeignKey("bancos.id", ondelete="SET NULL"), nullable=True)
    forma_pagamento = Column(String(20), nullable=True)
    movimentacao_id = Column(Integer, ForeignKey("fin_movimentacoes.id", ondelete="SET NULL"), nullable=True)
    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())


class DespesaServico(Base):
    """Vinculo N:N entre uma despesa de fornecedor e o(s) servico(s) que ela cobre."""
    __tablename__ = "despesa_servicos"

    despesa_id = Column(Integer, ForeignKey("despesas.id", ondelete="CASCADE"), primary_key=True)
    servico_id = Column(Integer, ForeignKey("manutencoes_assistencias.id", ondelete="CASCADE"), primary_key=True)


class DespesaOrcamento(Base):
    """Vinculo N:N entre uma despesa de fornecedor e o(s) orcamento(s) relacionados."""
    __tablename__ = "despesa_orcamentos"

    despesa_id = Column(Integer, ForeignKey("despesas.id", ondelete="CASCADE"), primary_key=True)
    orcamento_id = Column(Integer, ForeignKey("orcamentos.id", ondelete="CASCADE"), primary_key=True)


class DespesaOsFornecedor(Base):
    """Vinculo N:N entre uma despesa de fornecedor e a(s) OS do Auvo (tipo Material - Fornecedores) relacionadas."""
    __tablename__ = "despesa_os_fornecedor"

    despesa_id = Column(Integer, ForeignKey("despesas.id", ondelete="CASCADE"), primary_key=True)
    ordem_servico_id = Column(Integer, ForeignKey("ordens_servico.id", ondelete="CASCADE"), primary_key=True)
