from sqlalchemy.orm import Session
from .repository import NotaFiscalRepository
from .schema import NotaFiscalCreate

class NotaFiscalService:
    @staticmethod
    def create_nota(db: Session, nota: NotaFiscalCreate):
        # A lógica de negócio pergunta ao repositório se já existe
        existente = NotaFiscalRepository.get_by_numero(db, nota.numero_nota)
        
        if existente:
            return existente
            
        return NotaFiscalRepository.create(db, nota)

    @staticmethod
    def get_all_notas(db: Session):
        return NotaFiscalRepository.get_all(db)

    @staticmethod
    def get_nota_by_numero(db: Session, numero: str):
        # O serviço apenas repassa a solicitação ao repositório
        return NotaFiscalRepository.get_by_numero(db, numero)
    @staticmethod
    def get_nota_by_id(db: Session, id: int):
        # O serviço apenas repassa a solicitação ao repositório
        return NotaFiscalRepository.get_by_id(db, id)