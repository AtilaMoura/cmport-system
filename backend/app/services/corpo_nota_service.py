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
        servico_id: Optional[int] = None,
        numero_os: Optional[str] = None,
        data_servico: Optional[date] = None,
        descricao_servico: Optional[str] = None,
        valor_bruto: Optional[float] = None,
        data_vencimento: Optional[date] = None,
        observacoes: Optional[str] = None,
        tem_garantia: bool = False,
        usuario: Optional[str] = None,
    ) -> CorpoNota:
        if mes < 1 or mes > 12:
            raise HTTPException(status_code=422, detail="mes deve ser entre 1 e 12.")
        if ano < 2020:
            raise HTTPException(status_code=422, detail="ano deve ser >= 2020.")

        # Obtém ou cria o ciclo do mês
        ciclo = CicloNotaService.get_or_create(db, condominio_id, tipo_nota, ano, mes)

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

        # Calcula impostos se tiver valor_bruto
        impostos: Optional[ImpostosCalculados] = None
        if corpo_dados.get("valor_bruto"):
            impostos = ImpostoService.calcular_impostos(
                db, float(corpo_dados["valor_bruto"]), tipo_nota.value
            )

        mes_ref = f"{mes:02d}/{ano}"

        corpo = CorpoNota(
            ciclo_id=ciclo.id,
            condominio_id=condominio_id,
            tipo_nota=tipo_nota,
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
            valor_liquido=impostos.valor_liquido if impostos else None,
            data_vencimento=data_vencimento,
            mes_referencia=mes_ref,
            observacoes=observacoes,
            preenchimento_manual=preenchimento_manual or corpo_dados.get("preenchimento_manual", False),
            status=StatusCorpoNota.EM_MONTAGEM,
            tem_garantia=tem_garantia,
            criado_por=usuario,
        )
        # Salva ISS se disponível no modelo (coluna adicionada via migration)
        if impostos and hasattr(corpo, "percentual_iss"):
            corpo.percentual_iss = getattr(impostos, "percentual_iss", 0.0)
            corpo.valor_iss = getattr(impostos, "valor_iss", 0.0)
        corpo = CorpoNotaRepository.create(db, corpo)

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

        if not financeiro_bloqueado:
            if valor_bruto is not None:
                corpo.valor_bruto = valor_bruto
                corpo.preenchimento_manual = True
            if data_vencimento is not None:
                corpo.data_vencimento = data_vencimento
            if corpo.valor_bruto:
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
    ) -> dict:
        impostos = None
        if valor_bruto:
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

    # ── Helpers privados ─────────────────────────────────────────────────────

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
        from app.models.servico_model import ManutencaoAssistencia
        from sqlalchemy import extract

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

        # Busca OS de manutenção no mês sem nota fiscal vinculada
        tipo_str = "manutencao"
        servico = (
            db.query(ManutencaoAssistencia)
            .filter(
                ManutencaoAssistencia.condominio_id == condominio_id,
                ManutencaoAssistencia.tipo == tipo_str,
                extract("year", ManutencaoAssistencia.data_servico) == ano,
                extract("month", ManutencaoAssistencia.data_servico) == mes,
                ManutencaoAssistencia.nota_fiscal_id.is_(None),
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

        from app.services.imposto_service import ImpostosCalculados
        impostos = None
        if corpo.valor_bruto:
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
        )

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
    ) -> str:
        def fmt_valor(v: Optional[float]) -> str:
            if v is None:
                return "—"
            return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        def fmt_data(d) -> str:
            if not d:
                return "—"
            if hasattr(d, "strftime"):
                return d.strftime("%d/%m/%Y")
            return str(d)

        linhas = [nome_cond]
        if razao_social_cond and razao_social_cond != nome_cond:
            linhas.append(razao_social_cond)
        if cnpj_cond:
            linhas.append(f"CNPJ: {cnpj_cond}")
        if contrato_inicio:
            linhas.append(f"Contrato desde: {fmt_data(contrato_inicio)}")
        linhas.append(f"Referente ao mês de {mes_referencia}")
        linhas.append("")
        linhas.append(f"Serviços prestados: {descricao_servico}")
        if numero_os:
            linhas.append(f"OS nº: {numero_os}")
        linhas.append(f"Data de execução: {fmt_data(data_servico)}")
        linhas.append("")
        linhas.append(f"Valor bruto: {fmt_valor(valor_bruto)}")
        if impostos:
            linhas.append(f"(-) INSS {impostos.percentual_inss:.2f}%: {fmt_valor(impostos.valor_inss)}")
            linhas.append(f"(-) COFINS {impostos.percentual_cofins:.2f}%: {fmt_valor(impostos.valor_cofins)}")
            linhas.append(f"(-) PIS {impostos.percentual_pis:.2f}%: {fmt_valor(impostos.valor_pis)}")
            linhas.append(f"(-) CSLL {impostos.percentual_csll:.2f}%: {fmt_valor(impostos.valor_csll)}")
            iss = getattr(impostos, "valor_iss", 0.0)
            if iss and iss > 0:
                pct_iss = getattr(impostos, "percentual_iss", 0.0)
                linhas.append(f"(-) ISS {pct_iss:.2f}%: {fmt_valor(iss)}")
            linhas.append("")
            linhas.append(f"Valor líquido: {fmt_valor(impostos.valor_liquido)}")
        linhas.append(f"Vencimento: {fmt_data(data_vencimento)}")
        if observacoes:
            linhas.append("")
            linhas.append(observacoes)
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

        candidatos = CorpoNotaRepository.list_candidatos_para_nota(
            db, nota.condominio_id, tipo_corpo, ano, mes, numero_os
        )

        if not candidatos:
            return None

        if len(candidatos) == 1:
            corpo = candidatos[0]
            corpo.nota_fiscal_id = nota.id
            corpo.status = StatusCorpoNota.XML_VINCULADO
            nota.corpo_nota_id = corpo.id
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
