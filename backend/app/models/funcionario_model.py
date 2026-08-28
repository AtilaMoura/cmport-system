import enum
from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, Enum as SQLEnum, Text, Boolean, SmallInteger
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class AdiantamentoTipo(str, enum.Enum):
    NENHUM = "NENHUM"
    FIXO = "FIXO"
    VARIAVEL = "VARIAVEL"


class Funcionario(Base):
    __tablename__ = "funcionarios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(150), nullable=False)
    # CNPJ (so digitos) da empresa que paga por padrao — CMPORT ou TEC.
    # Cada despesa gerada pode sobrescrever isso.
    empresa_padrao_cnpj = Column(String(20), nullable=False)
    cargo = Column(String(100), nullable=True)
    data_admissao = Column(Date, nullable=True)
    data_demissao = Column(Date, nullable=True)  # None = ativo
    ativo = Column(Boolean, default=True, nullable=False)
    observacao = Column(Text, nullable=True)
    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deletado_em = Column(DateTime, nullable=True)

    variaveis = relationship(
        "FuncionarioVariaveis",
        uselist=False,
        back_populates="funcionario",
        cascade="all, delete-orphan",
    )


class FuncionarioVariaveis(Base):
    """Valores CORRENTES que alimentam a geracao das despesas mensais do
    funcionario. A parcela gerada e sempre editavel (salario varia mes a mes)."""
    __tablename__ = "funcionario_variaveis"

    id = Column(Integer, primary_key=True, index=True)
    funcionario_id = Column(Integer, ForeignKey("funcionarios.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    salario_mensal = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)
    dia_pagamento_salario = Column(SmallInteger, nullable=True)  # 1-31

    adiantamento_tipo = Column(SQLEnum(AdiantamentoTipo), default=AdiantamentoTipo.NENHUM, nullable=False)
    adiantamento_valor = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)  # so usado se tipo=FIXO
    dia_pagamento_adiantamento = Column(SmallInteger, nullable=True)

    vale_transporte = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)
    vale_refeicao = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)

    tem_plantao = Column(Boolean, default=False, nullable=False)
    plantao_valor = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)      # valor padrao/mes (editavel no pagamento)
    tem_hora_extra = Column(Boolean, default=False, nullable=False)
    hora_extra_valor = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)   # idem

    # so projecao — o encargo real e pago como guia da folha inteira (bucket, sem funcionario_id)
    encargos_percentual = Column(Numeric(5, 2, asdecimal=False), default=0, nullable=False)

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    funcionario = relationship("Funcionario", back_populates="variaveis")
