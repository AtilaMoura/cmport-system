from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class Banco(Base):
    __tablename__ = "bancos"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    nome                  = Column(String(50), nullable=False)   # "Itaú", "Inter", "Bradesco", "BTG"
    cnpj_titular          = Column(String(18), nullable=False)   # CNPJ da CMPORT ou da TEC (sem pontuação)
    razao_social_titular  = Column(String(255), nullable=True)   # "CMPORT" / "CMPORT TEC" — só exibição
    # Preenchido só nas contas Inter — liga à config real de API sem duplicar credencial
    configuracao_inter_id = Column(Integer, ForeignKey("configuracao_inter.id", ondelete="SET NULL"), nullable=True)
    ativo                 = Column(Boolean, nullable=False, default=True)
    criado_em             = Column(DateTime, default=datetime.utcnow)
    # Dados operacionais completos (agência/conta/PIX/favorecido)
    agencia               = Column(String(20), nullable=True)
    conta_corrente        = Column(String(30), nullable=True)
    tipo_chave_pix        = Column(String(20), nullable=True)   # CNPJ | CELULAR | EMAIL | ALEATORIA
    chave_pix             = Column(String(100), nullable=True)
    favorecido            = Column(String(255), nullable=True)
