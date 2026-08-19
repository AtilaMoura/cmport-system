import calendar
import re
from datetime import date as date_cls
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.nota_fiscal_model import NotaFiscal, TipoNota, StatusNota
from app.models.boleto_model import Boleto, SituacaoBoleto
from app.models.recibo_model import Recibo
from app.models.servico_model import ManutencaoAssistencia
from app.models.condominio_model import Condominio
from app.models.duplicata_dispensada_model import DuplicataDispensada
from app.models.banco_model import Banco
from app.repositories.configuracao_repository import ConfiguracaoInterRepository
from app.schemas.fluxo_financeiro_schema import (
    FluxoFinanceiroLinha, FluxoFinanceiroCnpj, FluxoFinanceiroResponse, AlertaDuplicata,
    PendenciaLinha, PendenciasResponse, AlertaNotaSemBoleto, AlertaNotaSemServico,
    AlertaParcelaFaltando,
)


def normalizar_numero_nota(numero: str) -> str:
    """Reduz um numero_nota ao numero base, pra permitir comparar/agrupar
    entre os varios formatos usados historicamente (placeholder de planilha,
    sufixo de duplicata, parcela de Corpo de Nota, etc).
    Uso: exibicao e deteccao de duplicata — nunca sobrescreve o dado original.
    """
    if not numero:
        return numero
    n = numero.strip()
    n = re.sub(r'(?i)^TEC\s+', '', n)
    n = re.sub(r'^0{3}\.0{3}\.0*', '', n)
    n = re.sub(r'\s*/\s*\S+.*$', '', n)
    n = re.sub(r'\s*[AM]$', '', n, flags=re.IGNORECASE)
    n = re.sub(r'-\d+$', '', n)
    n = n.strip()
    if n.isdigit():
        n = str(int(n))
    return n or numero.strip()


