from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.domains.condominios.model import Condominio
from app.domains.condominios.schema import CondominioCreate, CondominioUpdate


class CondominioRepository:
    
    @staticmethod
    def create(db: Session, condominio: CondominioCreate) -> Condominio:
        """Cria um novo condomínio"""
        db_condominio = Condominio(**condominio.model_dump())
        db.add(db_condominio)
        db.commit()
        db.refresh(db_condominio)
        return db_condominio
    
    @staticmethod
    def get_by_id(db: Session, condominio_id: int) -> Optional[Condominio]:
        """Busca condomínio por ID"""
        return db.query(Condominio).filter(Condominio.id == condominio_id).first()
    
    @staticmethod
    def get_by_auvo_id(db: Session, auvo_id: int) -> Optional[Condominio]:
        """Busca condomínio por ID do Auvo"""
        return db.query(Condominio).filter(Condominio.auvo_id == auvo_id).first()
    
    @staticmethod
    def get_all(
        db: Session, 
        skip: int = 0, 
        limit: int = 100,
        ativo: Optional[bool] = None
    ) -> List[Condominio]:
        """Lista todos os condomínios"""
        query = db.query(Condominio)
        
        if ativo is not None:
            query = query.filter(Condominio.ativo == ativo)
        
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def update(
        db: Session, 
        condominio_id: int, 
        condominio_update: CondominioUpdate
    ) -> Optional[Condominio]:
        """Atualiza um condomínio"""
        db_condominio = CondominioRepository.get_by_id(db, condominio_id)
        
        if not db_condominio:
            return None
        
        # Atualiza apenas campos que foram enviados
        update_data = condominio_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_condominio, key, value)
        
        db.commit()
        db.refresh(db_condominio)
        return db_condominio
    
    @staticmethod
    def delete(db: Session, condominio_id: int) -> bool:
        """Deleta um condomínio"""
        db_condominio = CondominioRepository.get_by_id(db, condominio_id)
        
        if not db_condominio:
            return False
        
        db.delete(db_condominio)
        db.commit()
        return True
    
    @staticmethod
    def search_by_name(db: Session, nome: str) -> List[Condominio]:
        """Busca condomínios por nome (parcial)"""
        return db.query(Condominio).filter(
            Condominio.nome.ilike(f"%{nome}%")
        ).all()
    
    @staticmethod
    def create_with_auvo(db: Session, condominio: CondominioCreate, auvo_id: int) -> Condominio:
        """Cria um condomínio associando o ID original do Auvo"""
        db_condominio = Condominio(**condominio.model_dump(), auvo_id=auvo_id)
        db.add(db_condominio)
        db.commit()
        db.refresh(db_condominio)
        return db_condominio
    
    @staticmethod
    def get_by_id_full(db: Session, condominio_id: int) -> Optional[Condominio]:
        """Busca condomínio por ID trazendo Endereço e Contatos num único JOIN"""
        return db.query(Condominio)\
            .options(
                joinedload(Condominio.endereco),
                joinedload(Condominio.contatos)
            )\
            .filter(Condominio.id == condominio_id)\
            .first()