from sqlalchemy.orm import Session
from .model import NotaFiscal
from .schema import NotaFiscalCreate

class NotaFiscalRepository:
    @staticmethod
    def create(db: Session, nota: NotaFiscalCreate):
        db_nota = NotaFiscal(**nota.model_dump())
        db.add(db_nota)
        db.commit()
        db.refresh(db_nota)
        return db_nota

    @staticmethod
    def get_all(db: Session):
        return db.query(NotaFiscal).all()
    
    @staticmethod
    def get_by_id(db: Session, id: int):
        return db.query(NotaFiscal).filter(NotaFiscal.id == id).first()

    # Novo método centralizado no Repository
    @staticmethod
    def get_by_numero(db: Session, numero: str):
        return db.query(NotaFiscal).filter(NotaFiscal.numero_nota == numero).first()