"""
canal_model.py — Canal de comunicação entre a CMPort (Fabiana/Almira) e o
desenvolvedor (Atila): demandas de dev/ajuste, notas rápidas e troca de
documentos, tudo dentro do login que já existe.

4 tabelas:
- canal_itens        → a demanda (rastreada) ou nota (recado rápido)
- canal_comentarios  → thread de mensagens/reações de um item
- canal_anexos       → arquivos (guardados no MinIO, prefixo `canal/`)
- canal_formularios  → formulário de pendência preso a uma demanda (perguntas/respostas em JSON)
"""
import enum

from sqlalchemy import (
    Column, Integer, BigInteger, String, Text, DateTime, ForeignKey,
    Boolean, Enum as SQLEnum, JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class CanalAutor(str, enum.Enum):
    """Quem está agindo — escolhido no seletor 'estou como' (login é compartilhado)."""
    ATILA = "ATILA"
    ALMIRA = "ALMIRA"
    FABIANA = "FABIANA"


# Lado do canal a que cada autor pertence — usado para as marcas de "novo/visto".
LADO_POR_AUTOR = {
    CanalAutor.ATILA: "ATILA",
    CanalAutor.ALMIRA: "CMPORT",
    CanalAutor.FABIANA: "CMPORT",
}


class CanalTipo(str, enum.Enum):
    DEMANDA = "DEMANDA"   # rastreada: tem status, prioridade, resolução
    NOTA = "NOTA"         # recado rápido / compartilhar documento, sem rastreio


class CanalStatus(str, enum.Enum):
    ABERTA = "ABERTA"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    AGUARDANDO_CMPORT = "AGUARDANDO_CMPORT"   # bola com a Fabiana/Almira
    AGUARDANDO_ATILA = "AGUARDANDO_ATILA"     # bola com o Atila
    RESOLVIDA = "RESOLVIDA"
    DESCARTADA = "DESCARTADA"                 # "não vou fazer" — fica registrado com motivo


class CanalPrioridade(str, enum.Enum):
    BAIXA = "BAIXA"
    NORMAL = "NORMAL"
    ALTA = "ALTA"
    URGENTE = "URGENTE"


class CanalFormularioStatus(str, enum.Enum):
    RASCUNHO = "RASCUNHO"                 # Atila montando, cliente ainda não vê
    ENVIADO = "ENVIADO"                   # liberado pra cliente responder
    EM_PREENCHIMENTO = "EM_PREENCHIMENTO" # cliente salvou parcial
    RESPONDIDO = "RESPONDIDO"             # cliente finalizou


class CanalItem(Base):
    __tablename__ = "canal_itens"

    id = Column(Integer, primary_key=True, index=True)
    # Código curto pra citar no WhatsApp/telefone: "D-42" (demanda) / "N-17" (nota).
    codigo = Column(String(12), unique=True, index=True, nullable=True)
    tipo = Column(SQLEnum(CanalTipo), nullable=False, default=CanalTipo.NOTA)
    titulo = Column(String(200), nullable=True)      # obrigatório só p/ DEMANDA (valida no service)
    descricao = Column(Text, nullable=True)
    autor = Column(SQLEnum(CanalAutor), nullable=False)

    status = Column(SQLEnum(CanalStatus), nullable=False, default=CanalStatus.ABERTA)
    prioridade = Column(SQLEnum(CanalPrioridade), nullable=False, default=CanalPrioridade.NORMAL)

    resolucao_texto = Column(Text, nullable=True)    # "o que foi feito"
    commit_ref = Column(String(200), nullable=True)  # link/hash do commit, opcional
    motivo_descarte = Column(Text, nullable=True)

    data_abertura = Column(DateTime, server_default=func.now())
    data_resolucao = Column(DateTime, nullable=True)

    # Marcas de "tem novidade" por lado. Quem gerou a atividade já "viu".
    visto_atila = Column(Boolean, nullable=False, default=True)
    visto_cmport = Column(Boolean, nullable=False, default=True)

    arquivado = Column(Boolean, nullable=False, default=False)
    deletado_em = Column(DateTime, nullable=True)   # soft delete — nunca apaga de verdade

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    comentarios = relationship(
        "CanalComentario",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="CanalComentario.criado_em",
    )
    anexos = relationship(
        "CanalAnexo",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="CanalAnexo.enviado_em",
    )
    formularios = relationship(
        "CanalFormulario",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="CanalFormulario.criado_em",
    )


class CanalComentario(Base):
    __tablename__ = "canal_comentarios"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("canal_itens.id", ondelete="CASCADE"), nullable=False, index=True)
    autor = Column(SQLEnum(CanalAutor), nullable=False)
    texto = Column(Text, nullable=True)          # pode vir vazio se for só reação
    reacao = Column(String(20), nullable=True)   # ex: "👍", "RECEBIDO"
    criado_em = Column(DateTime, server_default=func.now())
    deletado_em = Column(DateTime, nullable=True)

    item = relationship("CanalItem", back_populates="comentarios")
    anexos = relationship(
        "CanalAnexo",
        back_populates="comentario",
        order_by="CanalAnexo.enviado_em",
    )


class CanalAnexo(Base):
    __tablename__ = "canal_anexos"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("canal_itens.id", ondelete="CASCADE"), nullable=False, index=True)
    comentario_id = Column(Integer, ForeignKey("canal_comentarios.id", ondelete="SET NULL"), nullable=True, index=True)
    nome_arquivo = Column(String(300), nullable=False)
    object_key = Column(String(500), nullable=False)   # chave no MinIO (bucket cmport-nfe, prefixo canal/)
    content_type = Column(String(150), nullable=True)
    tamanho = Column(BigInteger, nullable=True)
    enviado_por = Column(SQLEnum(CanalAutor), nullable=False)
    enviado_em = Column(DateTime, server_default=func.now())
    removido = Column(Boolean, nullable=False, default=False)   # soft delete — objeto fica no storage

    item = relationship("CanalItem", back_populates="anexos")
    comentario = relationship("CanalComentario", back_populates="anexos")


class CanalFormulario(Base):
    """Formulário de pendência preso a uma demanda: um bloco de contexto + uma
    lista de perguntas tipadas que a CMPort responde dentro do sistema."""
    __tablename__ = "canal_formularios"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("canal_itens.id", ondelete="CASCADE"), nullable=False, index=True)
    titulo = Column(String(200), nullable=False)
    contexto = Column(Text, nullable=True)            # markdown leve (renderizado seguro no front)
    # perguntas: [{id, enunciado, tipo, obrigatoria, ajuda, opcoes[], sugestao}]
    perguntas_json = Column(JSON, nullable=False, default=list)
    # respostas: {pergunta_id: valor}
    respostas_json = Column(JSON, nullable=False, default=dict)

    status = Column(SQLEnum(CanalFormularioStatus), nullable=False, default=CanalFormularioStatus.RASCUNHO)
    preenchido_por = Column(SQLEnum(CanalAutor), nullable=True)   # quem está/esteve respondendo
    respondido_em = Column(DateTime, nullable=True)              # quando finalizou

    criado_em = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deletado_em = Column(DateTime, nullable=True)

    item = relationship("CanalItem", back_populates="formularios")
