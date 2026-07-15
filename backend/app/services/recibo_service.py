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

        if ReciboRepository.get_by_numero(db, numero):
            numero = ReciboRepository.proximo_numero(db, ano)

        # Resolve condominio_id: prioridade → payload → cliente vinculado
        condominio_id = payload.condominio_id
        if not condominio_id and payload.cliente_id:
            from app.models.cliente_model import Cliente
            cliente = db.get(Cliente, payload.cliente_id)
            if cliente and cliente.condominio_id:
                condominio_id = cliente.condominio_id

        recibo = Recibo(
            numero_recibo=numero,
            tipo=payload.tipo,
            cliente_id=payload.cliente_id,
            condominio_id=condominio_id,
            cliente_nome_avulso=payload.cliente_nome_avulso,
            configuracao_inter_id=payload.configuracao_inter_id,
            cnpj_emitente=payload.cnpj_emitente,
            cnpj_cliente=payload.cnpj_cliente,
            descricao_servico=payload.descricao_servico,
            valor=payload.valor,
            data_emissao=payload.data_emissao,
            data_vencimento=payload.data_vencimento,
            data_pagamento=payload.data_pagamento,
            status=payload.status,
            observacao=payload.observacao,
        )
        recibo = ReciboRepository.create(db, recibo)

        if condominio_id and payload.numero_os:
            # Reaproveita OS existente — só possível quando há condomínio para identificá-la.
            ReciboService._vincular_ou_criar_servico_por_os(
                db, recibo, condominio_id, payload.numero_os, payload.data_servico, tipo=payload.tipo_servico,
            )
        elif payload.tipo == "ENTRADA":
            # ENTRADA sempre gera serviço usando os dados do próprio recibo/cliente,
            # com ou sem condomínio vinculado — nunca depende de checkbox.
            ReciboService._criar_servico(db, recibo, condominio_id, tipo=payload.tipo_servico)
        elif payload.gerar_servico and condominio_id:
            # SAIDA continua opcional via checkbox (pagamento a terceiro, não serviço ao cliente).
            ReciboService._criar_servico(db, recibo, condominio_id, tipo=payload.tipo_servico)

        return recibo

    @staticmethod
    def _vincular_ou_criar_servico_por_os(
        db: Session,
        recibo: Recibo,
        condominio_id: int,
        numero_os: str,
        data_servico: Optional[date],
        tipo: str = "ASSISTENCIA",
    ) -> None:
        """Reaproveita a OS já cadastrada (mesmo padrão do Corpo de Nota — nunca duplica
        ManutencaoAssistencia para a mesma (condominio_id, numero_os)). Se a OS encontrada
        já pertence a outro recibo, não a rouba — cria uma nova em vez de sobrescrever."""
        from app.models.servico_model import ManutencaoAssistencia

        servico = (
            db.query(ManutencaoAssistencia)
            .filter(
                ManutencaoAssistencia.condominio_id == condominio_id,
                ManutencaoAssistencia.numero_os == numero_os,
            )
            .order_by(ManutencaoAssistencia.criado_em.desc())
            .first()
        )
        if servico and servico.recibo_id and servico.recibo_id != recibo.id:
            servico = None

        if servico:
            servico.recibo_id = recibo.id
            db.commit()
            return

        ReciboService._criar_servico(db, recibo, condominio_id, tipo=tipo, numero_os=numero_os, data_servico=data_servico)

    @staticmethod
    def _criar_servico(
        db: Session,
        recibo: Recibo,
        condominio_id: Optional[int],
        tipo: str = "ASSISTENCIA",
        numero_os: Optional[str] = None,
        data_servico: Optional[date] = None,
    ) -> None:
        from app.models.servico_model import ManutencaoAssistencia, TipoServico
        nome_cliente = (
            recibo.cliente.nome if recibo.cliente_id and recibo.cliente
            else recibo.cliente_nome_avulso or "Cliente"
        )
        tipo_enum = TipoServico.MANUTENCAO if tipo == "MANUTENCAO" else TipoServico.ASSISTENCIA
        servico = ManutencaoAssistencia(
            condominio_id=condominio_id,
            tipo=tipo_enum,
            numero_os=numero_os,
            data_servico=data_servico or recibo.data_emissao,
            descricao=f"{recibo.descricao_servico} — {nome_cliente}",
            recibo_id=recibo.id,
        )
        db.add(servico)
        db.commit()

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
        if payload.tipo is not None:
            r.tipo = payload.tipo
        if payload.cliente_id is not None:
            r.cliente_id = payload.cliente_id
        if payload.cliente_nome_avulso is not None:
            r.cliente_nome_avulso = payload.cliente_nome_avulso
        if payload.configuracao_inter_id is not None:
            r.configuracao_inter_id = payload.configuracao_inter_id
        if payload.cnpj_emitente is not None:
            r.cnpj_emitente = payload.cnpj_emitente
        if payload.cnpj_cliente is not None:
            r.cnpj_cliente = payload.cnpj_cliente
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
    def deletar(db: Session, recibo_id: int, motivo: Optional[str] = None) -> None:
        from app.routers.auditoria_router import registrar_exclusao
        r = ReciboService.get_by_id(db, recibo_id)
        dados = {
            "id": r.id,
            "numero_recibo": r.numero_recibo,
            "tipo": r.tipo,
            "valor": str(r.valor),
            "status": r.status,
            "condominio_id": r.condominio_id,
            "cliente_id": r.cliente_id,
            "data_emissao": str(r.data_emissao),
        }
        registrar_exclusao(db, "recibo", recibo_id, dados, motivo)
        r.deletado_em = datetime.utcnow()
        r.status = "CANCELADO"
        ReciboRepository.save(db, r)

    @staticmethod
    def marcar_pago(db: Session, recibo_id: int, data_pagamento: Optional[date] = None) -> Recibo:
        r = ReciboService.get_by_id(db, recibo_id)
        r.status = "PAGO"
        r.data_pagamento = data_pagamento or date.today()
        return ReciboRepository.save(db, r)
