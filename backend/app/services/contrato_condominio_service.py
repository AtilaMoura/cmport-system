from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.contrato_condominio_model import ContratoCondominio
from app.repositories.contrato_condominio_repository import ContratoCondominioRepository


class ContratoCondominioService:

    @staticmethod
    def get_by_condominio(db: Session, condominio_id: int) -> Optional[ContratoCondominio]:
        return ContratoCondominioRepository.get_by_condominio(db, condominio_id)

    @staticmethod
    def list_all(db: Session, apenas_ativos: bool = False) -> List[ContratoCondominio]:
        return ContratoCondominioRepository.list_all(db, apenas_ativos)

    @staticmethod
    def criar_ou_atualizar(
        db: Session,
        condominio_id: int,
        ativo: bool,
        data_inicio: date,
        data_termino: Optional[date],
        dia_vencimento_padrao: Optional[int] = None,
        valor_fixo_mensal: Optional[Decimal] = None,
        descricao_padrao_servico: Optional[str] = None,
        observacoes_contrato: Optional[str] = None,
        usuario: Optional[str] = None,
    ) -> ContratoCondominio:
        if data_termino and data_termino < data_inicio:
            raise HTTPException(status_code=422, detail="data_termino não pode ser anterior a data_inicio.")
        if dia_vencimento_padrao is not None and not (1 <= dia_vencimento_padrao <= 28):
            raise HTTPException(status_code=422, detail="dia_vencimento_padrao deve ser entre 1 e 28.")

        contrato = ContratoCondominioRepository.get_by_condominio(db, condominio_id)
        if contrato:
            contrato.ativo = ativo
            contrato.data_inicio = data_inicio
            contrato.data_termino = data_termino
            contrato.dia_vencimento_padrao = dia_vencimento_padrao
            contrato.valor_fixo_mensal = valor_fixo_mensal
            contrato.descricao_padrao_servico = descricao_padrao_servico
            contrato.observacoes_contrato = observacoes_contrato
        else:
            contrato = ContratoCondominio(
                condominio_id=condominio_id,
                ativo=ativo,
                data_inicio=data_inicio,
                data_termino=data_termino,
                dia_vencimento_padrao=dia_vencimento_padrao,
                valor_fixo_mensal=valor_fixo_mensal,
                descricao_padrao_servico=descricao_padrao_servico,
                observacoes_contrato=observacoes_contrato,
                criado_por=usuario,
            )
        return ContratoCondominioRepository.save(db, contrato)

    @staticmethod
    def toggle_ativo(db: Session, contrato_id: int) -> ContratoCondominio:
        contrato = ContratoCondominioRepository.get_by_id(db, contrato_id)
        if not contrato:
            raise HTTPException(status_code=404, detail="Contrato não encontrado.")
        contrato.ativo = not contrato.ativo
        return ContratoCondominioRepository.save(db, contrato)

    @staticmethod
    def deletar(db: Session, contrato_id: int, usuario: Optional[str] = None) -> None:
        contrato = ContratoCondominioRepository.get_by_id(db, contrato_id)
        if not contrato:
            raise HTTPException(status_code=404, detail="Contrato não encontrado.")

        from app.routers.auditoria_router import registrar_exclusao
        registrar_exclusao(
            db=db,
            tipo="contratos_condominio",
            registro_id=contrato.id,
            dados={
                "id": contrato.id,
                "condominio_id": contrato.condominio_id,
                "ativo": contrato.ativo,
                "data_inicio": str(contrato.data_inicio),
                "data_termino": str(contrato.data_termino) if contrato.data_termino else None,
                "dia_vencimento_padrao": contrato.dia_vencimento_padrao,
                "valor_fixo_mensal": str(contrato.valor_fixo_mensal) if contrato.valor_fixo_mensal else None,
                "criado_por": contrato.criado_por,
            },
            motivo=f"Exclusão por {usuario or 'sistema'}",
        )
        contrato.deletado_em = datetime.utcnow()
        ContratoCondominioRepository.save(db, contrato)
