from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from datetime import datetime
from app.core.database import Base


class OrdemServico(Base):
    __tablename__ = "ordens_servico"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, unique=True, index=True, nullable=False)
    customer_id = Column(Integer, nullable=True, index=True)
    customer_description = Column(String(255), nullable=True)
    task_date = Column(DateTime, nullable=True, index=True)
    task_type_description = Column(String(255), nullable=True)
    user_to_name = Column(String(255), nullable=True)
    orientation = Column(Text, nullable=True)
    report = Column(Text, nullable=True)
    finished = Column(Boolean, default=False)
    task_status = Column(Integer, nullable=True)
    check_in_date = Column(DateTime, nullable=True)
    check_out_date = Column(DateTime, nullable=True)
    duration = Column(String(20), nullable=True)
    address = Column(String(500), nullable=True)
    signature_url = Column(String(500), nullable=True)
    task_url = Column(String(500), nullable=True)
    sincronizado_em = Column(DateTime, default=datetime.utcnow)
    criado_em = Column(DateTime, default=datetime.utcnow)
