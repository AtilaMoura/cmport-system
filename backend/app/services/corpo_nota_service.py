import logging
from datetime import date, datetime
from typing import Optional, List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.corpo_nota_model import CorpoNota, StatusCorpoNota
from app.models.ciclo_nota_model import TipoNotaCorpo
from app.repositories.corpo_nota_repository import CorpoNotaRepository
from app.repositories.ciclo_nota_repository import CicloNotaRepository
from app.services.ciclo_nota_service import CicloNotaService
from app.services.imposto_service import ImpostoService, ImpostosCalculados

logger = logging.getLogger(__name__)

# Transições de status válidas: {status_atual: [status_destino_permitidos]}
_TRANSICOES = {
    StatusCorpoNota.PENDENTE:       [StatusCorpoNota.EM_MONTAGEM, StatusCorpoNota.CANCELADO],
    StatusCorpoNota.EM_MONTAGEM:    [StatusCorpoNota.GERADO, StatusCorpoNota.CANCELADO],
    StatusCorpoNota.GERADO:         [StatusCorpoNota.XML_VINCULADO, StatusCorpoNota.CANCELADO],
    StatusCorpoNota.XML_VINCULADO:  [StatusCorpoNota.BOLETO_GERADO, StatusCorpoNota.CANCELADO],
    StatusCorpoNota.BOLETO_GERADO:  [StatusCorpoNota.PAGO, StatusCorpoNota.CANCELADO],
    StatusCorpoNota.PAGO:           [],   # estado final — não cancelável
    StatusCorpoNota.CANCELADO:      [StatusCorpoNota.PENDENTE],
}


