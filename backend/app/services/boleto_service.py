from datetime import date
from typing import List
from sqlalchemy.orm import Session

from app.repositories.boleto_repository import BoletoRepository
from app.repositories.nota_fiscal_repository import NotaFiscalRepository
from app.repositories.contato_repository import ContatoRepository
from app.repositories.endereco_repository import EnderecoRepository
from app.models.boleto_model import SituacaoBoleto
from app.schemas.boleto_schema import BoletoResponse, GerarBoletosResponse, SincronizarResponse
from app.services import inter_client


def _limpar_cnpj(cnpj: str) -> str:
    return "".join(filter(str.isdigit, cnpj or ""))


def _mapear_situacao(situacao_inter: str) -> SituacaoBoleto:
    mapa = {
        "EMABERTO": SituacaoBoleto.EMABERTO,
        "PAGO": SituacaoBoleto.PAGO,
        "CANCELADO": SituacaoBoleto.CANCELADO,
        "EXPIRADO": SituacaoBoleto.EXPIRADO,
        "VENCIDO": SituacaoBoleto.VENCIDO,
        "BAIXADO": SituacaoBoleto.BAIXADO,
    }
    return mapa.get(situacao_inter.upper(), SituacaoBoleto.EMABERTO)


class BoletoService:

    @staticmethod
    def gerar_boletos(db: Session, nota_ids: List[int]) -> GerarBoletosResponse:
        sucesso = []
        erros = []

        for nota_id in nota_ids:
            try:
                # Verifica se já existe boleto para esta nota
                existente = BoletoRepository.get_by_nota_fiscal(db, nota_id)
                if existente:
                    erros.append({"nota_id": nota_id, "erro": "Boleto já gerado para esta nota."})
                    continue

                # Busca nota fiscal
                nota = NotaFiscalRepository.get_by_id(db, nota_id)
                if not nota:
                    erros.append({"nota_id": nota_id, "erro": "Nota fiscal não encontrada."})
                    continue

                if not nota.condominio_id:
                    erros.append({"nota_id": nota_id, "erro": "Nota sem condomínio vinculado."})
                    continue

                # Busca dados do condomínio
                condominio = nota.condominio
                if not condominio or not condominio.cnpj:
                    erros.append({"nota_id": nota_id, "erro": "Condomínio sem CNPJ cadastrado."})
                    continue

                # Busca endereço e contato principal
                endereco = EnderecoRepository.get_by_condominio(db, condominio.id)
                contato = ContatoRepository.get_principal(db, condominio.id)

                # Monta payload para a API Inter
                seu_numero = nota.numero_nota[:15] if nota.numero_nota else str(nota_id)
                payload = {
                    "seuNumero": seu_numero,
                    "valorNominal": nota.valor,
                    "dataVencimento": nota.data_vencimento.strftime("%Y-%m-%d"),
                    "pagador": {
                        "cpfCnpj": _limpar_cnpj(condominio.cnpj),
                        "tipoPessoa": "JURIDICA",
                        "nome": condominio.razao_social or condominio.nome,
                        "email": contato.email if contato else "",
                        "telefone": contato.telefone if contato else "",
                        "endereco": endereco.rua if endereco else "Não informado",
                        "numero": endereco.numero if endereco else "S/N",
                        "bairro": endereco.bairro if endereco else "Não informado",
                        "cidade": endereco.cidade if endereco else "Não informado",
                        "uf": endereco.estado if endereco else "SP",
                        "cep": _limpar_cnpj(endereco.cep) if endereco and endereco.cep else "00000000",
                    }
                }

                # Chama a API Inter
                resposta = inter_client.emitir_boleto(payload)

                # Salva no banco
                db_boleto = BoletoRepository.create(db, {
                    "nota_fiscal_id": nota_id,
                    "codigo_solicitacao": resposta.get("codigoSolicitacao"),
                    "nosso_numero": resposta.get("nossoNumero"),
                    "seu_numero": seu_numero,
                    "valor_nominal": nota.valor,
                    "valor_juros": 0.0,
                    "valor_multa": 0.0,
                    "data_emissao": date.today(),
                    "data_vencimento": nota.data_vencimento,
                    "situacao": SituacaoBoleto.EMABERTO,
                })

                sucesso.append(BoletoResponse.model_validate(db_boleto))
                print(f"Boleto gerado para nota {nota_id}: {resposta.get('codigoSolicitacao')}")

            except Exception as e:
                erros.append({"nota_id": nota_id, "erro": str(e)})
                print(f"Erro ao gerar boleto para nota {nota_id}: {e}")

        return GerarBoletosResponse(sucesso=sucesso, erros=erros)

    @staticmethod
    def listar_boletos(db: Session) -> List[BoletoResponse]:
        boletos = BoletoRepository.get_all(db)
        return [BoletoResponse.model_validate(b) for b in boletos]

    @staticmethod
    def get_boleto_por_nota(db: Session, nota_fiscal_id: int):
        boleto = BoletoRepository.get_by_nota_fiscal(db, nota_fiscal_id)
        if not boleto:
            return None
        return BoletoResponse.model_validate(boleto)

    @staticmethod
    def cancelar_boleto(db: Session, codigo_solicitacao: str) -> BoletoResponse:
        db_boleto = BoletoRepository.get_by_codigo(db, codigo_solicitacao)
        if not db_boleto:
            raise Exception("Boleto não encontrado.")

        inter_client.cancelar_boleto(codigo_solicitacao)
        BoletoRepository.update(db, db_boleto, {"situacao": SituacaoBoleto.CANCELADO})
        return BoletoResponse.model_validate(db_boleto)

    @staticmethod
    def baixar_pdf(db: Session, codigo_solicitacao: str) -> bytes:
        db_boleto = BoletoRepository.get_by_codigo(db, codigo_solicitacao)
        if not db_boleto:
            raise Exception("Boleto não encontrado.")
        return inter_client.baixar_pdf(codigo_solicitacao)

    @staticmethod
    def sincronizar_status(db: Session) -> SincronizarResponse:
        pendentes = BoletoRepository.get_pendentes(db)
        atualizados = 0
        erros = []

        for boleto in pendentes:
            if not boleto.codigo_solicitacao:
                continue
            try:
                dados = inter_client.consultar_boleto(boleto.codigo_solicitacao)
                nova_situacao = _mapear_situacao(dados.get("situacao", "EMABERTO"))

                update = {"situacao": nova_situacao}
                if dados.get("dataPagamento"):
                    update["data_pagamento"] = date.fromisoformat(dados["dataPagamento"])
                if dados.get("valorTotalRecebido"):
                    update["valor_total_recebido"] = float(dados["valorTotalRecebido"])
                if dados.get("multa"):
                    update["valor_multa"] = float(dados["multa"])
                if dados.get("mora"):
                    update["valor_juros"] = float(dados["mora"])

                BoletoRepository.update(db, boleto, update)
                atualizados += 1
            except Exception as e:
                erros.append({"codigo": boleto.codigo_solicitacao, "erro": str(e)})

        return SincronizarResponse(atualizados=atualizados, erros=erros)