class FluxoFinanceiroService:

    @staticmethod
    def fluxo_mensal(db: Session, ano: int, mes: int, cnpj: Optional[str] = None) -> FluxoFinanceiroResponse:
        configs = ConfiguracaoInterRepository.get_all(db)
        cnpj_limpo = "".join(filter(str.isdigit, cnpj)) if cnpj else None

        cnpjs_resultado: List[FluxoFinanceiroCnpj] = []
        total_geral = 0.0

        for cfg in configs:
            cfg_cnpj_limpo = "".join(filter(str.isdigit, cfg.cnpj or ""))
            if cnpj_limpo and cfg_cnpj_limpo != cnpj_limpo:
                continue

            linhas: List[FluxoFinanceiroLinha] = []

            # Boletos PAGO/BAIXADO do mes, notas Manutencao/Assistencia/Produto deste CNPJ
            boletos = (
                db.query(Boleto, NotaFiscal, Condominio, Banco)
                .join(NotaFiscal, Boleto.nota_fiscal_id == NotaFiscal.id)
                .join(Condominio, NotaFiscal.condominio_id == Condominio.id)
                .outerjoin(Banco, Boleto.banco_id == Banco.id)
                .filter(
                    NotaFiscal.cnpj_emitente == cfg_cnpj_limpo,
                    NotaFiscal.tipo.in_([TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA, TipoNota.PRODUTO]),
                    Boleto.situacao.in_([SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO]),
                    func.year(Boleto.data_pagamento) == ano,
                    func.month(Boleto.data_pagamento) == mes,
                )
                .all()
            )

            total_manutencao = 0.0
            total_assistencia = 0.0
            total_produto = 0.0
            for boleto, nota, condominio, banco in boletos:
                # arredonda cada linha ANTES de somar — valor_nominal e FLOAT e carrega
                # ruido binario por linha (ex: 23625.009765625 em vez de 23625.01);
                # arredondar so o total final nao corrige isso, o viés já foi acumulado.
                valor = round(float(boleto.valor_nominal or 0), 2)
                tipo = nota.tipo.value if hasattr(nota.tipo, "value") else str(nota.tipo)
                if tipo == "MANUTENCAO":
                    total_manutencao += valor
                elif tipo == "PRODUTO":
                    total_produto += valor
                else:
                    total_assistencia += valor
                linhas.append(FluxoFinanceiroLinha(
                    origem_id=boleto.id,
                    condominio_id=condominio.id,
                    condominio_nome=condominio.nome,
                    numero_nota=nota.numero_nota,
                    numero_nota_normalizado=normalizar_numero_nota(nota.numero_nota),
                    tipo=tipo,
                    valor=valor,
                    data_pagamento=boleto.data_pagamento,
                    origem="BOLETO",
                    banco_id=boleto.banco_id,
                    banco_nome=banco.nome if banco else None,
                ))

            # Recibos ENTRADA/PAGO do mes deste CNPJ, sem nota fiscal vinculada
            # (mesma regra de resumo_financeiro: nunca soma recibo + boleto do mesmo servico)
            recibos = (
                db.query(Recibo, Condominio, Banco)
                .outerjoin(Condominio, Recibo.condominio_id == Condominio.id)
                .outerjoin(ManutencaoAssistencia, ManutencaoAssistencia.recibo_id == Recibo.id)
                .outerjoin(Banco, Recibo.banco_id == Banco.id)
                .filter(
                    Recibo.cnpj_emitente == cfg_cnpj_limpo,
                    Recibo.tipo == "ENTRADA",
                    Recibo.status == "PAGO",
                    Recibo.deletado_em.is_(None),
                    func.year(Recibo.data_pagamento) == ano,
                    func.month(Recibo.data_pagamento) == mes,
                    (ManutencaoAssistencia.nota_fiscal_id.is_(None)) | (ManutencaoAssistencia.id.is_(None)),
                )
                .all()
            )

            total_recibos = 0.0
            for recibo, condominio, banco in recibos:
                valor = round(float(recibo.valor or 0), 2)
                total_recibos += valor
                linhas.append(FluxoFinanceiroLinha(
                    origem_id=recibo.id,
                    condominio_id=condominio.id if condominio else None,
                    condominio_nome=condominio.nome if condominio else (recibo.cliente_nome_avulso or "Avulso"),
                    numero_nota=recibo.numero_recibo,
                    numero_nota_normalizado=recibo.numero_recibo,
                    tipo="RECIBO",
                    valor=valor,
                    data_pagamento=recibo.data_pagamento,
                    origem="RECIBO",
                    banco_id=recibo.banco_id,
                    banco_nome=banco.nome if banco else None,
                ))

            # valor_nominal/valor sao colunas FLOAT — a soma binaria acumula ruido
            # de poucos milesimos por linha; arredondar aqui evita que o total
            # exibido caia no centavo errado (ex: .815999... -> .81 em vez de .82).
            total_manutencao = round(total_manutencao, 2)
            total_assistencia = round(total_assistencia, 2)
            total_produto = round(total_produto, 2)
            total_recibos = round(total_recibos, 2)
            total_cnpj = round(total_manutencao + total_assistencia + total_produto + total_recibos, 2)
            if linhas or not cnpj_limpo:
                cnpjs_resultado.append(FluxoFinanceiroCnpj(
                    cnpj=cfg.cnpj,
                    razao_social=cfg.razao_social,
                    total_manutencao=total_manutencao,
                    total_assistencia=total_assistencia,
                    total_produto=total_produto,
                    total_recibos=total_recibos,
                    total_geral=total_cnpj,
                    linhas=sorted(linhas, key=lambda l: (l.condominio_nome, l.data_pagamento)),
                ))
                total_geral += total_cnpj

        return FluxoFinanceiroResponse(ano=ano, mes=mes, cnpjs=cnpjs_resultado, total_geral=round(total_geral, 2))

    @staticmethod
    def pendencias_ate_mes(db: Session, ano: int, mes: int, cnpj: Optional[str] = None) -> PendenciasResponse:
        """Lista boletos e recibos (tipo ENTRADA) com vencimento dentro do mes
        escolhido (nao acumula atrasados de meses anteriores — cada mes mostra
        so a propria pendencia). Usada pela tela de conciliacao manual (marcar
        como pago), reaproveitando os mesmos campos (situacao/status + data_pagamento)
        que fluxo_mensal le pra contar o mes."""
        primeiro_dia = date_cls(ano, mes, 1)
        ultimo_dia = date_cls(ano, mes, calendar.monthrange(ano, mes)[1])
        hoje = date_cls.today()
        cnpj_limpo = "".join(filter(str.isdigit, cnpj)) if cnpj else None

        linhas: List[PendenciaLinha] = []

        query_boletos = (
            db.query(Boleto, NotaFiscal, Condominio)
            .join(NotaFiscal, Boleto.nota_fiscal_id == NotaFiscal.id)
            .join(Condominio, NotaFiscal.condominio_id == Condominio.id)
            .filter(
                NotaFiscal.tipo.in_([TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA, TipoNota.PRODUTO]),
                # Cancela/Expirado não é pendência nem pagamento — fica fora da conciliação
                Boleto.situacao.notin_([SituacaoBoleto.CANCELADO, SituacaoBoleto.EXPIRADO]),
                Boleto.data_vencimento.between(primeiro_dia, ultimo_dia),
            )
        )
        if cnpj_limpo:
            query_boletos = query_boletos.filter(NotaFiscal.cnpj_emitente == cnpj_limpo)
        boletos = query_boletos.all()
        for boleto, nota, condominio in boletos:
            if boleto.situacao in (SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO):
                situacao = "PAGO"
            elif boleto.situacao == SituacaoBoleto.PARCIAL:
                situacao = "PARCIAL"
            elif boleto.data_vencimento < hoje:
                situacao = "VENCIDO"
            else:
                situacao = "PENDENTE"
            tipo = nota.tipo.value if hasattr(nota.tipo, "value") else str(nota.tipo)
            linhas.append(PendenciaLinha(
                origem_id=boleto.id,
                origem="BOLETO",
                condominio_id=condominio.id,
                condominio_nome=condominio.nome,
                numero_nota=nota.numero_nota,
                numero_parcela=boleto.numero_parcela,
                total_parcelas=boleto.total_parcelas,
                tipo=tipo,
                valor=round(float(boleto.valor_nominal or 0), 2),
                data_vencimento=boleto.data_vencimento,
                data_pagamento=boleto.data_pagamento,
                situacao=situacao,
                valor_recebido=round(float(boleto.valor_total_recebido), 2) if boleto.situacao == SituacaoBoleto.PARCIAL and boleto.valor_total_recebido else None,
            ))

        query_recibos = (
            db.query(Recibo, Condominio)
            .outerjoin(Condominio, Recibo.condominio_id == Condominio.id)
            .filter(
                Recibo.tipo == "ENTRADA",
                Recibo.deletado_em.is_(None),
                Recibo.status != "CANCELADO",
                func.coalesce(Recibo.data_vencimento, Recibo.data_emissao).between(primeiro_dia, ultimo_dia),
            )
        )
        if cnpj_limpo:
            query_recibos = query_recibos.filter(Recibo.cnpj_emitente == cnpj_limpo)
        recibos = query_recibos.all()
        for recibo, condominio in recibos:
            vencimento = recibo.data_vencimento or recibo.data_emissao
            if recibo.status == "PAGO":
                situacao = "PAGO"
            elif vencimento < hoje:
                situacao = "VENCIDO"
            else:
                situacao = "PENDENTE"
            linhas.append(PendenciaLinha(
                origem_id=recibo.id,
                origem="RECIBO",
                condominio_id=condominio.id if condominio else None,
                condominio_nome=condominio.nome if condominio else (recibo.cliente_nome_avulso or "Avulso"),
                numero_nota=recibo.numero_recibo,
                numero_parcela=recibo.numero_parcela,
                total_parcelas=recibo.total_parcelas,
                tipo="RECIBO",
                valor=round(float(recibo.valor or 0), 2),
                data_vencimento=vencimento,
                data_pagamento=recibo.data_pagamento,
                situacao=situacao,
            ))

        total = round(sum(l.valor for l in linhas), 2)
        total_pago = round(sum(l.valor for l in linhas if l.situacao == "PAGO"), 2)
        total_pendente = round(total - total_pago, 2)

        # Vencido e Parcial primeiro (quem precisa de acao/acompanhamento),
        # depois Pendente, Pago por ultimo -- dentro de cada grupo, por data
        # de vencimento e nome do condominio.
        ORDEM_SITUACAO = {"VENCIDO": 0, "PARCIAL": 1, "PENDENTE": 2, "PAGO": 3}
        linhas.sort(key=lambda l: (ORDEM_SITUACAO.get(l.situacao, 9), l.data_vencimento, l.condominio_nome))

        return PendenciasResponse(
            ano=ano, mes=mes, total=total, total_pago=total_pago, total_pendente=total_pendente, linhas=linhas,
        )

    @staticmethod
    def detectar_duplicatas(db: Session, ano: int, mes: int) -> List[AlertaDuplicata]:
        """Mesma nota + mesmo condominio + mesmo valor + data proxima (ate 2 dias) —
        heuristica usada manualmente durante a reconciliacao de Marco/Abril/2026
        pra achar as 3 categorias de duplicata (ver PENDENCIAS.md)."""
        boletos = (
            db.query(Boleto, NotaFiscal, Condominio)
            .join(NotaFiscal, Boleto.nota_fiscal_id == NotaFiscal.id)
            .join(Condominio, NotaFiscal.condominio_id == Condominio.id)
            .filter(
                Boleto.situacao.in_([SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO]),
                func.year(Boleto.data_pagamento) == ano,
                func.month(Boleto.data_pagamento) == mes,
            )
            .all()
        )

        dispensados = {
            (d.nota_id_1, d.nota_id_2) for d in db.query(DuplicataDispensada).all()
        }

        alertas: List[AlertaDuplicata] = []
        vistos = set()
        for i, (b1, n1, c1) in enumerate(boletos):
            for b2, n2, c2 in boletos[i + 1:]:
                if n1.id == n2.id or c1.id != c2.id:
                    continue
                if abs(float(b1.valor_nominal) - float(b2.valor_nominal)) > 0.01:
                    continue
                if abs((b1.data_pagamento - b2.data_pagamento).days) > 2:
                    continue
                chave = tuple(sorted([n1.id, n2.id]))
                if chave in vistos or chave in dispensados:
                    continue
                vistos.add(chave)
                alertas.append(AlertaDuplicata(
                    condominio_id=c1.id,
                    condominio_nome=c1.nome,
                    nota_id_1=n1.id,
                    nota_id_2=n2.id,
                    numero_nota_1=n1.numero_nota,
                    numero_nota_2=n2.numero_nota,
                    valor=float(b1.valor_nominal),
                    data_pagamento_1=b1.data_pagamento,
                    data_pagamento_2=b2.data_pagamento,
                ))
        return alertas

    @staticmethod
    def dispensar_duplicata(db: Session, nota_id_1: int, nota_id_2: int) -> None:
        """Marca um par de notas como 'não é duplicata' — some da lista de
        alertas em detectar_duplicatas dali em diante."""
        menor, maior = sorted([nota_id_1, nota_id_2])
        ja_existe = (
            db.query(DuplicataDispensada)
            .filter(DuplicataDispensada.nota_id_1 == menor, DuplicataDispensada.nota_id_2 == maior)
            .first()
        )
        if ja_existe:
            return
        db.add(DuplicataDispensada(nota_id_1=menor, nota_id_2=maior))
        db.commit()

    @staticmethod
    def detectar_notas_sem_boleto(db: Session, dias_atras: Optional[int] = None, ano: Optional[int] = None, mes: Optional[int] = None) -> List[AlertaNotaSemBoleto]:
        """Notas fiscais (Manutencao/Assistencia/Produto) com XML real importado
        mas SEM NENHUM boleto ativo -- ficam invisiveis em qualquer tela de
        pendencia/cobranca. So considera notas com pelo menos 3 dias desde a
        importacao (da tempo do fluxo normal gerar o boleto sozinho) e so
        aponta o gap quando a nota (ou a nota vinculada dela, se houver) nao
        tem boleto nenhum -- nota Produto vinculada a uma Assistencia que ja
        tem o boleto combinado NAO e' um gap real, e' o design normal.

        dias_atras: sem limite por padrao (varre todo o historico). Se
        informado, so considera notas com data_vencimento nos ultimos N dias
        -- util pra nao dragar historico antigo ja reconciliado por outro
        caminho (ex: nota real com XML cujo pagamento foi registrado numa
        outra nota placeholder, sem vinculo formal entre as duas). Usa
        data_vencimento (data real da transacao) e nao criado_em, porque
        muita nota antiga desse sistema foi importada retroativamente meses
        depois do vencimento -- filtrar por criado_em nao filtraria nada."""
        from app.models.nota_sem_boleto_dispensada_model import NotaSemBoletoDispensada
        from datetime import datetime, date as date_cls, timedelta

        limite_criacao = datetime.now() - timedelta(days=3)

        dispensadas = {d.nota_id for d in db.query(NotaSemBoletoDispensada).all()}

        filtros = [
            NotaFiscal.tipo.in_([TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA, TipoNota.PRODUTO]),
            NotaFiscal.status != StatusNota.CANCELADA,
            NotaFiscal.xml_original != "",
            NotaFiscal.criado_em < limite_criacao,
        ]
        if ano is not None and mes is not None:
            primeiro_dia = date_cls(ano, mes, 1)
            ultimo_dia = date_cls(ano, mes, calendar.monthrange(ano, mes)[1])
            filtros.append(NotaFiscal.data_vencimento.between(primeiro_dia, ultimo_dia))
        elif dias_atras is not None:
            filtros.append(NotaFiscal.data_vencimento >= date_cls.today() - timedelta(days=dias_atras))

        notas = (
            db.query(NotaFiscal, Condominio)
            .join(Condominio, NotaFiscal.condominio_id == Condominio.id)
            .filter(*filtros)
            .all()
        )

        def tem_boleto_ativo(nota_id: int) -> bool:
            return (
                db.query(Boleto)
                .filter(
                    Boleto.nota_fiscal_id == nota_id,
                    Boleto.situacao.notin_([SituacaoBoleto.CANCELADO, SituacaoBoleto.EXPIRADO]),
                )
                .first()
                is not None
            )

        alertas: List[AlertaNotaSemBoleto] = []
        for nota, condominio in notas:
            if nota.id in dispensadas:
                continue
            if tem_boleto_ativo(nota.id):
                continue
            if nota.nota_vinculada_id and tem_boleto_ativo(nota.nota_vinculada_id):
                continue
            tipo = nota.tipo.value if hasattr(nota.tipo, "value") else str(nota.tipo)
            alertas.append(AlertaNotaSemBoleto(
                nota_id=nota.id,
                numero_nota=nota.numero_nota,
                condominio_id=condominio.id,
                condominio_nome=condominio.nome,
                tipo=tipo,
                valor=round(float(nota.valor), 2),
                data_vencimento=nota.data_vencimento,
                cnpj_emitente=nota.cnpj_emitente,
                possivel_falta_vinculo=(tipo == "PRODUTO" and not nota.nota_vinculada_id),
            ))
        alertas.sort(key=lambda a: a.data_vencimento)
        return alertas

    @staticmethod
    def dispensar_nota_sem_boleto(db: Session, nota_id: int) -> None:
        """Marca uma nota como 'ok, nao precisa de boleto' -- some da lista de
        alertas em detectar_notas_sem_boleto dali em diante."""
        from app.models.nota_sem_boleto_dispensada_model import NotaSemBoletoDispensada
        ja_existe = db.query(NotaSemBoletoDispensada).filter(NotaSemBoletoDispensada.nota_id == nota_id).first()
        if ja_existe:
            return
        db.add(NotaSemBoletoDispensada(nota_id=nota_id))
        db.commit()

    @staticmethod
    def detectar_notas_sem_servico(db: Session, dias_atras: Optional[int] = None, ano: Optional[int] = None, mes: Optional[int] = None) -> List[AlertaNotaSemServico]:
        """Notas fiscais MANUTENCAO/ASSISTENCIA com XML real importado mas
        SEM NENHUM servico (manutencoes_assistencias) vinculado -- o campo
        descricao_servico existe na nota mas ninguem registrou o servico em
        si, o que quebra relatorios/termos de garantia que dependem dele.
        PRODUTO nao entra aqui -- nota de produto nunca gera servico, so
        boleto. dias_atras funciona igual detectar_notas_sem_boleto: sem
        limite por padrao, filtra por data_vencimento quando informado
        (nao criado_em -- muita nota antiga foi importada retroativamente)."""
        from app.models.nota_sem_servico_dispensada_model import NotaSemServicoDispensada
        from datetime import datetime, date as date_cls, timedelta

        limite_criacao = datetime.now() - timedelta(days=3)
        dispensadas = {d.nota_id for d in db.query(NotaSemServicoDispensada).all()}

        filtros = [
            NotaFiscal.tipo.in_([TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA]),
            NotaFiscal.status != StatusNota.CANCELADA,
            NotaFiscal.xml_original != "",
            NotaFiscal.criado_em < limite_criacao,
        ]
        if ano is not None and mes is not None:
            primeiro_dia = date_cls(ano, mes, 1)
            ultimo_dia = date_cls(ano, mes, calendar.monthrange(ano, mes)[1])
            filtros.append(NotaFiscal.data_vencimento.between(primeiro_dia, ultimo_dia))
        elif dias_atras is not None:
            filtros.append(NotaFiscal.data_vencimento >= date_cls.today() - timedelta(days=dias_atras))

        notas = (
            db.query(NotaFiscal, Condominio)
            .join(Condominio, NotaFiscal.condominio_id == Condominio.id)
            .filter(*filtros)
            .all()
        )

        def tem_servico_proprio(nota_id: int) -> bool:
            return (
                db.query(ManutencaoAssistencia)
                .filter(ManutencaoAssistencia.nota_fiscal_id == nota_id)
                .first()
                is not None
            )

        alertas: List[AlertaNotaSemServico] = []
        for nota, condominio in notas:
            if nota.id in dispensadas:
                continue
            if tem_servico_proprio(nota.id):
                continue
            # nota vinculada (ex: Assistencia+Produto combinados) pode carregar o unico
            # servico do par -- mesma checagem ja feita em detectar_notas_sem_boleto
            if nota.nota_vinculada_id and tem_servico_proprio(nota.nota_vinculada_id):
                continue
            tipo = nota.tipo.value if hasattr(nota.tipo, "value") else str(nota.tipo)
            alertas.append(AlertaNotaSemServico(
                nota_id=nota.id,
                numero_nota=nota.numero_nota,
                condominio_id=condominio.id,
                condominio_nome=condominio.nome,
                tipo=tipo,
                valor=round(float(nota.valor), 2),
                data_vencimento=nota.data_vencimento,
                cnpj_emitente=nota.cnpj_emitente,
            ))
        alertas.sort(key=lambda a: a.data_vencimento)
        return alertas

    @staticmethod
    def dispensar_nota_sem_servico(db: Session, nota_id: int) -> None:
        """Marca uma nota como 'ok, nao precisa de servico' -- some da lista
        de alertas em detectar_notas_sem_servico dali em diante."""
        from app.models.nota_sem_servico_dispensada_model import NotaSemServicoDispensada
        ja_existe = db.query(NotaSemServicoDispensada).filter(NotaSemServicoDispensada.nota_id == nota_id).first()
        if ja_existe:
            return
        db.add(NotaSemServicoDispensada(nota_id=nota_id))
        db.commit()

    @staticmethod
    def detectar_parcelas_faltando(db: Session, dias_atras: Optional[int] = None, ano: Optional[int] = None, mes: Optional[int] = None) -> List[AlertaParcelaFaltando]:
        """Notas parceladas (total_parcelas > 1, via nota.parcelas ou corpo.numero_parcelas
        quando a nota tem corpo_nota_id -- mesma regra de BoletoService.gerar_parcelas_faltantes)
        onde JA existe pelo menos 1 boleto mas nem todas as parcelas foram geradas. Cada
        parcela faltante vira um alerta individual, pra nao esconder uma faltante atras de
        outra ja gerada. So mostra parcela cuja data esperada ja chegou (senao daria alerta
        de parcela futura legitima ainda nao vencida)."""
        from app.models.parcela_faltando_dispensada_model import ParcelaFaltandoDispensada
        from app.models.corpo_nota_model import CorpoNota
        from datetime import datetime, timedelta

        limite_criacao = datetime.now() - timedelta(days=3)
        dispensadas = {(d.nota_id, d.numero_parcela) for d in db.query(ParcelaFaltandoDispensada).all()}

        filtros = [
            NotaFiscal.tipo.in_([TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA, TipoNota.PRODUTO]),
            NotaFiscal.status != StatusNota.CANCELADA,
            NotaFiscal.xml_original != "",
            NotaFiscal.criado_em < limite_criacao,
        ]

        notas = (
            db.query(NotaFiscal, Condominio)
            .join(Condominio, NotaFiscal.condominio_id == Condominio.id)
            .filter(*filtros)
            .all()
        )

        hoje = date_cls.today()
        SITUACOES_INATIVAS = {SituacaoBoleto.CANCELADO, SituacaoBoleto.EXPIRADO}
        alertas: List[AlertaParcelaFaltando] = []

        for nota, condominio in notas:
            total_parcelas = nota.parcelas if nota.parcelas and nota.parcelas > 0 else 1
            corpo = None
            if nota.corpo_nota_id:
                corpo = db.query(CorpoNota).filter(CorpoNota.id == nota.corpo_nota_id).first()
                if corpo and corpo.numero_parcelas and corpo.numero_parcelas > 1:
                    total_parcelas = corpo.numero_parcelas
            if total_parcelas <= 1:
                continue

            # nota vinculada (ex: Assistencia+Produto combinados) pode carregar o boleto
            # combinado inteiro do outro lado -- mesma checagem ja feita nos outros 2 detectores
            ids_boleto = [nota.id] + ([nota.nota_vinculada_id] if nota.nota_vinculada_id else [])
            boletos = db.query(Boleto).filter(Boleto.nota_fiscal_id.in_(ids_boleto)).all()
            existentes = {b.numero_parcela for b in boletos if b.situacao not in SITUACOES_INATIVAS}
            faltantes = [p for p in range(1, total_parcelas + 1) if p not in existentes]
            if not faltantes:
                continue

            valor_total = float(nota.valor)
            valor_parcela_padrao = round(valor_total / total_parcelas, 2)
            tipo = nota.tipo.value if hasattr(nota.tipo, "value") else str(nota.tipo)

            for p in faltantes:
                if (nota.id, p) in dispensadas:
                    continue

                data_esperada = None
                origem_data = "estimado"
                valor_esperado = valor_parcela_padrao if p < total_parcelas else round(valor_total - valor_parcela_padrao * (total_parcelas - 1), 2)

                if corpo and corpo.parcelas_json and len(corpo.parcelas_json) >= p:
                    item = corpo.parcelas_json[p - 1]
                    if item.get("data"):
                        data_esperada = item["data"] if isinstance(item["data"], date_cls) else date_cls.fromisoformat(str(item["data"])[:10])
                        origem_data = "corpo"
                    if item.get("valor"):
                        valor_esperado = float(item["valor"])
                elif nota.parcelas_json:
                    item = next((x for x in nota.parcelas_json if x.get("parcela") == p), None)
                    if item and item.get("data"):
                        data_esperada = item["data"] if isinstance(item["data"], date_cls) else date_cls.fromisoformat(str(item["data"])[:10])
                        origem_data = "nota"
                        if item.get("valor"):
                            valor_esperado = float(item["valor"])

                if data_esperada is None:
                    data_esperada = nota.data_vencimento + timedelta(days=30 * (p - 1))
                    origem_data = "estimado"

                if ano is not None and mes is not None:
                    if data_esperada.year != ano or data_esperada.month != mes:
                        continue
                else:
                    if data_esperada > hoje:
                        continue
                    if dias_atras is not None and data_esperada < hoje - timedelta(days=dias_atras):
                        continue

                alertas.append(AlertaParcelaFaltando(
                    nota_id=nota.id,
                    numero_nota=nota.numero_nota,
                    condominio_id=condominio.id,
                    condominio_nome=condominio.nome,
                    tipo=tipo,
                    numero_parcela=p,
                    total_parcelas=total_parcelas,
                    valor_parcela=valor_esperado,
                    data_vencimento=data_esperada,
                    origem_data=origem_data,
                    cnpj_emitente=nota.cnpj_emitente,
                ))

        alertas.sort(key=lambda a: a.data_vencimento)
        return alertas

    @staticmethod
    def dispensar_parcela_faltando(db: Session, nota_id: int, numero_parcela: int) -> None:
        """Marca uma parcela especifica como 'ok, nao precisa gerar' -- some
        da lista de alertas em detectar_parcelas_faltando dali em diante."""
        from app.models.parcela_faltando_dispensada_model import ParcelaFaltandoDispensada
        ja_existe = (
            db.query(ParcelaFaltandoDispensada)
            .filter(ParcelaFaltandoDispensada.nota_id == nota_id, ParcelaFaltandoDispensada.numero_parcela == numero_parcela)
            .first()
        )
        if ja_existe:
            return
        db.add(ParcelaFaltandoDispensada(nota_id=nota_id, numero_parcela=numero_parcela))
        db.commit()
