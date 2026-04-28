from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.produto_model import Produto
from typing import List, Optional, Tuple

class ProdutoRepository:

    @staticmethod
    def get_by_id(db: Session, produto_id: int) -> Optional[Produto]:
        return db.query(Produto).filter(Produto.id == produto_id).first()

    @staticmethod
    def get_by_auvo_id(db: Session, auvo_id: int) -> Optional[Produto]:
        return db.query(Produto).filter(Produto.auvo_id == auvo_id).first()

    @staticmethod
    def upsert_by_auvo_id(db: Session, product_data: dict) -> Tuple[Produto, bool]:
        """Upsert por auvo_id. Retorna (produto, criado_agora)"""
        auvo_id = product_data.get("auvo_id")
        db_product = db.query(Produto).filter(Produto.auvo_id == auvo_id).first()
        
        criado = False
        if db_product:
            for key, value in product_data.items():
                setattr(db_product, key, value)
        else:
            db_product = Produto(**product_data)
            db.add(db_product)
            criado = True
        
        return db_product, criado

    @staticmethod
    def list(db: Session, search: Optional[str] = None, ativo: Optional[bool] = None, skip: int = 0, limit: int = 50) -> Tuple[List[Produto], int]:
        query = db.query(Produto)
        
        if search:
            query = query.filter(or_(
                Produto.nome.ilike(f"%{search}%"),
                Produto.descricao.ilike(f"%{search}%")
            ))
        
        if ativo is not None:
            query = query.filter(Produto.ativo == ativo)
            
        total = query.count()
        items = query.order_by(Produto.nome.asc()).offset(skip).limit(limit).all()
        
        return items, total
