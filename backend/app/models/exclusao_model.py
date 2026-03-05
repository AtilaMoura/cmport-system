from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class RegistroExclusao(Base):
    __tablename__ = "registros_exclusoes"

    id = Column(Integer, primary_key=True, index=True)
    tipo_registro = Column(String(100), nullable=False, index=True)
    registro_id = Column(Integer, nullable=False, index=True)
    dados_completos = Column(Text, nullable=False)
    motivo_exclusao = Column(Text, nullable=True)
    usuario_exclusao = Column(String(255), nullable=True)
    data_exclusao = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<RegistroExclusao(id={self.id}, tipo={self.tipo_registro}, registro_id={self.registro_id})>"
