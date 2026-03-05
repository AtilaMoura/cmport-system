from sqlalchemy.orm import Session

from app.repositories.endereco_repository import EnderecoRepository
from app.schemas.endereco_schema import EnderecoCreate, EnderecoUpdate


class EnderecoService:

    @staticmethod
    def create_endereco(db: Session, endereco: EnderecoCreate):
        existente = EnderecoRepository.get_by_condominio(db, endereco.condominio_id)
        if existente:
            return EnderecoRepository.update(db, existente, endereco.model_dump(exclude_unset=True))
        return EnderecoRepository.create(db, endereco.model_dump())

    @staticmethod
    def get_endereco_by_condominio(db: Session, condominio_id: int):
        return EnderecoRepository.get_by_condominio(db, condominio_id)

    @staticmethod
    def update_by_endereco(db: Session, endereco_id: int, endereco_update: EnderecoUpdate):
        db_endereco = EnderecoRepository.get_by_id(db, endereco_id)
        if not db_endereco:
            return None
        return EnderecoRepository.update(db, db_endereco, endereco_update.model_dump(exclude_unset=True))
