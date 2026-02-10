from sqlalchemy.orm import Session
from .repository import ServicoRepository
from .schema import ServicoCreate, ServicoUpdate

class ServicoService:
    @staticmethod
    def create_servico(db: Session, servico: ServicoCreate):
        return ServicoRepository.create(db, servico.model_dump())

    @staticmethod
    def list_servicos_condominio(db: Session, condominio_id: int):
        return ServicoRepository.list_by_condominio(db, condominio_id)

    @staticmethod
    def update_servico(db: Session, servico_id: int, servico_update: ServicoUpdate):
        db_servico = ServicoRepository.get_by_id(db, servico_id)
        if not db_servico:
            return None
        return ServicoRepository.update(db, db_servico, servico_update.model_dump(exclude_unset=True))

    @staticmethod
    def delete_servico(db: Session, servico_id: int) -> bool:
        db_servico = ServicoRepository.get_by_id(db, servico_id)
        if not db_servico:
            return False
        ServicoRepository.delete(db, db_servico)
        return True
    
    