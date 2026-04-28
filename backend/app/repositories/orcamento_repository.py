from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, String, cast
from app.models.orcamento_model import Orcamento, OrcamentoItem, OrcamentoTaskId
from typing import List, Optional, Tuple

class OrcamentoRepository:

    @staticmethod
    def get_by_id(db: Session, orcamento_id: int) -> Optional[Orcamento]:
        return (
            db.query(Orcamento)
            .options(joinedload(Orcamento.itens), joinedload(Orcamento.task_ids))
            .filter(Orcamento.id == orcamento_id)
            .first()
        )

    @staticmethod
    def get_by_auvo_id(db: Session, auvo_public_id: int) -> Optional[Orcamento]:
        return db.query(Orcamento).filter(Orcamento.auvo_public_id == auvo_public_id).first()

    @staticmethod
    def upsert(db: Session, orcamento_data: dict, items_data: List[dict], task_ids: List[int]) -> Orcamento:
        auvo_public_id = orcamento_data.get("auvo_public_id")
        db_orcamento = db.query(Orcamento).filter(Orcamento.auvo_public_id == auvo_public_id).first()
        
        if db_orcamento:
            # Atualiza orçamento existente
            for key, value in orcamento_data.items():
                setattr(db_orcamento, key, value)
            
            # Limpa itens e task_ids para reinserir snapshot atualizado
            db.query(OrcamentoItem).filter(OrcamentoItem.orcamento_id == db_orcamento.id).delete()
            db.query(OrcamentoTaskId).filter(OrcamentoTaskId.orcamento_id == db_orcamento.id).delete()
        else:
            # Cria novo orçamento
            db_orcamento = Orcamento(**orcamento_data)
            db.add(db_orcamento)
            db.flush() # Garante que temos o ID para os itens
            
        # Insere itens
        for item in items_data:
            db_item = OrcamentoItem(**item, orcamento_id=db_orcamento.id)
            db.add(db_item)
            
        # Insere task_ids (vínculos com OSs)
        for tid in task_ids:
            db_tid = OrcamentoTaskId(orcamento_id=db_orcamento.id, task_id=tid)
            db.add(db_tid)
            
        return db_orcamento

    @staticmethod
    def list(
        db: Session, 
        condominio_id: Optional[int] = None, 
        search: Optional[str] = None, 
        skip: int = 0, 
        limit: int = 50
    ) -> Tuple[List[Orcamento], int]:
        query = db.query(Orcamento)
        
        if condominio_id:
            query = query.filter(Orcamento.condominio_id == condominio_id)
            
        if search:
            query = query.filter(or_(
                Orcamento.customer_name.ilike(f"%{search}%"),
                Orcamento.external_code.ilike(f"%{search}%"),
                cast(Orcamento.auvo_public_id, String).ilike(f"%{search}%")
            ))
            
        total = query.count()
        items = query.order_by(Orcamento.request_date.desc()).offset(skip).limit(limit).all()
        
        return items, total

    @staticmethod
    def list_by_condominio(db: Session, condominio_id: int, limit: int = 10) -> List[Orcamento]:
        return (
            db.query(Orcamento)
            .filter(Orcamento.condominio_id == condominio_id)
            .order_by(Orcamento.request_date.desc())
            .limit(limit)
            .all()
        )
