from sqlalchemy.orm import Session
from typing import List, Optional

from app.models.boleto_model import Boleto, SituacaoBoleto


class BoletoRepository:

    @staticmethod
    def create(db: Session, boleto_data: dict) -> Boleto:
        db_boleto = Boleto(**boleto_data)
        db.add(db_boleto)
        db.commit()
        db.refresh(db_boleto)
        return db_boleto

    @staticmethod
    def get_by_id(db: Session, boleto_id: int) -> Optional[Boleto]:
        return db.query(Boleto).filter(Boleto.id == boleto_id).first()

    @staticmethod
    def get_by_nota_fiscal(db: Session, nota_fiscal_id: int) -> Optional[Boleto]:
        return db.query(Boleto).filter(Boleto.nota_fiscal_id == nota_fiscal_id).first()

    @staticmethod
    def get_all_by_nota_fiscal(db: Session, nota_fiscal_id: int) -> List[Boleto]:
        return db.query(Boleto).filter(Boleto.nota_fiscal_id == nota_fiscal_id).order_by(Boleto.numero_parcela).all()

    @staticmethod
    def get_by_nota_and_vencimento(db: Session, nota_fiscal_id: int, data_vencimento) -> Optional[Boleto]:
        from datetime import date as date_type
        return db.query(Boleto).filter(
            Boleto.nota_fiscal_id == nota_fiscal_id,
            Boleto.data_vencimento == data_vencimento,
        ).first()

    @staticmethod
    def get_by_codigo(db: Session, codigo_solicitacao: str) -> Optional[Boleto]:
        return db.query(Boleto).filter(Boleto.codigo_solicitacao == codigo_solicitacao).first()

    @staticmethod
    def get_all(db: Session) -> List[Boleto]:
        return db.query(Boleto).order_by(Boleto.criado_em.desc()).all()

    @staticmethod
    def get_pendentes(db: Session) -> List[Boleto]:
        """Retorna boletos EMABERTO ou VENCIDO para sincronização de status."""
        return db.query(Boleto).filter(
            Boleto.situacao.in_([SituacaoBoleto.EMABERTO, SituacaoBoleto.VENCIDO])
        ).all()

    @staticmethod
    def update(db: Session, db_boleto: Boleto, update_data: dict) -> Boleto:
        for key, value in update_data.items():
            setattr(db_boleto, key, value)
        db.commit()
        db.refresh(db_boleto)
        return db_boleto

    @staticmethod
    def delete(db: Session, db_boleto: Boleto) -> None:
        db.delete(db_boleto)
        db.commit()

    @staticmethod
    def get_stats(db: Session) -> dict:
        boletos = db.query(Boleto).all()
        em_aberto = [b for b in boletos if b.situacao == SituacaoBoleto.EMABERTO]
        pagos = [b for b in boletos if b.situacao == SituacaoBoleto.PAGO]
        vencidos = [b for b in boletos if b.situacao == SituacaoBoleto.VENCIDO]
        return {
            "total": len(boletos),
            "em_aberto": len(em_aberto),
            "pagos": len(pagos),
            "vencidos": len(vencidos),
            "cancelados": sum(1 for b in boletos if b.situacao == SituacaoBoleto.CANCELADO),
            "expirados": sum(1 for b in boletos if b.situacao == SituacaoBoleto.EXPIRADO),
            "baixados": sum(1 for b in boletos if b.situacao == SituacaoBoleto.BAIXADO),
            "valor_total": sum(b.valor_nominal for b in boletos),
            "valor_pago": sum((b.valor_total_recebido or b.valor_nominal) for b in pagos),
            "valor_pendente": sum(b.valor_nominal for b in em_aberto + vencidos),
        }
