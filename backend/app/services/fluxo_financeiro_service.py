import re
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.nota_fiscal_model import NotaFiscal, TipoNota
from app.models.boleto_model import Boleto, SituacaoBoleto
from app.models.recibo_model import Recibo
from app.models.servico_model import ManutencaoAssistencia
from app.models.condominio_model import Condominio
from app.models.duplicata_dispensada_model import DuplicataDispensada
from app.repositories.configuracao_repository import ConfiguracaoInterRepository
from app.schemas.fluxo_financeiro_schema import (
    FluxoFinanceiroLinha, FluxoFinanceiroCnpj, FluxoFinanceiroResponse, AlertaDuplicata,
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
                db.query(Boleto, NotaFiscal, Condominio)
                .join(NotaFiscal, Boleto.nota_fiscal_id == NotaFiscal.id)
                .join(Condominio, NotaFiscal.condominio_id == Condominio.id)
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
            for boleto, nota, condominio in boletos:
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
                    condominio_id=condominio.id,
                    condominio_nome=condominio.nome,
                    numero_nota=nota.numero_nota,
                    numero_nota_normalizado=normalizar_numero_nota(nota.numero_nota),
                    tipo=tipo,
                    valor=valor,
                    data_pagamento=boleto.data_pagamento,
                    origem="BOLETO",
                ))

            # Recibos ENTRADA/PAGO do mes deste CNPJ, sem nota fiscal vinculada
            # (mesma regra de resumo_financeiro: nunca soma recibo + boleto do mesmo servico)
            recibos = (
                db.query(Recibo, Condominio)
                .outerjoin(Condominio, Recibo.condominio_id == Condominio.id)
                .outerjoin(ManutencaoAssistencia, ManutencaoAssistencia.recibo_id == Recibo.id)
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
            for recibo, condominio in recibos:
                valor = round(float(recibo.valor or 0), 2)
                total_recibos += valor
                linhas.append(FluxoFinanceiroLinha(
                    condominio_id=condominio.id if condominio else None,
                    condominio_nome=condominio.nome if condominio else (recibo.cliente_nome_avulso or "Avulso"),
                    numero_nota=recibo.numero_recibo,
                    numero_nota_normalizado=recibo.numero_recibo,
                    tipo="RECIBO",
                    valor=valor,
                    data_pagamento=recibo.data_pagamento,
                    origem="RECIBO",
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
