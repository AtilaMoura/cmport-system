from sqlalchemy.orm import Session

from app.repositories.contato_repository import ContatoRepository
from app.schemas.contato_schema import ContatoCreate, ContatoUpdate


class ContatoService:

    @staticmethod
    def create_contato(db: Session, contato: ContatoCreate):
        return ContatoRepository.create(db, contato.model_dump())

    @staticmethod
    def list_contatos_by_condominio(db: Session, condominio_id: int):
        return ContatoRepository.list_by_condominio(db, condominio_id)

    @staticmethod
    def get_contato_principal(db: Session, condominio_id: int):
        return ContatoRepository.get_principal(db, condominio_id)

    @staticmethod
    def get_contato(db: Session, contato_id: int):
        return ContatoRepository.get_by_id(db, contato_id)

    @staticmethod
    def update_contato(db: Session, contato_id: int, contato_update: ContatoUpdate):
        db_contato = ContatoRepository.get_by_id(db, contato_id)
        if not db_contato:
            return None
        return ContatoRepository.update(db, db_contato, contato_update.model_dump(exclude_unset=True))

    @staticmethod
    def delete_contato(db: Session, contato_id: int) -> bool:
        db_contato = ContatoRepository.get_by_id(db, contato_id)
        if not db_contato:
            return False
        ContatoRepository.delete(db, db_contato)
        return True
