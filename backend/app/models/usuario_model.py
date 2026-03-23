import enum
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String
from app.core.database import Base


class RoleUsuario(str, enum.Enum):
    DEV    = "DEV"
    ADMIN  = "ADMIN"
    USUARIO = "USUARIO"


class Usuario(Base):
    __tablename__ = "usuarios"

    id         = Column(Integer, primary_key=True, index=True)
    nome       = Column(String(100), nullable=False)
    email      = Column(String(150), unique=True, nullable=False, index=True)
    senha_hash = Column(String(255), nullable=False)
    role       = Column(Enum(RoleUsuario), nullable=False, default=RoleUsuario.USUARIO)
    ativo      = Column(Boolean, default=True, nullable=False)
    criado_em  = Column(DateTime, default=datetime.utcnow, nullable=False)
