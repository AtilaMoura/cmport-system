from sqlalchemy.orm import Session
from typing import List, Optional

from app.domains.condominios.repository import CondominioRepository
from app.domains.condominios.schema import CondominioCreate, CondominioUpdate, CondominioResponse, CondominioFullResponse
from app.domains.condominios.model import Condominio


class CondominioService:
    
    @staticmethod
    def create_condominio(db: Session, condominio: CondominioCreate) -> CondominioResponse:
        """Cria um novo condomínio"""
        db_condominio = CondominioRepository.create(db, condominio)
        return CondominioResponse.model_validate(db_condominio)
    
    @staticmethod
    def get_condominio(db: Session, condominio_id: int) -> Optional[CondominioResponse]:
        """Busca um condomínio por ID"""
        db_condominio = CondominioRepository.get_by_id(db, condominio_id)
        
        if not db_condominio:
            return None
        
        return CondominioResponse.model_validate(db_condominio)
    
    @staticmethod
    def list_condominios(
        db: Session, 
        skip: int = 0, 
        limit: int = 100,
        ativo: Optional[bool] = None
    ) -> List[CondominioResponse]:
        """Lista todos os condomínios"""
        condominios = CondominioRepository.get_all(db, skip, limit, ativo)
        return [CondominioResponse.model_validate(c) for c in condominios]
    
    @staticmethod
    def update_condominio(
        db: Session, 
        condominio_id: int, 
        condominio_update: CondominioUpdate
    ) -> Optional[CondominioResponse]:
        """Atualiza um condomínio"""
        db_condominio = CondominioRepository.update(db, condominio_id, condominio_update)
        
        if not db_condominio:
            return None
        
        return CondominioResponse.model_validate(db_condominio)
    
    @staticmethod
    def delete_condominio(db: Session, condominio_id: int) -> bool:
        """Deleta um condomínio"""
        return CondominioRepository.delete(db, condominio_id)
    
    @staticmethod
    def search_condominios(db: Session, nome: str) -> List[CondominioResponse]:
        """Busca condomínios por nome"""
        condominios = CondominioRepository.search_by_name(db, nome)
        return [CondominioResponse.model_validate(c) for c in condominios]
    
    @staticmethod
    def get_condominio_full(db: Session, condominio_id: int) -> Optional[CondominioFullResponse]:
        """Busca os detalhes completos de um condomínio"""
        db_condominio = CondominioRepository.get_by_id_full(db, condominio_id)
        
        if not db_condominio:
            return None
        
        return CondominioFullResponse.model_validate(db_condominio)