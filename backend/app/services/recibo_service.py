from datetime import datetime, date
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.recibo_model import Recibo
from app.repositories.recibo_repository import ReciboRepository
from app.schemas.recibo_schema import ReciboCreate, ReciboUpdate


class ReciboService:

    @staticmethod
    def criar(db: Session, payload: ReciboCreate) -> Recibo:
        if not payload.cliente_id and not payload.cliente_nome_avulso:
            raise HTTPException(status_code=422, detail="Informe cliente_id ou cliente_nome_avulso.")

        ano = payload.data_emissao.year
        numero = payload.numero_recibo or ReciboRepository.proximo_numero(db, ano)

        # Garante número único
        if ReciboRepository.get_by_numero(db, numero):
            numero = ReciboRepository.proximo_numero(db, ano)

        recibo = Recibo(
            numero_recibo=numero,
            cliente_id=payload.cliente_id,
            condominio_id=payload.condominio_id,
            cliente_nome_avulso=payload.cliente_nome_avulso,
            descricao_servico=payload.descricao_servico,
            valor=payload.valor,
            data_emissao=payload.data_emissao,
            data_vencimento=payload.data_vencimento,
            data_pagamento=payload.data_pagamento,
            status=payload.status,
            observacao=payload.observacao,
        )
        return ReciboRepository.create(db, recibo)

    @staticmethod
    def get_by_id(db: Session, recibo_id: int) -> Recibo:
        r = ReciboRepository.get_by_id(db, recibo_id)
        if not r:
            raise HTTPException(status_code=404, detail="Recibo não encontrado.")
        return r

    @staticmethod
    def list_all(
        db: Session,
        condominio_id: Optional[int] = None,
        cliente_id: Optional[int] = None,
        status: Optional[str] = None,
        ano: Optional[int] = None,
        mes: Optional[int] = None,
    ) -> List[Recibo]:
        return ReciboRepository.list_all(db, condominio_id, cliente_id, status, ano, mes)

    @staticmethod
    def atualizar(db: Session, recibo_id: int, payload: ReciboUpdate) -> Recibo:
        r = ReciboService.get_by_id(db, recibo_id)
        if payload.cliente_id is not None:
            r.cliente_id = payload.cliente_id
        if payload.cliente_nome_avulso is not None:
            r.cliente_nome_avulso = payload.cliente_nome_avulso
        if payload.descricao_servico is not None:
            r.descricao_servico = payload.descricao_servico
        if payload.valor is not None:
            r.valor = payload.valor
        if payload.data_emissao is not None:
            r.data_emissao = payload.data_emissao
        if payload.data_vencimento is not None:
            r.data_vencimento = payload.data_vencimento
        if payload.data_pagamento is not None:
            r.data_pagamento = payload.data_pagamento
        if payload.status is not None:
            r.status = payload.status
        if payload.observacao is not None:
            r.observacao = payload.observacao
        return ReciboRepository.save(db, r)

    @staticmethod
    def deletar(db: Session, recibo_id: int) -> None:
        r = ReciboService.get_by_id(db, recibo_id)
        r.deletado_em = datetime.utcnow()
        r.status = "CANCELADO"
        ReciboRepository.save(db, r)

    @staticmethod
    def marcar_pago(db: Session, recibo_id: int, data_pagamento: Optional[date] = None) -> Recibo:
        r = ReciboService.get_by_id(db, recibo_id)
        r.status = "PAGO"
        r.data_pagamento = data_pagamento or date.today()
        return ReciboRepository.save(db, r)
