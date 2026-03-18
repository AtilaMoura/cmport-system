from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class RegistroExclusao(Base):
    """
    Tabela de auditoria para registrar todas as exclusões do sistema
    Armazena snapshot completo do registro antes da exclusão
    """
    __tablename__ = "registros_exclusoes"

    id = Column(Integer, primary_key=True, index=True)
    
    # Tipo do registro (ex: 'nota_fiscal', 'servico', 'condominio')
    tipo_registro = Column(String(100), nullable=False, index=True)
    
    # ID original do registro excluído
    registro_id = Column(Integer, nullable=False, index=True)
    
    # Snapshot completo do registro em JSON/texto
    dados_completos = Column(Text, nullable=False)
    
    # Observação opcional sobre a exclusão
    motivo_exclusao = Column(Text, nullable=True)
    
    # Usuário que realizou a exclusão (se tiver autenticação)
    usuario_exclusao = Column(String(255), nullable=True)
    
    # Timestamp automático
    data_exclusao = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<RegistroExclusao(id={self.id}, tipo={self.tipo_registro}, registro_id={self.registro_id})>"