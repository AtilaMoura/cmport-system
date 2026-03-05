from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.nota_fiscal_model import NotaFiscal
from app.schemas.nota_fiscal_schema import NotaFiscalCreate, NotaFiscalImportada
from app.models.condominio_model import Condominio


class NotaFiscalRepository:

    @staticmethod
    def create(db: Session, nota: NotaFiscalCreate):
        db_nota = NotaFiscal(**nota.model_dump())
        db.add(db_nota)
        db.commit()
        db.refresh(db_nota)
        return db_nota

    @staticmethod
    def create_importada(db: Session, nota: NotaFiscalImportada):
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

    @staticmethod
    def get_by_numero(db: Session, numero: str):
        return db.query(NotaFiscal).filter(NotaFiscal.numero_nota == numero).first()

    @staticmethod
    def get_condominio_by_cnpj(db: Session, cnpj_limpo: str):
        return (
            db.query(Condominio)
            .filter(
                func.replace(
                    func.replace(
                        func.replace(Condominio.cnpj, ".", ""),
                        "/", ""
                    ),
                    "-", ""
                ) == cnpj_limpo
            )
            .first()
        )