class CorpoNotaService:

    # ── Leitura ──────────────────────────────────────────────────────────────

    @staticmethod
    def get_by_id(db: Session, corpo_id: int) -> CorpoNota:
        corpo = CorpoNotaRepository.get_by_id(db, corpo_id)
        if not corpo:
            raise HTTPException(status_code=404, detail="Corpo da nota não encontrado.")
        return corpo

    @staticmethod
    def list_by_condominio(
        db: Session,
        condominio_id: int,
        status: Optional[StatusCorpoNota] = None,
    ) -> List[CorpoNota]:
        return CorpoNotaRepository.list_by_condominio(db, condominio_id, status)

    @staticmethod
    def list_by_ciclo(db: Session, ciclo_id: int) -> List[CorpoNota]:
        return CorpoNotaRepository.list_by_ciclo(db, ciclo_id)

    # ── Criação ──────────────────────────────────────────────────────────────

    @staticmethod
    def criar(
        db: Session,
        condominio_id: int,
        tipo_nota: TipoNotaCorpo,
        ano: int,
        mes: int,
        contrato_id: Optional[int] = None,
        servico_id: Optional[int] = None,
        numero_os: Optional[str] = None,
        data_servico: Optional[date] = None,
        descricao_servico: Optional[str] = None,
        valor_bruto: Optional[float] = None,
        data_vencimento: Optional[date] = None,
        observacoes: Optional[str] = None,
        tem_garantia: bool = False,
        usuario: Optional[str] = None,
        configuracao_inter_id: Optional[int] = None,
        orcamento_id: Optional[int] = None,
        data_servico_texto: Optional[str] = None,
        descricao_garantia: Optional[str] = None,
        valor_nota_produto: Optional[float] = None,
        numero_parcelas: Optional[int] = 1,
        parcelas_json: Optional[list] = None,
        produtos_json: Optional[list] = None,
        sem_retencao: bool = False,
    ) -> CorpoNota:
        if mes < 1 or mes > 12:
            raise HTTPException(status_code=422, detail="mes deve ser entre 1 e 12.")
        if ano < 2020:
            raise HTTPException(status_code=422, detail="ano deve ser >= 2020.")

        # Obtém ou cria o ciclo do mês (inclui contrato_id para suporte a múltiplos contratos)
        ciclo = CicloNotaService.get_or_create(db, condominio_id, tipo_nota, ano, mes, contrato_id)

        # Impede dois corpos ativos no mesmo ciclo
        existente = CorpoNotaRepository.get_ativo_por_ciclo(db, ciclo.id)
        if existente:
            raise HTTPException(
                status_code=409,
                detail=f"Já existe um corpo ativo (id={existente.id}) para este ciclo. Cancele-o antes de criar outro.",
            )

        # Auto-fill a partir do contrato (baixa prioridade — sobreposto pelo operador e pela OS)
        from app.repositories.contrato_condominio_repository import ContratoCondominioRepository
        contrato = ContratoCondominioRepository.get_by_condominio(db, condominio_id)

        if contrato and contrato.ativo:
            if descricao_servico is None and contrato.descricao_padrao_servico:
                descricao_servico = contrato.descricao_padrao_servico
            if valor_bruto is None and contrato.valor_fixo_mensal:
                valor_bruto = float(contrato.valor_fixo_mensal)
            if data_vencimento is None and contrato.dia_vencimento_padrao:
                from calendar import monthrange
                dia = min(contrato.dia_vencimento_padrao, monthrange(ano, mes)[1])
                data_vencimento = date(ano, mes, dia)

        # Auto-fill a partir da OS
        preenchimento_manual = False
        corpo_dados = CorpoNotaService._auto_fill_os(
            db, condominio_id, tipo_nota, ano, mes,
            servico_id, numero_os, data_servico, descricao_servico,
        )
        if corpo_dados["preenchimento_manual"]:
            preenchimento_manual = True

        # Mescla dados fornecidos pelo operador (têm prioridade sobre auto-fill)
        if numero_os:
            corpo_dados["numero_os"] = numero_os
        if data_servico:
            corpo_dados["data_servico"] = data_servico
        if descricao_servico:
            corpo_dados["descricao_servico"] = descricao_servico
        if valor_bruto is not None:
            corpo_dados["valor_bruto"] = valor_bruto
            corpo_dados["preenchimento_manual"] = True

        # Calcula impostos se tiver valor_bruto (e sem_retencao não estiver ativo)
        impostos: Optional[ImpostosCalculados] = None
        if corpo_dados.get("valor_bruto") and not sem_retencao:
            impostos = ImpostoService.calcular_impostos(
                db, float(corpo_dados["valor_bruto"]), tipo_nota.value
            )

        mes_ref = f"{mes:02d}/{ano}"

        numero_referencia = CorpoNotaService._gerar_numero_referencia(db, tipo_nota, ano)

        # Atribui e incrementa número sequencial de NF da conta Inter
        numero_nf_atribuido = None
        if configuracao_inter_id:
            from app.models.configuracao_model import ConfiguracaoInter
            conta = (
                db.query(ConfiguracaoInter)
                .filter(ConfiguracaoInter.id == configuracao_inter_id)
                .with_for_update()
                .first()
            )
            if conta:
                if tipo_nota == TipoNotaCorpo.PRODUTO:
                    numero_nf_atribuido = conta.numero_nf_produto
                    if numero_nf_atribuido:
                        conta.numero_nf_produto = numero_nf_atribuido + 1
                else:
                    numero_nf_atribuido = conta.numero_nf_servico
                    if numero_nf_atribuido:
                        conta.numero_nf_servico = numero_nf_atribuido + 1
                db.add(conta)

        # Para SERVICO com nota de produto: atribui numero_nf_produto do contador
        numero_nf_produto_atribuido = None
        if tipo_nota == TipoNotaCorpo.SERVICO and corpo_dados.get("valor_nota_produto") and configuracao_inter_id:
            from app.models.configuracao_model import ConfiguracaoInter as _CI
            conta_prod = (
                db.query(_CI)
                .filter(_CI.id == configuracao_inter_id)
                .with_for_update()
                .first()
            )
            if conta_prod:
                numero_nf_produto_atribuido = conta_prod.numero_nf_produto or 1
                conta_prod.numero_nf_produto = numero_nf_produto_atribuido + 1
                db.add(conta_prod)

        corpo = CorpoNota(
            ciclo_id=ciclo.id,
            condominio_id=condominio_id,
            tipo_nota=tipo_nota,
            numero_referencia=numero_referencia,
            servico_id=corpo_dados.get("servico_id"),
            numero_os=corpo_dados.get("numero_os"),
            data_servico=corpo_dados.get("data_servico"),
            descricao_servico=corpo_dados.get("descricao_servico"),
            valor_bruto=corpo_dados.get("valor_bruto"),
            percentual_inss=impostos.percentual_inss if impostos else None,
            percentual_cofins=impostos.percentual_cofins if impostos else None,
            percentual_pis=impostos.percentual_pis if impostos else None,
            percentual_csll=impostos.percentual_csll if impostos else None,
            valor_inss=impostos.valor_inss if impostos else None,
            valor_cofins=impostos.valor_cofins if impostos else None,
            valor_pis=impostos.valor_pis if impostos else None,
            valor_csll=impostos.valor_csll if impostos else None,
            valor_liquido=impostos.valor_liquido if impostos else (
                float(corpo_dados["valor_bruto"]) if sem_retencao and corpo_dados.get("valor_bruto") else None
            ),
            sem_retencao=sem_retencao,
            data_vencimento=data_vencimento,
            mes_referencia=mes_ref,
            observacoes=observacoes,
            preenchimento_manual=preenchimento_manual or corpo_dados.get("preenchimento_manual", False),
            status=StatusCorpoNota.EM_MONTAGEM,
            tem_garantia=tem_garantia,
            criado_por=usuario,
            configuracao_inter_id=configuracao_inter_id,
            orcamento_id=orcamento_id,
            data_servico_texto=data_servico_texto,
            descricao_garantia=descricao_garantia,
            valor_nota_produto=valor_nota_produto,
            numero_parcelas=numero_parcelas or 1,
            numero_nf=numero_nf_atribuido,
            numero_nf_produto=numero_nf_produto_atribuido,
            parcelas_json=parcelas_json,
            produtos_json=produtos_json,
        )
        # Salva ISS se disponível no modelo (coluna adicionada via migration)
        if impostos and hasattr(corpo, "percentual_iss"):
            corpo.percentual_iss = getattr(impostos, "percentual_iss", 0.0)
            corpo.valor_iss = getattr(impostos, "valor_iss", 0.0)
        corpo = CorpoNotaRepository.create(db, corpo)

        # Gera o conteúdo textual imediatamente após criação
        corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)
        corpo = CorpoNotaRepository.save(db, corpo)

        CicloNotaService.atualizar_status_pelo_corpo(db, ciclo)
        return corpo

    # ── Edição ───────────────────────────────────────────────────────────────

    @staticmethod
    def atualizar(
        db: Session,
        corpo_id: int,
        numero_os: Optional[str] = None,
        data_servico: Optional[date] = None,
        descricao_servico: Optional[str] = None,
        valor_bruto: Optional[float] = None,
        data_vencimento: Optional[date] = None,
        observacoes: Optional[str] = None,
        percentuais_override: Optional[dict] = None,
        tem_garantia: Optional[bool] = None,
        termo_garantia_id: Optional[int] = None,
        configuracao_inter_id: Optional[int] = None,
        orcamento_id: Optional[int] = None,
        data_servico_texto: Optional[str] = None,
        descricao_garantia: Optional[str] = None,
        valor_nota_produto: Optional[float] = None,
        numero_parcelas: Optional[int] = None,
        numero_nf: Optional[int] = None,
        numero_nf_produto: Optional[int] = None,
        parcelas_json: Optional[list] = None,
        produtos_json: Optional[list] = None,
        sem_retencao: Optional[bool] = None,
    ) -> CorpoNota:
        corpo = CorpoNotaService.get_by_id(db, corpo_id)

        if corpo.status in (StatusCorpoNota.PAGO, StatusCorpoNota.CANCELADO):
            raise HTTPException(status_code=403, detail="Corpo em status final — não é possível editar.")

        financeiro_bloqueado = corpo.status == StatusCorpoNota.XML_VINCULADO or corpo.status == StatusCorpoNota.BOLETO_GERADO

        if numero_os is not None:
            corpo.numero_os = numero_os
            corpo.preenchimento_manual = True
        if data_servico is not None:
            corpo.data_servico = data_servico
        if descricao_servico is not None:
            corpo.descricao_servico = descricao_servico
        if observacoes is not None:
            corpo.observacoes = observacoes
        if tem_garantia is not None:
            corpo.tem_garantia = tem_garantia
        if termo_garantia_id is not None:
            corpo.termo_garantia_id = termo_garantia_id
        if configuracao_inter_id is not None:
            corpo.configuracao_inter_id = configuracao_inter_id
        if orcamento_id is not None:
            corpo.orcamento_id = orcamento_id
        if data_servico_texto is not None:
            corpo.data_servico_texto = data_servico_texto
        if descricao_garantia is not None:
            corpo.descricao_garantia = descricao_garantia
        if valor_nota_produto is not None:
            corpo.valor_nota_produto = valor_nota_produto
        if numero_parcelas is not None:
            corpo.numero_parcelas = numero_parcelas
        if numero_nf is not None:
            corpo.numero_nf = numero_nf
        if numero_nf_produto is not None:
            corpo.numero_nf_produto = numero_nf_produto
        if parcelas_json is not None:
            corpo.parcelas_json = parcelas_json
        if produtos_json is not None:
            corpo.produtos_json = produtos_json
        if sem_retencao is not None:
            corpo.sem_retencao = sem_retencao

        if not financeiro_bloqueado:
            if valor_bruto is not None:
                corpo.valor_bruto = valor_bruto
                corpo.preenchimento_manual = True
            if data_vencimento is not None:
                corpo.data_vencimento = data_vencimento
            if corpo.valor_bruto:
                if corpo.sem_retencao:
                    corpo.percentual_inss = None
                    corpo.percentual_cofins = None
                    corpo.percentual_pis = None
                    corpo.percentual_csll = None
                    corpo.valor_inss = None
                    corpo.valor_cofins = None
                    corpo.valor_pis = None
                    corpo.valor_csll = None
                    corpo.valor_liquido = float(corpo.valor_bruto)
                else:
                    impostos = ImpostoService.calcular_impostos(
                        db, float(corpo.valor_bruto), corpo.tipo_nota.value, percentuais_override
                    )
                    corpo.percentual_inss = impostos.percentual_inss
                    corpo.percentual_cofins = impostos.percentual_cofins
                    corpo.percentual_pis = impostos.percentual_pis
                    corpo.percentual_csll = impostos.percentual_csll
                    corpo.valor_inss = impostos.valor_inss
                    corpo.valor_cofins = impostos.valor_cofins
                    corpo.valor_pis = impostos.valor_pis
                    corpo.valor_csll = impostos.valor_csll
                    corpo.valor_liquido = impostos.valor_liquido

        # Regenera o texto com os dados atualizados
        corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)
        return CorpoNotaRepository.save(db, corpo)

    # ── Status ───────────────────────────────────────────────────────────────

    @staticmethod
    def atualizar_status(
        db: Session,
        corpo_id: int,
        novo_status: StatusCorpoNota,
        motivo: Optional[str] = None,
    ) -> CorpoNota:
        corpo = CorpoNotaService.get_by_id(db, corpo_id)

        permitidos = _TRANSICOES.get(corpo.status, [])
        if novo_status not in permitidos:
            raise HTTPException(
                status_code=422,
                detail=f"Transição inválida: {corpo.status.value} → {novo_status.value}. Permitidos: {[s.value for s in permitidos]}",
            )

        if novo_status == StatusCorpoNota.GERADO:
            CorpoNotaService._validar_campos_para_gerar(corpo)
            corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)

        corpo.status = novo_status
        corpo = CorpoNotaRepository.save(db, corpo)

        ciclo = CicloNotaRepository.get_by_id(db, corpo.ciclo_id)
        if ciclo:
            CicloNotaService.atualizar_status_pelo_corpo(db, ciclo)

        return corpo

    # ── Preview ──────────────────────────────────────────────────────────────

    @staticmethod
    def gerar_preview(
        db: Session,
        condominio_id: int,
        tipo_nota: TipoNotaCorpo,
        numero_os: Optional[str],
        data_servico: Optional[date],
        descricao_servico: Optional[str],
        valor_bruto: Optional[float],
        data_vencimento: Optional[date],
        mes_referencia: Optional[str],
        observacoes: Optional[str],
        percentuais_override: Optional[dict] = None,
        data_servico_texto: Optional[str] = None,
        descricao_garantia: Optional[str] = None,
        valor_nota_produto: Optional[float] = None,
        numero_parcelas: Optional[int] = 1,
        numero_nf: Optional[int] = None,
        parcelas_json: Optional[list] = None,
        produtos_json: Optional[list] = None,
        sem_retencao: bool = False,
    ) -> dict:
        impostos = None
        if valor_bruto and not sem_retencao:
            impostos = ImpostoService.calcular_impostos(
                db, float(valor_bruto), tipo_nota.value, percentuais_override
            )

        from app.models.condominio_model import Condominio
        condominio = db.query(Condominio).filter(Condominio.id == condominio_id).first()
        nome_cond = condominio.nome if condominio else f"Condomínio #{condominio_id}"
        cnpj_cond = getattr(condominio, "cnpj", None) if condominio else None
        razao_social_cond = getattr(condominio, "razao_social", None) if condominio else None

        from app.repositories.contrato_condominio_repository import ContratoCondominioRepository
        contrato = ContratoCondominioRepository.get_by_condominio(db, condominio_id)
        contrato_inicio = contrato.data_inicio if contrato else None

        if tipo_nota == TipoNotaCorpo.PRODUTO:
            texto = CorpoNotaService._montar_texto_produto(
                nome_cond=nome_cond,
                descricao_servico=descricao_servico or "",
                numero_os=numero_os,
                data_servico_texto=data_servico_texto,
                data_servico=data_servico,
                valor_bruto=valor_bruto,
                data_vencimento=data_vencimento,
                numero_parcelas=numero_parcelas or 1,
                descricao_garantia=descricao_garantia,
                observacoes=observacoes,
                numero_nf=numero_nf,
                parcelas_json=parcelas_json,
                produtos_json=produtos_json,
            )
        elif tipo_nota == TipoNotaCorpo.SERVICO:
            texto = CorpoNotaService._montar_texto_servico(
                nome_cond=nome_cond,
                mes_referencia=mes_referencia or "",
                descricao_servico=descricao_servico or "",
                numero_os=numero_os,
                data_servico_texto=data_servico_texto,
                data_servico=data_servico,
                valor_bruto=valor_bruto,
                impostos=impostos,
                data_vencimento=data_vencimento,
                observacoes=observacoes,
                descricao_garantia=descricao_garantia,
                valor_nota_produto=valor_nota_produto,
                numero_parcelas=numero_parcelas or 1,
                numero_nf=numero_nf,
                parcelas_json=parcelas_json,
                produtos_json=produtos_json,
                sem_retencao=sem_retencao,
            )
        else:
            texto = CorpoNotaService._montar_texto(
                nome_cond=nome_cond,
                mes_referencia=mes_referencia or "",
                descricao_servico=descricao_servico or "",
                numero_os=numero_os,
                data_servico=data_servico,
                valor_bruto=valor_bruto,
                impostos=impostos,
                data_vencimento=data_vencimento,
                observacoes=observacoes,
                cnpj_cond=cnpj_cond,
                razao_social_cond=razao_social_cond,
                contrato_inicio=contrato_inicio,
                numero_nf=numero_nf,
                sem_retencao=sem_retencao,
            )
        return {"conteudo_gerado": texto, "impostos_calculados": impostos}

    # ── Vínculo com nota fiscal ───────────────────────────────────────────────

    @staticmethod
    def vincular_nota_fiscal(db: Session, corpo_id: int, nota_fiscal_id: int) -> CorpoNota:
        corpo = CorpoNotaService.get_by_id(db, corpo_id)

        if corpo.nota_fiscal_id:
            raise HTTPException(status_code=409, detail="Este corpo já está vinculado a uma nota fiscal.")
        if corpo.status not in (StatusCorpoNota.PENDENTE, StatusCorpoNota.EM_MONTAGEM, StatusCorpoNota.GERADO):
            raise HTTPException(status_code=422, detail=f"Não é possível vincular nota em status {corpo.status.value}.")

        from app.models.nota_fiscal_model import NotaFiscal
        nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_fiscal_id).first()
        if not nota:
            raise HTTPException(status_code=404, detail="Nota fiscal não encontrada.")
        if nota.condominio_id and nota.condominio_id != corpo.condominio_id:
            raise HTTPException(status_code=422, detail="Nota fiscal pertence a condomínio diferente.")
        if nota.corpo_nota_id and nota.corpo_nota_id != corpo_id:
            raise HTTPException(status_code=409, detail="Nota fiscal já vinculada a outro corpo.")

        corpo.nota_fiscal_id = nota_fiscal_id
        corpo.status = StatusCorpoNota.XML_VINCULADO
        nota.corpo_nota_id = corpo_id

        db.add(nota)
        corpo = CorpoNotaRepository.save(db, corpo)

        ciclo = CicloNotaRepository.get_by_id(db, corpo.ciclo_id)
        if ciclo:
            CicloNotaService.atualizar_status_pelo_corpo(db, ciclo)

        logger.info(f"CorpoNota {corpo_id} vinculado manualmente à NotaFiscal {nota_fiscal_id}")
        return corpo

    # ── Soft delete ──────────────────────────────────────────────────────────

    @staticmethod
    def deletar(db: Session, corpo_id: int, usuario: Optional[str] = None) -> None:
        corpo = CorpoNotaService.get_by_id(db, corpo_id)

        if corpo.status == StatusCorpoNota.PAGO:
            raise HTTPException(status_code=403, detail="Não é possível excluir corpo com status PAGO.")

        from app.routers.auditoria_router import registrar_exclusao
        registrar_exclusao(
            db=db,
            tipo="corpos_nota",
            registro_id=corpo.id,
            dados={
                "id": corpo.id,
                "ciclo_id": corpo.ciclo_id,
                "condominio_id": corpo.condominio_id,
                "tipo_nota": corpo.tipo_nota.value,
                "status": corpo.status.value,
                "numero_os": corpo.numero_os,
                "valor_bruto": str(corpo.valor_bruto) if corpo.valor_bruto else None,
                "valor_liquido": str(corpo.valor_liquido) if corpo.valor_liquido else None,
                "nota_fiscal_id": corpo.nota_fiscal_id,
            },
            motivo=f"Exclusão por {usuario or 'sistema'}",
        )
        corpo.deletado_em = datetime.utcnow()
        CorpoNotaRepository.save(db, corpo)

    # ── Geração de número NF ─────────────────────────────────────────────────

    @staticmethod
    def gerar_numero_nf(db: Session, corpo_id: int) -> CorpoNota:
        corpo = CorpoNotaService.get_by_id(db, corpo_id)

        if corpo.status in (StatusCorpoNota.PAGO, StatusCorpoNota.CANCELADO):
            raise HTTPException(status_code=403, detail="Não é possível gerar número NF em status final.")

        if not corpo.configuracao_inter_id:
            raise HTTPException(status_code=422, detail="Selecione um CNPJ/Conta Inter antes de gerar o número NF.")

        from app.models.configuracao_model import ConfiguracaoInter
        conta = (
            db.query(ConfiguracaoInter)
            .filter(ConfiguracaoInter.id == corpo.configuracao_inter_id)
            .with_for_update()
            .first()
        )
        if not conta:
            raise HTTPException(status_code=404, detail="Conta Inter não encontrada.")

        if corpo.tipo_nota == TipoNotaCorpo.PRODUTO:
            numero = conta.numero_nf_produto or 1
            conta.numero_nf_produto = numero + 1
            db.add(conta)
            corpo.numero_nf = numero
        else:
            numero = conta.numero_nf_servico or 1
            conta.numero_nf_servico = numero + 1
            db.add(conta)
            corpo.numero_nf = numero

            # Para corpo SERVICO com nota de produto: atribui numero_nf_produto também
            if corpo.valor_nota_produto and not corpo.numero_nf_produto:
                conta_prod = (
                    db.query(ConfiguracaoInter)
                    .filter(ConfiguracaoInter.tipo_nota == "PRODUTO")
                    .with_for_update()
                    .first()
                )
                if conta_prod:
                    num_prod = conta_prod.numero_nf_produto or 1
                    conta_prod.numero_nf_produto = num_prod + 1
                    db.add(conta_prod)
                    corpo.numero_nf_produto = num_prod

        corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)
        return CorpoNotaRepository.save(db, corpo)

    @staticmethod
    def gerar_numero_nf_produto(db: Session, corpo_id: int) -> CorpoNota:
        """Atribui/reatribui numero_nf_produto em corpo SERVICO com valor_nota_produto."""
        corpo = CorpoNotaService.get_by_id(db, corpo_id)

        if corpo.tipo_nota != TipoNotaCorpo.SERVICO:
            raise HTTPException(status_code=422, detail="Apenas corpos SERVICO possuem NF de produto.")

        if not corpo.valor_nota_produto:
            raise HTTPException(status_code=422, detail="Corpo não possui valor de nota de produto.")

        if corpo.status in (StatusCorpoNota.PAGO, StatusCorpoNota.CANCELADO):
            raise HTTPException(status_code=403, detail="Não é possível gerar número em status final.")

        from app.models.configuracao_model import ConfiguracaoInter
        conta_prod = (
            db.query(ConfiguracaoInter)
            .filter(ConfiguracaoInter.tipo_nota == "PRODUTO")
            .with_for_update()
            .first()
        )
        if not conta_prod:
            raise HTTPException(status_code=404, detail="Conta Inter de produto não configurada.")

        num_prod = conta_prod.numero_nf_produto or 1
        conta_prod.numero_nf_produto = num_prod + 1
        db.add(conta_prod)
        corpo.numero_nf_produto = num_prod
        corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)
        return CorpoNotaRepository.save(db, corpo)

    # ── Helpers privados ─────────────────────────────────────────────────────

    @staticmethod
    def _gerar_numero_referencia(db: Session, tipo_nota: TipoNotaCorpo, ano: int) -> str:
        """Gera número sequencial anual: MAT-2026/0001, MAT-2026/0002..."""
        prefixo_tipo = {
            TipoNotaCorpo.MANUTENCAO: "MAT",
            TipoNotaCorpo.SERVICO: "SRV",
            TipoNotaCorpo.PRODUTO: "PRD",
        }.get(tipo_nota, "REF")

        prefixo = f"{prefixo_tipo}-{ano}/"
        from sqlalchemy import func as sqlfunc
        ultimo = (
            db.query(CorpoNota.numero_referencia)
            .filter(CorpoNota.numero_referencia.like(f"{prefixo}%"))
            .order_by(CorpoNota.numero_referencia.desc())
            .first()
        )
        proximo = 1
        if ultimo and ultimo[0]:
            try:
                proximo = int(ultimo[0].split("/")[-1]) + 1
            except Exception:
                pass
        return f"{prefixo}{proximo:04d}"

    @staticmethod
    def _auto_fill_os(
        db: Session,
        condominio_id: int,
        tipo_nota: TipoNotaCorpo,
        ano: int,
        mes: int,
        servico_id: Optional[int],
        numero_os: Optional[str],
        data_servico: Optional[date],
        descricao_servico: Optional[str],
    ) -> dict:
        from app.models.servico_model import ManutencaoAssistencia, TipoServico

        resultado = {
            "servico_id": servico_id,
            "numero_os": numero_os,
            "data_servico": data_servico,
            "descricao_servico": descricao_servico,
            "valor_bruto": None,
            "preenchimento_manual": bool(numero_os or data_servico or descricao_servico),
        }

        if servico_id:
            return resultado

        if tipo_nota != TipoNotaCorpo.MANUTENCAO:
            return resultado

        # Busca OS de manutenção mais recente do condomínio (sem filtro de data/nota)
        servico = (
            db.query(ManutencaoAssistencia)
            .filter(
                ManutencaoAssistencia.condominio_id == condominio_id,
                ManutencaoAssistencia.tipo == TipoServico.MANUTENCAO,
            )
            .order_by(ManutencaoAssistencia.data_servico.desc())
            .first()
        )

        if servico:
            resultado["servico_id"] = servico.id
            if not resultado["numero_os"]:
                resultado["numero_os"] = servico.numero_os
            if not resultado["data_servico"]:
                resultado["data_servico"] = servico.data_servico
            if not resultado["descricao_servico"]:
                resultado["descricao_servico"] = servico.descricao
            resultado["preenchimento_manual"] = False

        return resultado

    @staticmethod
    def _validar_campos_para_gerar(corpo: CorpoNota) -> None:
        erros = []
        if not corpo.valor_bruto:
            erros.append("valor_bruto")
        if not corpo.data_vencimento:
            erros.append("data_vencimento")
        if not corpo.descricao_servico:
            erros.append("descricao_servico")
        if erros:
            raise HTTPException(
                status_code=422,
                detail=f"Campos obrigatórios para GERADO ausentes: {', '.join(erros)}",
            )

    @staticmethod
    def _gerar_conteudo(db: Session, corpo: CorpoNota) -> str:
        from app.models.condominio_model import Condominio
        condominio = db.query(Condominio).filter(Condominio.id == corpo.condominio_id).first()
        nome_cond = condominio.nome if condominio else f"Condomínio #{corpo.condominio_id}"
        cnpj_cond = getattr(condominio, "cnpj", None) if condominio else None
        razao_social_cond = getattr(condominio, "razao_social", None) if condominio else None

        from app.repositories.contrato_condominio_repository import ContratoCondominioRepository
        contrato = ContratoCondominioRepository.get_by_condominio(db, corpo.condominio_id)
        contrato_inicio = contrato.data_inicio if contrato else None

        from app.services.imposto_service import ImpostosCalculados, ImpostoService
        sem_retencao = getattr(corpo, "sem_retencao", False) or False
        impostos = None
        if corpo.valor_bruto:
            if sem_retencao:
                # Sem retenção: valor líquido = valor bruto, sem cálculo de impostos
                corpo.valor_liquido = corpo.valor_bruto
            else:
                # Se os percentuais foram salvos corretamente, usa-os diretamente
                tem_percentuais = any([
                    float(corpo.percentual_inss or 0) > 0,
                    float(corpo.percentual_cofins or 0) > 0,
                    float(corpo.percentual_pis or 0) > 0,
                    float(corpo.percentual_csll or 0) > 0,
                ])
                # Para MANUTENCAO e SERVICO, sempre deve ter retenção — recalcula se zerado
                tipo_com_retencao = corpo.tipo_nota in (TipoNotaCorpo.MANUTENCAO, TipoNotaCorpo.SERVICO)
                if tipo_com_retencao and not tem_percentuais:
                    impostos = ImpostoService.calcular_impostos(db, float(corpo.valor_bruto), corpo.tipo_nota.value)
                    # Atualiza os campos salvos
                    corpo.percentual_inss = impostos.percentual_inss
                    corpo.percentual_cofins = impostos.percentual_cofins
                    corpo.percentual_pis = impostos.percentual_pis
                    corpo.percentual_csll = impostos.percentual_csll
                    corpo.valor_inss = impostos.valor_inss
                    corpo.valor_cofins = impostos.valor_cofins
                    corpo.valor_pis = impostos.valor_pis
                    corpo.valor_csll = impostos.valor_csll
                    corpo.valor_liquido = impostos.valor_liquido
                else:
                    impostos = ImpostosCalculados(
                        percentual_inss=float(corpo.percentual_inss or 0),
                        percentual_cofins=float(corpo.percentual_cofins or 0),
                        percentual_pis=float(corpo.percentual_pis or 0),
                        percentual_csll=float(corpo.percentual_csll or 0),
                        percentual_iss=float(getattr(corpo, "percentual_iss", None) or 0),
                        valor_inss=float(corpo.valor_inss or 0),
                        valor_cofins=float(corpo.valor_cofins or 0),
                        valor_pis=float(corpo.valor_pis or 0),
                        valor_csll=float(corpo.valor_csll or 0),
                        valor_iss=float(getattr(corpo, "valor_iss", None) or 0),
                        valor_liquido=float(corpo.valor_liquido or 0),
                    )

        numero_nf = getattr(corpo, "numero_nf", None)
        numero_parcelas = getattr(corpo, "numero_parcelas", 1) or 1
        parcelas_json = getattr(corpo, "parcelas_json", None)
        produtos_json = getattr(corpo, "produtos_json", None)

        if corpo.tipo_nota == TipoNotaCorpo.PRODUTO:
            return CorpoNotaService._montar_texto_produto(
                nome_cond=nome_cond,
                descricao_servico=corpo.descricao_servico or "",
                numero_os=corpo.numero_os,
                data_servico_texto=getattr(corpo, "data_servico_texto", None),
                data_servico=corpo.data_servico,
                valor_bruto=float(corpo.valor_bruto) if corpo.valor_bruto else None,
                data_vencimento=corpo.data_vencimento,
                numero_parcelas=numero_parcelas,
                descricao_garantia=getattr(corpo, "descricao_garantia", None),
                observacoes=corpo.observacoes,
                numero_referencia=corpo.numero_referencia,
                numero_nf=numero_nf,
                parcelas_json=parcelas_json,
                produtos_json=produtos_json,
            )

        if corpo.tipo_nota == TipoNotaCorpo.SERVICO:
            return CorpoNotaService._montar_texto_servico(
                nome_cond=nome_cond,
                mes_referencia=corpo.mes_referencia or "",
                descricao_servico=corpo.descricao_servico or "",
                numero_os=corpo.numero_os,
                data_servico_texto=getattr(corpo, "data_servico_texto", None),
                data_servico=corpo.data_servico,
                valor_bruto=float(corpo.valor_bruto) if corpo.valor_bruto else None,
                impostos=impostos,
                data_vencimento=corpo.data_vencimento,
                observacoes=corpo.observacoes,
                descricao_garantia=getattr(corpo, "descricao_garantia", None),
                valor_nota_produto=float(corpo.valor_nota_produto) if getattr(corpo, "valor_nota_produto", None) else None,
                numero_referencia=corpo.numero_referencia,
                numero_parcelas=numero_parcelas,
                numero_nf=numero_nf,
                numero_nf_produto=getattr(corpo, "numero_nf_produto", None),
                parcelas_json=parcelas_json,
                produtos_json=produtos_json,
                sem_retencao=sem_retencao,
            )

        return CorpoNotaService._montar_texto(
            nome_cond=nome_cond,
            mes_referencia=corpo.mes_referencia or "",
            descricao_servico=corpo.descricao_servico or "",
            numero_os=corpo.numero_os,
            data_servico=corpo.data_servico,
            valor_bruto=float(corpo.valor_bruto) if corpo.valor_bruto else None,
            impostos=impostos,
            data_vencimento=corpo.data_vencimento,
            observacoes=corpo.observacoes,
            cnpj_cond=cnpj_cond,
            razao_social_cond=razao_social_cond,
            contrato_inicio=contrato_inicio,
            numero_referencia=corpo.numero_referencia,
            numero_nf=numero_nf,
            sem_retencao=sem_retencao,
        )

    @staticmethod
    def _valor_por_extenso(v: float) -> str:
        """Converte valor monetário para texto por extenso em português brasileiro."""
        centavos_total = round(v * 100)
        reais = int(centavos_total) // 100
        centavos = int(centavos_total) % 100

        UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
                    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
        DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
        CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
                    'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

        def nn(n: int) -> str:
            if n == 0:
                return ''
            if n < 20:
                return UNIDADES[n]
            if n < 100:
                d, u = divmod(n, 10)
                return f"{DEZENAS[d]}{' e ' + UNIDADES[u] if u else ''}"
            if n == 100:
                return 'cem'
            c, resto = divmod(n, 100)
            return f"{CENTENAS[c]}{' e ' + nn(resto) if resto else ''}"

        mil = reais // 1000
        resto_reais = reais % 1000
        mil_str = ''
        if mil == 1:
            mil_str = 'mil'
        elif mil > 1:
            mil_str = f"{nn(mil)} mil"

        if mil_str and resto_reais:
            # "e" antes do resto só quando resto < 100 ou é centena redonda (100, 200...)
            usar_e = (resto_reais < 100) or (resto_reais % 100 == 0)
            r_texto = f"{mil_str} e {nn(resto_reais)}" if usar_e else f"{mil_str} {nn(resto_reais)}"
        elif mil_str:
            r_texto = mil_str
        elif resto_reais:
            r_texto = nn(resto_reais)
        else:
            r_texto = 'zero'
        resultado = f"{r_texto} {'real' if reais == 1 else 'reais'}"

        if centavos > 0:
            resultado += f" e {nn(centavos)} {'centavo' if centavos == 1 else 'centavos'}"
        return resultado

    @staticmethod
    def _fmt_numero_nf(n: int) -> str:
        s = str(n).zfill(9)
        return f"{s[:3]}.{s[3:6]}.{s[6:]}"

    @staticmethod
    def _ordinal_extenso(n: int) -> str:
        ORDINAIS = {1:"uma",2:"duas",3:"três",4:"quatro",5:"cinco",6:"seis",
                    7:"sete",8:"oito",9:"nove",10:"dez",11:"onze",12:"doze"}
        return ORDINAIS.get(n, str(n))

    @staticmethod
    def _montar_texto(
        nome_cond: str,
        mes_referencia: str,
        descricao_servico: str,
        numero_os: Optional[str],
        data_servico: Optional[date],
        valor_bruto: Optional[float],
        impostos: Optional[ImpostosCalculados],
        data_vencimento: Optional[date],
        observacoes: Optional[str],
        cnpj_cond: Optional[str] = None,
        razao_social_cond: Optional[str] = None,
        contrato_inicio: Optional[date] = None,
        numero_referencia: Optional[str] = None,
        numero_nf: Optional[int] = None,
        sem_retencao: bool = False,
    ) -> str:
        def fmt_valor(v: Optional[float]) -> str:
            if v is None:
                return ""
            return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        def fmt_data_pontos(d) -> str:
            if not d:
                return ""
            if hasattr(d, "strftime"):
                return d.strftime("%d.%m.%Y")
            return str(d)

        def fmt_data_barra(d) -> str:
            if not d:
                return ""
            if hasattr(d, "strftime"):
                return d.strftime("%d/%m/%Y")
            return str(d)

        def fmt_pct(p: float) -> str:
            return f"{int(p)}%" if p == int(p) else f"{p:.2f}%".replace('.', ',')

        # Converte "04/2026" → "abril/2026"
        MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho',
                    'julho','agosto','setembro','outubro','novembro','dezembro']
        periodo = mes_referencia
        if mes_referencia and '/' in mes_referencia:
            try:
                m_num, a_str = mes_referencia.split('/')
                periodo = f"{MESES_PT[int(m_num) - 1]}/{a_str}"
            except Exception:
                pass

        linhas = []
        if numero_nf:
            linhas.append(f"NF {CorpoNotaService._fmt_numero_nf(numero_nf)} {nome_cond}")
            linhas.append("")
        linhas += [
            "ESSE É CORPO DA NOTA DE MANUTENÇÃO PREVENTIVA MENSAL",
            "Segue abaixo a cobrança referente à manutenção preventiva mensal, conforme detalhamento:",
            "",
        ]

        # Linha de sumário
        sumario = [f"Serviço: Manutenção Preventiva Mensal", f"Período: {periodo}"]
        if numero_referencia:
            sumario.append(f"Referência: {numero_referencia}")
        if data_servico:
            sumario.append(f"Data de execução: {fmt_data_pontos(data_servico)}")
        if numero_os:
            sumario.append(f"Ordem de Serviço: {numero_os}")
        sumario.append("Quantidade de parcelas: 01")
        linhas.append(" | ".join(sumario))
        linhas.append("")

        if valor_bruto is not None:
            extenso = CorpoNotaService._valor_por_extenso(valor_bruto)
            label_valor = "Valor total" if sem_retencao else "Valor bruto"
            linhas.append(f"{label_valor}: {fmt_valor(valor_bruto)} ({extenso})")

        if sem_retencao:
            if data_vencimento:
                linhas.append(f"Vencimento: {fmt_data_barra(data_vencimento)}")
        elif impostos:
            linhas.append("Retenções:")
            if impostos.valor_inss:
                linhas.append(f"INSS ({fmt_pct(impostos.percentual_inss)}): {fmt_valor(impostos.valor_inss)}")
            if impostos.valor_cofins:
                linhas.append(f"COFINS ({fmt_pct(impostos.percentual_cofins)}): {fmt_valor(impostos.valor_cofins)}")
            if impostos.valor_pis:
                linhas.append(f"PIS ({fmt_pct(impostos.percentual_pis)}): {fmt_valor(impostos.valor_pis)}")
            if impostos.valor_csll:
                linhas.append(f"CSLL ({fmt_pct(impostos.percentual_csll)}): {fmt_valor(impostos.valor_csll)}")
            iss = getattr(impostos, "valor_iss", 0.0)
            if iss and iss > 0:
                pct_iss = getattr(impostos, "percentual_iss", 0.0)
                linhas.append(f"ISS ({fmt_pct(pct_iss)}): {fmt_valor(iss)}")
            linhas.append("")
            extenso_liq = CorpoNotaService._valor_por_extenso(impostos.valor_liquido)
            liquido_linha = f"Valor líquido do boleto: {fmt_valor(impostos.valor_liquido)} ({extenso_liq})"
            if data_vencimento:
                liquido_linha += f" | Vencimento: {fmt_data_barra(data_vencimento)}"
            linhas.append(liquido_linha)
        elif data_vencimento:
            linhas.append(f"Vencimento: {fmt_data_barra(data_vencimento)}")

        if descricao_servico:
            linhas.append("")
            linhas.append(f"Descrição dos serviços realizados: {descricao_servico}")

        if observacoes:
            linhas.append("")
            linhas.append(observacoes)

        linhas.append("")
        linhas.append("Ficamos à disposição para quaisquer esclarecimentos.")
        linhas.append("Por gentileza, solicitamos a confirmação de recebimento deste e-mail.")
        linhas.append("Atenciosamente,")
        return "\n".join(linhas)

    @staticmethod
    def _montar_texto_servico(
        nome_cond: str,
        mes_referencia: str,
        descricao_servico: str,
        numero_os: Optional[str],
        data_servico_texto: Optional[str],
        data_servico: Optional[date],
        valor_bruto: Optional[float],
        impostos: Optional[ImpostosCalculados],
        data_vencimento: Optional[date],
        observacoes: Optional[str],
        descricao_garantia: Optional[str] = None,
        valor_nota_produto: Optional[float] = None,
        numero_referencia: Optional[str] = None,
        numero_parcelas: int = 1,
        numero_nf: Optional[int] = None,
        numero_nf_produto: Optional[int] = None,
        parcelas_json: Optional[list] = None,
        produtos_json: Optional[list] = None,
        sem_retencao: bool = False,
    ) -> str:
        """Gera o texto do corpo da nota de SERVIÇO conforme template da cliente."""
        def fmt_valor(v: Optional[float]) -> str:
            if v is None:
                return ""
            return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        def fmt_data_barra(d) -> str:
            if not d:
                return ""
            if hasattr(d, "strftime"):
                return d.strftime("%d/%m/%Y")
            return str(d)

        def fmt_pct(p: float) -> str:
            return f"{int(p)}%" if p == int(p) else f"{p:.2f}%".replace('.', ',')

        def add_meses(d, n: int):
            mes = d.month + n
            ano = d.year + (mes - 1) // 12
            mes = ((mes - 1) % 12) + 1
            import calendar
            ultimo_dia = calendar.monthrange(ano, mes)[1]
            return d.replace(year=ano, month=mes, day=min(d.day, ultimo_dia))

        liquido = impostos.valor_liquido if impostos else None
        valor_total_notas = None
        valor_total_boleto = None
        if valor_bruto and valor_nota_produto:
            valor_total_notas = valor_bruto + valor_nota_produto
            valor_total_boleto = (liquido or valor_bruto) + valor_nota_produto
        elif valor_nota_produto:
            valor_total_boleto = (liquido or 0) + valor_nota_produto

        texto_datas = data_servico_texto or (fmt_data_barra(data_servico) if data_servico else "")
        tem_produto = valor_nota_produto is not None and valor_nota_produto > 0
        total_boleto = valor_total_boleto if tem_produto else (liquido if liquido else valor_bruto)

        linhas = []
        if numero_nf:
            if tem_produto:
                linhas.append(f"Emitidas em {date.today().strftime('%d.%m.%Y')}.")
            linhas.append(f"NF {CorpoNotaService._fmt_numero_nf(numero_nf)} {nome_cond}")
            if tem_produto and numero_nf_produto:
                linhas.append(f"NF Produto {CorpoNotaService._fmt_numero_nf(numero_nf_produto)} {nome_cond}")
            linhas.append("")

        extenso_parc = CorpoNotaService._ordinal_extenso(numero_parcelas)
        plural = "parcela" if numero_parcelas == 1 else "parcelas"

        linhas += [
            f"Serviços Executados: {descricao_servico or ''}",
            "",
            f"Datas dos Serviços Executados: {texto_datas}",
            f"Ordens de Serviço: {numero_os or ''}",
            f"Quantidade de Parcelas: {numero_parcelas:02d} ({extenso_parc}) {plural}",
        ]

        if descricao_garantia:
            linhas.append(f"Garantias: {descricao_garantia}")

        # Lista de produtos (abaixo da garantia)
        if produtos_json:
            linhas.append("")
            linhas.append("Produtos:")
            for p in produtos_json:
                qtd = p.get("quantidade", 1)
                nome = p.get("nome", "")
                if nome:
                    linhas.append(f"{qtd}x {nome}")

        linhas.append("")
        linhas.append("Valores da Nota de Serviço: ")

        if valor_bruto is not None:
            extenso = CorpoNotaService._valor_por_extenso(valor_bruto)
            label_valor = "Valor Total" if sem_retencao else "Valor da Nota de Serviço"
            linhas.append(f"{label_valor}: {fmt_valor(valor_bruto)} ({extenso})")

        if not sem_retencao and impostos:
            linhas.append("Retenções: ")
            if impostos.valor_inss:
                extenso_v = CorpoNotaService._valor_por_extenso(impostos.valor_inss)
                linhas.append(f"INSS {fmt_pct(impostos.percentual_inss)}: {fmt_valor(impostos.valor_inss)} ({extenso_v})")
            if impostos.valor_cofins:
                extenso_v = CorpoNotaService._valor_por_extenso(impostos.valor_cofins)
                linhas.append(f"COFINS {fmt_pct(impostos.percentual_cofins)}: {fmt_valor(impostos.valor_cofins)} ({extenso_v})")
            if impostos.valor_pis:
                extenso_v = CorpoNotaService._valor_por_extenso(impostos.valor_pis)
                linhas.append(f"PIS {fmt_pct(impostos.percentual_pis)}: {fmt_valor(impostos.valor_pis)} ({extenso_v})")
            if impostos.valor_csll:
                extenso_v = CorpoNotaService._valor_por_extenso(impostos.valor_csll)
                linhas.append(f"CSLL {fmt_pct(impostos.percentual_csll)}: {fmt_valor(impostos.valor_csll)} ({extenso_v})")
            extenso_liq = CorpoNotaService._valor_por_extenso(impostos.valor_liquido)
            linhas.append(f"Valor Líquido da Nota de Serviço: {fmt_valor(impostos.valor_liquido)} ({extenso_liq})")

        if tem_produto:
            linhas.append("")
            linhas.append("Valores da Nota de Produto: ")
            extenso_prod = CorpoNotaService._valor_por_extenso(valor_nota_produto)
            linhas.append(f"Valor da Nota de Produto: {fmt_valor(valor_nota_produto)} ({extenso_prod})")

        if valor_total_notas is not None or valor_total_boleto is not None:
            linhas.append("")
            linhas.append("Valor Total: ")
            if valor_total_notas:
                extenso_total = CorpoNotaService._valor_por_extenso(valor_total_notas)
                linhas.append(f"Valor Total das Notas: {fmt_valor(valor_total_notas)} ({extenso_total})")
            if valor_total_boleto:
                extenso_boleto = CorpoNotaService._valor_por_extenso(valor_total_boleto)
                linhas.append(f"Valor Total do Boleto: {fmt_valor(valor_total_boleto)} ({extenso_boleto})")

        def fmt_data_pontos_local(d) -> str:
            if not d:
                return ""
            if hasattr(d, "strftime"):
                return d.strftime("%d.%m.%Y")
            return str(d)

        ORDINAIS_NF = ["1a.","2a.","3a.","4a.","5a.","6a.","7a.","8a.","9a.","10a.","11a.","12a."]

        if parcelas_json:
            linhas.append("")
            linhas.append("Parcelamento: ")
            for i, parc in enumerate(parcelas_json):
                ord_str = ORDINAIS_NF[i] if i < len(ORDINAIS_NF) else f"{i+1}a."
                v = float(parc.get("valor", 0))
                dt_str = parc.get("data", "")
                if dt_str:
                    try:
                        from datetime import date as date_type
                        d = date_type.fromisoformat(dt_str)
                        dt_fmt = fmt_data_pontos_local(d)
                    except Exception:
                        dt_fmt = dt_str
                else:
                    dt_fmt = ""
                linhas.append(f"{ord_str} Parcela: {fmt_valor(v)}, Vencimento: {dt_fmt}")
        elif data_vencimento and total_boleto:
            linhas.append("")
            linhas.append("Parcelamento: ")
            if tem_produto and numero_parcelas > 1 and liquido and valor_nota_produto:
                valor_1 = liquido
                valor_outros = round(valor_nota_produto / (numero_parcelas - 1), 2)
            else:
                valor_1 = round(total_boleto / numero_parcelas, 2)
                valor_outros = valor_1
            for i in range(numero_parcelas):
                ord_str = ORDINAIS_NF[i] if i < len(ORDINAIS_NF) else f"{i+1}a."
                v = valor_1 if i == 0 else valor_outros
                dt = add_meses(data_vencimento, i)
                linhas.append(f"{ord_str} Parcela: {fmt_valor(v)}, Vencimento: {fmt_data_pontos_local(dt)}")

        if observacoes:
            linhas.append("")
            linhas.append(observacoes)

        linhas.append("")
        linhas.append("Ficamos à disposição para quaisquer esclarecimentos.")
        linhas.append("Por gentileza, solicitamos a confirmação de recebimento deste e-mail.")
        linhas.append("Atenciosamente,")
        return "\n".join(linhas)

    @staticmethod
    def _montar_texto_produto(
        nome_cond: str,
        descricao_servico: str,
        numero_os: Optional[str],
        data_servico_texto: Optional[str],
        data_servico: Optional[date],
        valor_bruto: Optional[float],
        data_vencimento: Optional[date],
        numero_parcelas: int = 1,
        descricao_garantia: Optional[str] = None,
        observacoes: Optional[str] = None,
        numero_referencia: Optional[str] = None,
        numero_nf: Optional[int] = None,
        parcelas_json: Optional[list] = None,
        produtos_json: Optional[list] = None,
    ) -> str:
        """Gera o texto do corpo da nota de PRODUTO conforme template da cliente."""

        def fmt_valor(v: Optional[float]) -> str:
            if v is None:
                return ""
            return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        def fmt_data_barra(d) -> str:
            if not d:
                return ""
            if hasattr(d, "strftime"):
                return d.strftime("%d/%m/%Y")
            return str(d)

        def add_meses(d, n: int):
            import calendar
            mes = d.month + n
            ano = d.year + (mes - 1) // 12
            mes = ((mes - 1) % 12) + 1
            ultimo_dia = calendar.monthrange(ano, mes)[1]
            return d.replace(year=ano, month=mes, day=min(d.day, ultimo_dia))

        n_parc = len(parcelas_json) if parcelas_json else numero_parcelas
        texto_datas = data_servico_texto or (fmt_data_barra(data_servico) if data_servico else "")
        extenso_parc = CorpoNotaService._ordinal_extenso(n_parc)
        plural = "parcela" if n_parc == 1 else "parcelas"

        linhas = []
        if numero_nf:
            linhas.append(f"NF {CorpoNotaService._fmt_numero_nf(numero_nf)} {nome_cond}")

        linhas += [
            f"Serviços Executados: {descricao_servico or ''}",
            f"Datas dos Serviços Executados: {texto_datas}",
            f"Ordens de Serviços: {numero_os or ''}",
            f"Quantidade de Parcelas: {n_parc:02d} ({extenso_parc}) {plural}",
        ]

        if descricao_garantia:
            linhas.append(f"Garantias: {descricao_garantia}")

        # Lista de produtos (abaixo da garantia)
        if produtos_json:
            linhas.append("")
            linhas.append("Produtos:")
            for p in produtos_json:
                qtd = p.get("quantidade", 1)
                nome_p = p.get("nome", "")
                if nome_p:
                    linhas.append(f"{qtd}x {nome_p}")

        linhas.append("")
        linhas.append("Valor da Nota de Produto: ")

        if valor_bruto is not None:
            extenso = CorpoNotaService._valor_por_extenso(valor_bruto)
            linhas.append(f"Valor da Nota de Produto: {fmt_valor(valor_bruto)} ({extenso})")

        def fmt_pontos(d) -> str:
            if not d:
                return ""
            if hasattr(d, "strftime"):
                return d.strftime("%d.%m.%Y")
            return str(d)

        ORDINAIS_NF = ["1a.","2a.","3a.","4a.","5a.","6a.","7a.","8a.","9a.","10a.","11a.","12a."]

        if parcelas_json:
            linhas.append("")
            linhas.append("Parcelamento: ")
            for i, parc in enumerate(parcelas_json):
                ord_str = ORDINAIS_NF[i] if i < len(ORDINAIS_NF) else f"{i+1}a."
                v = float(parc.get("valor", 0))
                dt_str = parc.get("data", "")
                if dt_str:
                    try:
                        from datetime import date as date_type
                        d = date_type.fromisoformat(dt_str)
                        dt_fmt = fmt_pontos(d)
                    except Exception:
                        dt_fmt = dt_str
                else:
                    dt_fmt = ""
                linhas.append(f"{ord_str} Parcela: {fmt_valor(v)}, Vencimento: {dt_fmt}")
        elif data_vencimento and valor_bruto:
            linhas.append("")
            linhas.append("Parcelamento: ")
            valor_parcela = round(valor_bruto / numero_parcelas, 2)
            for i in range(numero_parcelas):
                ord_str = ORDINAIS_NF[i] if i < len(ORDINAIS_NF) else f"{i+1}a."
                dt = add_meses(data_vencimento, i)
                linhas.append(f"{ord_str} Parcela: {fmt_valor(valor_parcela)}, Vencimento: {fmt_data_barra(dt)}")

        if observacoes:
            linhas.append("")
            linhas.append(observacoes)

        linhas.append("")
        linhas.append("Ficamos à disposição para quaisquer esclarecimentos.")
        linhas.append("Por gentileza, solicitamos a confirmação de recebimento deste e-mail.")
        linhas.append("Atenciosamente,")
        return "\n".join(linhas)

    # ── Matching interno (chamado pela nota fiscal service) ───────────────────

    @staticmethod
    def tentar_vincular_por_nota_fiscal(db: Session, nota_fiscal_id: int) -> Optional[list]:
        """
        Tenta vincular a nota fiscal a um CorpoNota existente.

        Retorna:
          None   → sem candidatos (nada a fazer)
          []     → vinculou automaticamente (lista vazia = feito)
          [...]  → 2+ candidatos encontrados (lista para seleção manual no frontend)
        """
        from app.models.nota_fiscal_model import NotaFiscal, TipoNota
        from app.models.condominio_model import Condominio

        nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_fiscal_id).first()
        if not nota or not nota.condominio_id:
            return None

        tipo_map = {
            TipoNota.MANUTENCAO: TipoNotaCorpo.MANUTENCAO,
            TipoNota.ASSISTENCIA: TipoNotaCorpo.SERVICO,
        }
        tipo_corpo = tipo_map.get(nota.tipo)

        # Notas PRODUTO de CNPJ configurado como PRODUTO → tenta vincular ao CorpoNota SERVICO,
        # com fallback para CorpoNota PRODUTO standalone se não encontrar corpo SERVICO.
        if not tipo_corpo and nota.tipo == TipoNota.PRODUTO:
            from app.services.nota_fiscal_service import _cnpj_e_produto
            if _cnpj_e_produto(db, nota.cnpj_emitente):
                resultado = CorpoNotaService._tentar_vincular_nota_produto(db, nota)
                if resultado is not None:
                    return resultado
                return CorpoNotaService._tentar_vincular_nota_produto_standalone(db, nota)

        if not tipo_corpo:
            return None

        # Determina mês/ano da nota
        ref_date = nota.data_vencimento
        if not ref_date:
            return None
        ano, mes = ref_date.year, ref_date.month

        # Extrai numero_os da descrição (regex simples)
        numero_os = None
        if nota.descricao_servico:
            import re
            m = re.search(r"OS[:\s#nNº°]*(\d+)", nota.descricao_servico, re.IGNORECASE)
            if m:
                numero_os = m.group(1)

        import re as _re

        # Extrai numero_nf da nota para matching direto (sem filtro de mês)
        try:
            numero_nf_int = int(_re.sub(r"\D", "", nota.numero_nota or "")) if nota.numero_nota else None
        except ValueError:
            numero_nf_int = None

        # Rota 1: matching por numero_nf (sem filtro de mês — vencimento pode ser mês seguinte)
        if numero_nf_int:
            candidatos_nf = CorpoNotaRepository.list_candidatos_por_numero_nf(
                db, nota.condominio_id, tipo_corpo, numero_nf_int
            )
            if len(candidatos_nf) == 1:
                corpo = candidatos_nf[0]
                corpo.nota_fiscal_id = nota.id
                corpo.status = StatusCorpoNota.XML_VINCULADO
                nota.corpo_nota_id = corpo.id
                # Se nota de produto já vinculada ao corpo → cria nota_vinculada_id simétrico
                if corpo.nota_produto_id and corpo.nota_produto_id != nota.id:
                    from app.models.nota_fiscal_model import NotaFiscal as _NF
                    nota_prod = db.query(_NF).filter(_NF.id == corpo.nota_produto_id).first()
                    if nota_prod:
                        nota.nota_vinculada_id = nota_prod.id
                        nota_prod.nota_vinculada_id = nota.id
                        db.add(nota_prod)
                db.add(nota)
                CorpoNotaRepository.save(db, corpo)
                ciclo = CicloNotaRepository.get_by_id(db, corpo.ciclo_id)
                if ciclo:
                    CicloNotaService.atualizar_status_pelo_corpo(db, ciclo)
                logger.info(f"CorpoNota {corpo.id} vinculado via numero_nf={numero_nf_int} à NotaFiscal {nota.id}")
                return []

        # Rota 2: matching por mês/ano + OS (tenta mês atual e mês anterior)
        candidatos = CorpoNotaRepository.list_candidatos_para_nota(
            db, nota.condominio_id, tipo_corpo, ano, mes, numero_os
        )
        if not candidatos and mes > 1:
            candidatos = CorpoNotaRepository.list_candidatos_para_nota(
                db, nota.condominio_id, tipo_corpo, ano, mes - 1, numero_os
            )
        elif not candidatos and mes == 1:
            candidatos = CorpoNotaRepository.list_candidatos_para_nota(
                db, nota.condominio_id, tipo_corpo, ano - 1, 12, numero_os
            )

        if not candidatos:
            return None

        # Filtro por CNPJ emitente
        cnpj_nf = _re.sub(r"\D", "", nota.cnpj_emitente or "")
        if cnpj_nf:
            from app.models.configuracao_model import ConfiguracaoInter
            inter_map: dict = {}
            for c in candidatos:
                if c.configuracao_inter_id and c.configuracao_inter_id not in inter_map:
                    conta = db.query(ConfiguracaoInter).filter(ConfiguracaoInter.id == c.configuracao_inter_id).first()
                    if conta:
                        inter_map[c.configuracao_inter_id] = _re.sub(r"\D", "", conta.cnpj or "")
            com_cnpj = [
                c for c in candidatos
                if inter_map.get(c.configuracao_inter_id, "") == cnpj_nf
            ]
            if com_cnpj:
                candidatos = com_cnpj

        # Filtro adicional por número da NF (se ainda não resolvido)
        if numero_nf_int:
            com_numero = [c for c in candidatos if c.numero_nf == numero_nf_int]
            if com_numero:
                candidatos = com_numero

        if len(candidatos) == 1:
            corpo = candidatos[0]
            corpo.nota_fiscal_id = nota.id
            corpo.status = StatusCorpoNota.XML_VINCULADO
            nota.corpo_nota_id = corpo.id
            # Se nota de produto já vinculada ao corpo → cria nota_vinculada_id simétrico
            if corpo.nota_produto_id and corpo.nota_produto_id != nota.id:
                from app.models.nota_fiscal_model import NotaFiscal as _NF
                nota_prod = db.query(_NF).filter(_NF.id == corpo.nota_produto_id).first()
                if nota_prod:
                    nota.nota_vinculada_id = nota_prod.id
                    nota_prod.nota_vinculada_id = nota.id
                    db.add(nota_prod)
            db.add(nota)
            CorpoNotaRepository.save(db, corpo)

            ciclo = CicloNotaRepository.get_by_id(db, corpo.ciclo_id)
            if ciclo:
                CicloNotaService.atualizar_status_pelo_corpo(db, ciclo)

            logger.info(f"CorpoNota {corpo.id} vinculado automaticamente à NotaFiscal {nota.id}")
            return []

        # 2+ candidatos — retorna lista para o frontend mostrar seletor
        return [
            {
                "corpo_id": c.id,
                "numero_os": c.numero_os,
                "mes_referencia": c.mes_referencia,
                "status": c.status.value,
                "descricao_servico": (c.descricao_servico or "")[:80],
            }
            for c in candidatos
        ]

    @staticmethod
    def _tentar_vincular_nota_produto(db: Session, nota) -> Optional[list]:
        """
        Vincula uma nota de produto (TipoNota.OUTROS de CNPJ=PRODUTO) ao CorpoNota de SERVICO correto.
        Cria simetricamente nota_vinculada_id entre a nota de serviço e a nota de produto.

        Retorna:
          None   → sem candidatos
          []     → vinculado automaticamente
          [...]  → múltiplos candidatos para seleção manual
        """
        import re as _re

        # NF-e armazena numero_nota como "11-1" (numero-serie); extrai só o número
        numero_nf_int = None
        if nota.numero_nota:
            try:
                parte = nota.numero_nota.split('-')[0].strip()
                numero_nf_int = int(parte) if parte.isdigit() else None
            except (ValueError, IndexError):
                pass

        candidatos = []

        # Rota 1: match por numero_nf_produto exato
        if numero_nf_int:
            candidatos = CorpoNotaRepository.list_candidatos_produto_por_numero_nf(
                db, nota.condominio_id, numero_nf_int
            )

        # Rota 2: fallback — busca por mês/ano do vencimento
        if not candidatos and nota.data_vencimento:
            ano, mes = nota.data_vencimento.year, nota.data_vencimento.month
            candidatos = CorpoNotaRepository.list_candidatos_produto_por_mes(
                db, nota.condominio_id, ano, mes
            )
            if not candidatos and mes > 1:
                candidatos = CorpoNotaRepository.list_candidatos_produto_por_mes(
                    db, nota.condominio_id, ano, mes - 1
                )
            elif not candidatos and mes == 1:
                candidatos = CorpoNotaRepository.list_candidatos_produto_por_mes(
                    db, nota.condominio_id, ano - 1, 12
                )

        if not candidatos:
            return None

        if len(candidatos) == 1:
            corpo = candidatos[0]
            corpo.nota_produto_id = nota.id

            # Atribui numero_nf_produto do contador se ainda não atribuído
            if not corpo.numero_nf_produto:
                from app.models.configuracao_model import ConfiguracaoInter
                conta_prod = (
                    db.query(ConfiguracaoInter)
                    .filter(ConfiguracaoInter.tipo_nota == "PRODUTO")
                    .with_for_update()
                    .first()
                )
                if conta_prod:
                    num_prod = conta_prod.numero_nf_produto or 1
                    conta_prod.numero_nf_produto = num_prod + 1
                    db.add(conta_prod)
                    corpo.numero_nf_produto = num_prod

            # Cria vínculo simétrico nota_vinculada_id entre NF serviço ↔ NF produto
            if corpo.nota_fiscal_id and corpo.nota_fiscal_id != nota.id:
                from app.models.nota_fiscal_model import NotaFiscal as _NF
                nota_servico = db.query(_NF).filter(_NF.id == corpo.nota_fiscal_id).first()
                if nota_servico:
                    nota_servico.nota_vinculada_id = nota.id
                    nota.nota_vinculada_id = nota_servico.id
                    db.add(nota_servico)

            # Atualiza status para XML_VINCULADO se ambas as notas estão presentes
            if corpo.nota_fiscal_id:
                corpo.status = StatusCorpoNota.XML_VINCULADO

            # Regenera corpo com numero_nf_produto agora atribuído
            corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)

            db.add(nota)
            CorpoNotaRepository.save(db, corpo)

            ciclo = CicloNotaRepository.get_by_id(db, corpo.ciclo_id)
            if ciclo:
                CicloNotaService.atualizar_status_pelo_corpo(db, ciclo)

            logger.info(f"CorpoNota {corpo.id} vinculado via nota_produto à NotaFiscal {nota.id}")
            return []

        return [
            {
                "corpo_id": c.id,
                "numero_os": c.numero_os,
                "mes_referencia": c.mes_referencia,
                "status": c.status.value,
                "descricao_servico": (c.descricao_servico or "")[:80],
            }
            for c in candidatos
        ]

    @staticmethod
    def _serializar_produtos_para_termo(produtos_json: Optional[list]) -> Optional[str]:
        """[{"nome":"Motor","quantidade":3}] → "3x Motor · 2x Manta" """
        if not produtos_json:
            return None
        partes = [
            f"{p.get('quantidade', 1)}x {p.get('nome', '')}"
            for p in produtos_json if p.get('nome')
        ]
        return " · ".join(partes) if partes else None

    @staticmethod
    def _extrair_prazo_meses(descricao_garantia: Optional[str]) -> int:
        """Extrai prazo em meses de texto como "06 meses" ou "3m". Default 12."""
        if not descricao_garantia:
            return 12
        import re
        m = re.search(r'(\d+)\s*(?:meses?|m\.?)', descricao_garantia, re.IGNORECASE)
        return int(m.group(1)) if m else 12

    @staticmethod
    def pre_gerar_termo(db: Session, corpo_id: int) -> dict:
        """
        Pré-calcula os dados para geração de Termo de Garantia a partir do corpo da nota.
        Não salva nada — apenas retorna os dados para o frontend mostrar no modal de confirmação.
        """
        from app.schemas.corpo_nota_schema import PreGerarTermoResponse

        corpo = CorpoNotaService.get_by_id(db, corpo_id)

        if not corpo.servico_id:
            return {
                "pode_gerar": False,
                "motivo_bloqueio": "Corpo sem OS vinculada (servico_id ausente)",
            }

        produto_desc = CorpoNotaService._serializar_produtos_para_termo(corpo.produtos_json)
        if not produto_desc:
            return {
                "pode_gerar": False,
                "motivo_bloqueio": "Sem produtos listados no corpo (produtos_json vazio)",
            }

        prazo = CorpoNotaService._extrair_prazo_meses(corpo.descricao_garantia)
        data_inicio = corpo.data_servico
        data_fim = None
        if data_inicio:
            from dateutil.relativedelta import relativedelta
            data_fim = data_inicio + relativedelta(months=prazo)

        return {
            "pode_gerar": True,
            "motivo_bloqueio": None,
            "servico_id": corpo.servico_id,
            "produto_descricao": produto_desc,
            "prazo_meses": prazo,
            "data_inicio": data_inicio,
            "data_fim": data_fim,
            "orcamento_id": corpo.orcamento_id,
        }

    @staticmethod
    def _tentar_vincular_nota_produto_standalone(db: Session, nota) -> Optional[list]:
        """
        Fallback: vincula nota PRODUTO a CorpoNota tipo=PRODUTO standalone.
        Chamado quando _tentar_vincular_nota_produto não encontra candidato SERVICO.

        Retorna:
          None   → sem candidatos (nota fica solta, sem erro)
          []     → vinculado automaticamente
          [...]  → múltiplos candidatos para seleção manual
        """
        numero_nf_int = None
        if nota.numero_nota:
            try:
                parte = nota.numero_nota.split('-')[0].strip()
                numero_nf_int = int(parte) if parte.isdigit() else None
            except (ValueError, IndexError):
                pass

        candidatos = []

        # Rota 1: match por numero_nf exato no corpo PRODUTO
        if numero_nf_int:
            candidatos = CorpoNotaRepository.list_candidatos_produto_standalone_por_numero_nf(
                db, nota.condominio_id, numero_nf_int
            )

        # Rota 2: fallback por mês/ano do vencimento
        if not candidatos and nota.data_vencimento:
            ano, mes = nota.data_vencimento.year, nota.data_vencimento.month
            candidatos = CorpoNotaRepository.list_candidatos_produto_standalone_por_mes(
                db, nota.condominio_id, ano, mes
            )
            if not candidatos and mes > 1:
                candidatos = CorpoNotaRepository.list_candidatos_produto_standalone_por_mes(
                    db, nota.condominio_id, ano, mes - 1
                )
            elif not candidatos and mes == 1:
                candidatos = CorpoNotaRepository.list_candidatos_produto_standalone_por_mes(
                    db, nota.condominio_id, ano - 1, 12
                )

        if not candidatos:
            return None

        if len(candidatos) == 1:
            corpo = candidatos[0]
            corpo.nota_fiscal_id = nota.id
            corpo.status = StatusCorpoNota.XML_VINCULADO
            nota.corpo_nota_id = corpo.id
            corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)
            db.add(nota)
            CorpoNotaRepository.save(db, corpo)

            ciclo = CicloNotaRepository.get_by_id(db, corpo.ciclo_id)
            if ciclo:
                CicloNotaService.atualizar_status_pelo_corpo(db, ciclo)

            logger.info(
                f"[PRODUTO-standalone] CorpoNota {corpo.id} vinculado à NotaFiscal {nota.id}"
            )
            return []

        return [
            {
                "corpo_id": c.id,
                "numero_os": c.numero_os,
                "mes_referencia": c.mes_referencia,
                "status": c.status.value,
                "descricao_servico": (c.descricao_servico or "")[:80],
            }
            for c in candidatos
        ]
