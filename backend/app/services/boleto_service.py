from datetime import date, timedelta
from typing import List
from sqlalchemy.orm import Session

from app.repositories.boleto_repository import BoletoRepository
from app.repositories.nota_fiscal_repository import NotaFiscalRepository
from app.repositories.contato_repository import ContatoRepository
from app.repositories.endereco_repository import EnderecoRepository
from app.models.boleto_model import SituacaoBoleto
from app.schemas.boleto_schema import BoletoResponse, GerarBoletosResponse, SincronizarResponse, SincronizarInterResponse, BoletoStats, GerarParcelasFaltantesResponse, NotaSemBoletoResponse

NFRepo = NotaFiscalRepository
from app.services import inter_client


def _limpar_cnpj(cnpj: str) -> str:
    return "".join(filter(str.isdigit, cnpj or ""))


def _calcular_valor_liquido(db: Session, nota, pcts_override: dict = None) -> float:
    """
    Calcula o valor líquido da nota descontando impostos com base na tabela de configuração.
    Para MANUTENCAO/ASSISTENCIA: aplica os percentuais da config (ou override).
    Para OUTROS: retorna valor integral.
    pcts_override: dict com chaves opcionais pct_pis, pct_cofins, pct_inss, pct_csll (floats)
    """
    from app.models.nota_fiscal_model import TipoNota
    from app.models.configuracao_impostos_model import ConfiguracaoImpostosServico, TipoServicoConfig

    if nota.tipo not in (TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA):
        return float(nota.valor)

    try:
        tipo_cfg = TipoServicoConfig(nota.tipo.value)
        config = db.query(ConfiguracaoImpostosServico).filter_by(tipo_servico=tipo_cfg, ativo=True).first()
    except Exception:
        config = None

    if config:
        pct_pis    = (pcts_override or {}).get('pct_pis',    float(config.pct_pis))
        pct_cofins = (pcts_override or {}).get('pct_cofins', float(config.pct_cofins))
        pct_inss   = (pcts_override or {}).get('pct_inss',   float(config.pct_inss))
        pct_csll   = (pcts_override or {}).get('pct_csll',   float(config.pct_csll))
    else:
        # Fallback: usa valores absolutos do XML se não houver config
        impostos = sum(x for x in [nota.pis, nota.cofins, nota.inss, nota.csll] if x)
        return max(round(float(nota.valor) - impostos, 2), 0.01)

    v_bruto = float(nota.valor)
    i_pis    = round(v_bruto * (pct_pis / 100), 2)
    i_cofins = round(v_bruto * (pct_cofins / 100), 2)
    i_inss   = round(v_bruto * (pct_inss / 100), 2)
    i_csll   = round(v_bruto * (pct_csll / 100), 2)
    total_impostos = i_pis + i_cofins + i_inss + i_csll
    return max(round(v_bruto - total_impostos, 2), 0.01)


def _montar_mensagem_payload(mensagem: str | None, numero_nota: str, numero_os: str | None) -> dict | None:
    """Monta o objeto 'mensagem' para o payload Inter (até 60 chars por linha)."""
    linhas = []
    if mensagem:
        for i in range(0, min(len(mensagem), 300), 60):
            linhas.append(mensagem[i:i + 60])
    elif numero_os:
        linhas.append(f"OS: {numero_os} | NF: {numero_nota}")
    if not linhas:
        return None
    keys = ["linha1", "linha2", "linha3", "linha4", "linha5"]
    return {keys[i]: linha for i, linha in enumerate(linhas[:5])}


def _montar_mora_multa(aplicar_juros: bool, taxa_juros: float) -> dict:
    """Monta os campos de mora e multa para o payload Inter."""
    if not aplicar_juros:
        return {}
    return {
        "mora": {
            "tipo": "TAXA_MENSAL",
            "taxa": taxa_juros,
        },
        "multa": {
            "tipo": "PERCENTUAL",
            "valor": 2.0,
        },
    }


def _aplicar_juros_default(nota) -> bool:
    """True para serviços (juros padrão ativo); False para OUTROS (produto sem juros)."""
    from app.models.nota_fiscal_model import TipoNota
    return nota.tipo in (TipoNota.MANUTENCAO, TipoNota.ASSISTENCIA)


def _mapear_situacao(situacao_inter: str) -> SituacaoBoleto:
    mapa = {
        "EMABERTO": SituacaoBoleto.EMABERTO,
        "PAGO": SituacaoBoleto.PAGO,
        "CANCELADO": SituacaoBoleto.CANCELADO,
        "EXPIRADO": SituacaoBoleto.EXPIRADO,
        "VENCIDO": SituacaoBoleto.VENCIDO,
        "BAIXADO": SituacaoBoleto.BAIXADO,
        "A_RECEBER": SituacaoBoleto.EMABERTO,
        "REGISTRADO": SituacaoBoleto.EMABERTO,
        "RECEBIDO": SituacaoBoleto.PAGO,
        "BAIXADO_BOLETO_NAO_PAGO": SituacaoBoleto.BAIXADO,
        "ATRASADO": SituacaoBoleto.VENCIDO,
    }
    return mapa.get(situacao_inter.upper(), SituacaoBoleto.EMABERTO)


def _buscar_nota(
    db,
    seu_numero: str,
    data_vencimento_inter: str | None,
    valor_nominal: float | None = None,
    cnpj_pagador: str | None = None,
):
    """
    Tenta encontrar uma NotaFiscal pelo seuNumero do Inter usando múltiplos fallbacks.

    Formatos conhecidos de seuNumero:
    - "7563M"        → strip M → "7563"           (MANUTENCAO simples)
    - "7555A"        → strip A → "7555"           (ASSISTENCIA simples)
    - "000.000.047A" → sanitizado "000000047A"
                       strip A → "000000047"
                       strip zeros → "47"
                       busca "47-1", "47-2"... (ASSISTENCIA parcelada)
    - "022/7573A"    → sanitizado "0227573A"
                       strip A → "0227573"
                       strip zeros → "227573" (não encontra)
                       tenta sufixo: "7573"

    Fallback final (tentativa 6):
    - CNPJ do pagador (do objeto pagador do Inter) → encontra o Condomínio →
      filtra notas do condomínio por valor + data de vencimento.
    """
    from app.models.nota_fiscal_model import NotaFiscal
    from app.models.condominio_model import Condominio

    def query_exata(n):
        return db.query(NotaFiscal).filter(NotaFiscal.numero_nota == n).first()

    def query_prefixo(n):
        return db.query(NotaFiscal).filter(NotaFiscal.numero_nota.startswith(n)).first()

    def query_prefixo_parcela(n, data_venc):
        """Busca 'NN-*' e escolhe pelo vencimento mais próximo."""
        candidatas = db.query(NotaFiscal).filter(
            NotaFiscal.numero_nota.startswith(n + "-")
        ).all()
        if not candidatas:
            return None
        if len(candidatas) == 1:
            return candidatas[0]
        if data_venc:
            venc = date.fromisoformat(data_venc)
            return min(candidatas, key=lambda x: abs((x.data_vencimento - venc).days))
        return candidatas[0]

    # --- tentativa 1: exata ---
    nota = query_exata(seu_numero)
    if nota:
        return nota, "exato"

    # --- tentativa 2: prefixo (número começa com seuNumero) ---
    nota = query_prefixo(seu_numero)
    if nota:
        return nota, "prefixo"

    # --- tentativa 3: strip sufixo letra ---
    if seu_numero and seu_numero[-1].isalpha():
        base = seu_numero[:-1]

        nota = query_exata(base)
        if nota:
            return nota, f"strip_letra({base})"

        nota = query_prefixo(base)
        if nota:
            return nota, f"prefixo_strip_letra({base})"

        # --- tentativa 4: strip zeros à esquerda (000000047 → 47) ---
        if base.isdigit():
            sem_zeros = str(int(base))  # "000000047" → "47"
            if sem_zeros != base:
                nota = query_exata(sem_zeros)
                if nota:
                    return nota, f"sem_zeros({sem_zeros})"

                nota = query_prefixo(sem_zeros)
                if nota:
                    return nota, f"prefixo_sem_zeros({sem_zeros})"

                # busca "47-1", "47-2" etc
                nota = query_prefixo_parcela(sem_zeros, data_vencimento_inter)
                if nota:
                    return nota, f"parcela({sem_zeros}-*)"

        # --- tentativa 5: sufixo numérico (022/7573A → "0227573" → tenta "7573") ---
        if base.isdigit() and len(base) > 4:
            for tamanho in (4, 5, 6):
                sufixo = base[-tamanho:]
                nota = query_exata(sufixo)
                if nota:
                    return nota, f"sufixo({sufixo})"
                nota = query_prefixo(sufixo)
                if nota:
                    return nota, f"prefixo_sufixo({sufixo})"

    # --- tentativa 6: CNPJ do pagador + valor + data de vencimento ---
    if cnpj_pagador:
        cnpj_limpo = _limpar_cnpj(cnpj_pagador)
        # Busca o condomínio pelo CNPJ limpo
        from sqlalchemy import func as sqlfunc
        condominio = (
            db.query(Condominio)
            .filter(
                sqlfunc.replace(
                    sqlfunc.replace(
                        sqlfunc.replace(Condominio.cnpj, ".", ""),
                        "/", ""
                    ),
                    "-", ""
                ) == cnpj_limpo
            )
            .first()
        )
        if condominio:
            candidatas = db.query(NotaFiscal).filter(
                NotaFiscal.condominio_id == condominio.id
            ).all()

            # Filtra por valor exato (tolerância de 1 centavo)
            if valor_nominal:
                por_valor = [n for n in candidatas if abs(n.valor - valor_nominal) < 0.02]
                if len(por_valor) == 1:
                    return por_valor[0], f"cnpj+valor({valor_nominal})"
                if len(por_valor) > 1 and data_vencimento_inter:
                    venc = date.fromisoformat(data_vencimento_inter)
                    # Preferência: nota com vencimento exato
                    exatos = [n for n in por_valor if n.data_vencimento == venc]
                    if len(exatos) == 1:
                        return exatos[0], f"cnpj+valor+venc_exato"
                    # Senão: mais próximo
                    return min(por_valor, key=lambda x: abs((x.data_vencimento - venc).days)), "cnpj+valor+venc_prox"

            # Sem valor, tenta só por CNPJ + data de vencimento exata
            if data_vencimento_inter:
                venc = date.fromisoformat(data_vencimento_inter)
                por_venc = [n for n in candidatas if n.data_vencimento == venc]
                if len(por_venc) == 1:
                    return por_venc[0], "cnpj+venc_exato"

    return None, None


def _atualizar_data_pagamento_nota(db: Session, nota_id: int) -> None:
    """Se todos os boletos da nota estão PAGO/BAIXADO, preenche nota.data_pagamento."""
    from app.models.nota_fiscal_model import NotaFiscal

    boletos_da_nota = BoletoRepository.get_all_by_nota_fiscal(db, nota_id)
    if not boletos_da_nota:
        return

    pagos = {SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO}
    if not all(b.situacao in pagos for b in boletos_da_nota):
        return

    # Usa a data de pagamento mais recente entre as parcelas
    datas = [b.data_pagamento for b in boletos_da_nota if b.data_pagamento]
    data_pag = max(datas) if datas else date.today()

    nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
    if nota and not nota.data_pagamento:
        nota.data_pagamento = data_pag
        db.commit()
        print(f"[DataPag] Nota #{nota_id} marcada como paga em {data_pag}")


class BoletoService:

    @staticmethod
    def gerar_boletos(
        db: Session,
        nota_ids: List[int],
        data_vencimento_override: date = None,
        valor_total_override: float = None,
        mensagem: str = None,
        pct_pis: float = None,
        pct_cofins: float = None,
        pct_inss: float = None,
        pct_csll: float = None,
        aplicar_juros: bool = None,
        taxa_juros: float = 1.0,
    ) -> GerarBoletosResponse:
        sucesso = []
        erros = []

        pcts_override = {}
        if pct_pis    is not None: pcts_override['pct_pis']    = pct_pis
        if pct_cofins is not None: pcts_override['pct_cofins'] = pct_cofins
        if pct_inss   is not None: pcts_override['pct_inss']   = pct_inss
        if pct_csll   is not None: pcts_override['pct_csll']   = pct_csll

        for nota_id in nota_ids:
            try:
                existentes = BoletoRepository.get_all_by_nota_fiscal(db, nota_id)
                if existentes:
                    erros.append({"nota_id": nota_id, "erro": "Boleto(s) já gerado(s) para esta nota."})
                    continue

                nota = NotaFiscalRepository.get_by_id(db, nota_id)
                if not nota:
                    erros.append({"nota_id": nota_id, "erro": "Nota fiscal não encontrada."})
                    continue

                if not nota.condominio_id:
                    erros.append({"nota_id": nota_id, "erro": "Nota sem condomínio vinculado."})
                    continue

                condominio = nota.condominio
                if not condominio or not condominio.cnpj:
                    erros.append({"nota_id": nota_id, "erro": "Condomínio sem CNPJ cadastrado."})
                    continue

                endereco = EnderecoRepository.get_by_condominio(db, condominio.id)
                contato = ContatoRepository.get_principal(db, condominio.id)

                # Busca OS vinculada para compor a mensagem no boleto
                from app.models.servico_model import ManutencaoAssistencia as _MA
                servico_os = db.query(_MA).filter(_MA.nota_fiscal_id == nota_id).first()
                numero_os = (servico_os.numero_os if servico_os else None)

                usar_juros = aplicar_juros if aplicar_juros is not None else _aplicar_juros_default(nota)
                mora_payload = _montar_mora_multa(usar_juros, taxa_juros or 1.0)

                total_parcelas = nota.parcelas if nota.parcelas and nota.parcelas > 0 else 1
                valor_base = valor_total_override if valor_total_override else _calcular_valor_liquido(db, nota, pcts_override or None)
                valor_parcela = round(valor_base / total_parcelas, 2)
                valor_ultima = round(valor_base - valor_parcela * (total_parcelas - 1), 2)

                pagador = {
                    "cpfCnpj": _limpar_cnpj(condominio.cnpj),
                    "tipoPessoa": "JURIDICA",
                    "nome": nota.cliente_nome or condominio.razao_social or condominio.nome,
                    "email": (contato.email if contato else "") or "",
                    "telefone": (contato.telefone if contato else "") or "",
                    "endereco": (endereco.rua if endereco else None) or "Não informado",
                    "numero": (endereco.numero if endereco else None) or "S/N",
                    "bairro": (endereco.bairro if endereco else None) or "Não informado",
                    "cidade": (endereco.cidade if endereco else None) or "Não informado",
                    "uf": (endereco.estado if endereco else None) or "SP",
                    "cep": _limpar_cnpj(endereco.cep) if endereco and endereco.cep else "00000000",
                }

                base_numero = nota.numero_nota or str(nota_id)
                msg_payload = _montar_mensagem_payload(mensagem, base_numero, numero_os)

                for i in range(total_parcelas):
                    numero_parcela = i + 1
                    if data_vencimento_override:
                        data_venc = data_vencimento_override + timedelta(days=30 * i)
                    elif nota.data_vencimento < date.today():
                        data_venc = date.today() + timedelta(days=5) + timedelta(days=30 * i)
                    else:
                        data_venc = nota.data_vencimento + timedelta(days=30 * i)
                    valor = valor_ultima if numero_parcela == total_parcelas else valor_parcela

                    if total_parcelas > 1:
                        sufixo = f"-{numero_parcela}/{total_parcelas}"
                        base = base_numero[:15 - len(sufixo)]
                        seu_numero = (base + sufixo)[:15]
                    else:
                        seu_numero = base_numero[:15]

                    payload = {
                        "seuNumero": seu_numero,
                        "valorNominal": valor,
                        "dataVencimento": data_venc.strftime("%Y-%m-%d"),
                        "pagador": pagador,
                    }
                    if msg_payload:
                        payload["mensagem"] = msg_payload
                    payload.update(mora_payload)

                    resposta = inter_client.emitir_boleto(payload)

                    db_boleto = BoletoRepository.create(db, {
                        "nota_fiscal_id": nota_id,
                        "codigo_solicitacao": resposta.get("codigoSolicitacao"),
                        "nosso_numero": resposta.get("nossoNumero"),
                        "seu_numero": seu_numero,
                        "valor_nominal": valor,
                        "valor_juros": 0.0,
                        "valor_multa": 0.0,
                        "data_emissao": date.today(),
                        "data_vencimento": data_venc,
                        "situacao": SituacaoBoleto.EMABERTO,
                        "numero_parcela": numero_parcela,
                        "total_parcelas": total_parcelas,
                        "forma_pagamento": "BOLETO_INTER",
                    })

                    sucesso.append(BoletoResponse.model_validate(db_boleto))

            except Exception as e:
                erros.append({"nota_id": nota_id, "erro": str(e)})
                print(f"Erro ao gerar boleto para nota {nota_id}: {e}")

        return GerarBoletosResponse(sucesso=sucesso, erros=erros)

    @staticmethod
    def listar_boletos(db: Session) -> List[BoletoResponse]:
        boletos = BoletoRepository.get_all(db)
        return [BoletoResponse.model_validate(b) for b in boletos]

    @staticmethod
    def get_boletos_por_nota(db: Session, nota_fiscal_id: int) -> List[BoletoResponse]:
        boletos = BoletoRepository.get_all_by_nota_fiscal(db, nota_fiscal_id)
        return [BoletoResponse.model_validate(b) for b in boletos]

    @staticmethod
    def criar_boleto_manual(db: Session, req) -> BoletoResponse:
        """Cria um boleto sem chamar a API Inter (PIX, dinheiro, Itaú, etc.)."""
        nota = NotaFiscalRepository.get_by_id(db, req.nota_fiscal_id)
        if not nota:
            raise Exception("Nota fiscal não encontrada.")

        situacao = SituacaoBoleto.PAGO if req.ja_pago else SituacaoBoleto.EMABERTO
        data_pag = req.data_pagamento if req.ja_pago else None
        valor_rec = req.valor_recebido if req.ja_pago else None

        db_boleto = BoletoRepository.create(db, {
            "nota_fiscal_id": req.nota_fiscal_id,
            "numero_parcela": req.numero_parcela,
            "total_parcelas": req.total_parcelas,
            "valor_nominal": req.valor_nominal,
            "valor_juros": 0.0,
            "valor_multa": 0.0,
            "valor_total_recebido": valor_rec,
            "data_emissao": date.today(),
            "data_vencimento": req.data_vencimento,
            "data_pagamento": data_pag,
            "situacao": situacao,
            "forma_pagamento": req.forma_pagamento,
            "banco_pagamento": req.banco_pagamento,
            "observacao": req.observacao,
        })

        if req.ja_pago:
            _atualizar_data_pagamento_nota(db, req.nota_fiscal_id)

        return BoletoResponse.model_validate(db_boleto)

    @staticmethod
    def registrar_pagamento(db: Session, boleto_id: int, req) -> BoletoResponse:
        """Registra pagamento manual em um boleto existente."""
        db_boleto = BoletoRepository.get_by_id(db, boleto_id)
        if not db_boleto:
            raise Exception("Boleto não encontrado.")

        BoletoRepository.update(db, db_boleto, {
            "situacao": SituacaoBoleto.PAGO,
            "data_pagamento": req.data_pagamento,
            "valor_total_recebido": req.valor_recebido,
            "forma_pagamento": req.forma_pagamento,
            "banco_pagamento": req.banco_pagamento,
            "observacao": req.observacao,
        })

        if db_boleto.nota_fiscal_id:
            _atualizar_data_pagamento_nota(db, db_boleto.nota_fiscal_id)

        return BoletoResponse.model_validate(db_boleto)

    @staticmethod
    def gerar_parcelas_faltantes(
        db: Session,
        nota_id: int,
        valor_total_override: float = None,
        mensagem: str = None,
        pct_pis: float = None,
        pct_cofins: float = None,
        pct_inss: float = None,
        pct_csll: float = None,
        aplicar_juros: bool = None,
        taxa_juros: float = 1.0,
        data_vencimento_override: date = None,
        parcelas_selecionadas: list = None,
        imposto_config_vinculo: dict = None,
    ) -> GerarParcelasFaltantesResponse:
        """Gera apenas as parcelas que ainda não existem para uma nota parcelada."""
        from app.models.nota_fiscal_model import NotaFiscal as _NF
        nota = NotaFiscalRepository.get_by_id(db, nota_id)
        if not nota:
            return GerarParcelasFaltantesResponse(sucesso=[], erros=[{"nota_id": nota_id, "erro": "Nota não encontrada."}])

        # Persistir configuração de imposto do vínculo, se fornecida
        if imposto_config_vinculo is not None:
            db_nota_raw = db.query(_NF).filter(_NF.id == nota_id).first()
            if db_nota_raw:
                db_nota_raw.imposto_config_vinculo = imposto_config_vinculo
                db.flush()

        existentes = BoletoRepository.get_all_by_nota_fiscal(db, nota_id)
        total_parcelas = nota.parcelas if nota.parcelas and nota.parcelas > 0 else 1
        # Boletos cancelados/expirados não bloqueiam regeneração da parcela
        SITUACOES_INATIVAS = {SituacaoBoleto.CANCELADO, SituacaoBoleto.EXPIRADO}
        nums_existentes = {b.numero_parcela for b in existentes if b.situacao not in SITUACOES_INATIVAS}
        faltantes = [p for p in range(1, total_parcelas + 1) if p not in nums_existentes]

        # Filtra pelas parcelas selecionadas pelo usuário, se informado
        if parcelas_selecionadas:
            faltantes = [p for p in faltantes if p in parcelas_selecionadas]

        if not faltantes:
            return GerarParcelasFaltantesResponse(sucesso=[], erros=[{"nota_id": nota_id, "erro": "Todas as parcelas já foram geradas."}])

        if not nota.condominio_id:
            return GerarParcelasFaltantesResponse(sucesso=[], erros=[{"nota_id": nota_id, "erro": "Nota sem condomínio vinculado."}])

        condominio = nota.condominio
        if not condominio or not condominio.cnpj:
            return GerarParcelasFaltantesResponse(sucesso=[], erros=[{"nota_id": nota_id, "erro": "Condomínio sem CNPJ."}])

        endereco = EnderecoRepository.get_by_condominio(db, condominio.id)
        contato = ContatoRepository.get_principal(db, condominio.id)

        # OS vinculada para mensagem
        from app.models.servico_model import ManutencaoAssistencia as _MA
        servico_os = db.query(_MA).filter(_MA.nota_fiscal_id == nota_id).first()
        numero_os = (servico_os.numero_os if servico_os else None)

        pcts_override = {}
        if pct_pis    is not None: pcts_override['pct_pis']    = pct_pis
        if pct_cofins is not None: pcts_override['pct_cofins'] = pct_cofins
        if pct_inss   is not None: pcts_override['pct_inss']   = pct_inss
        if pct_csll   is not None: pcts_override['pct_csll']   = pct_csll

        usar_juros = aplicar_juros if aplicar_juros is not None else _aplicar_juros_default(nota)
        mora_payload = _montar_mora_multa(usar_juros, taxa_juros or 1.0)

        # Para notas vinculadas sem override explícito, calcular valor combinado
        # conforme a regra de imposto definida em imposto_config_vinculo
        if valor_total_override:
            valor_base = valor_total_override
        elif nota.nota_vinculada_id:
            parceira = db.query(_NF).filter(_NF.id == nota.nota_vinculada_id).first()
            cfg = imposto_config_vinculo or (nota.imposto_config_vinculo or {})
            regra = cfg.get("aplicar_imposto_em", "nota_a")
            if regra == "nota_a":
                valor_base = _calcular_valor_liquido(db, nota, pcts_override or None) + float(parceira.valor if parceira else 0)
            elif regra == "nota_b":
                valor_base = float(nota.valor) + _calcular_valor_liquido(db, parceira, pcts_override or None)
            elif regra == "ambas":
                valor_base = _calcular_valor_liquido(db, nota, pcts_override or None) + _calcular_valor_liquido(db, parceira, pcts_override or None)
            else:  # "nenhuma"
                valor_base = float(nota.valor) + float(parceira.valor if parceira else 0)
        else:
            valor_base = _calcular_valor_liquido(db, nota, pcts_override or None)
        valor_parcela = round(valor_base / total_parcelas, 2)
        valor_ultima = round(valor_base - valor_parcela * (total_parcelas - 1), 2)

        base_numero = nota.numero_nota or str(nota_id)
        msg_payload = _montar_mensagem_payload(mensagem, base_numero, numero_os)

        pagador = {
            "cpfCnpj": _limpar_cnpj(condominio.cnpj),
            "tipoPessoa": "JURIDICA",
            "nome": nota.cliente_nome or condominio.razao_social or condominio.nome,
            "email": (contato.email if contato else "") or "",
            "telefone": (contato.telefone if contato else "") or "",
            "endereco": (endereco.rua if endereco else None) or "Não informado",
            "numero": (endereco.numero if endereco else None) or "S/N",
            "bairro": (endereco.bairro if endereco else None) or "Não informado",
            "cidade": (endereco.cidade if endereco else None) or "Não informado",
            "uf": (endereco.estado if endereco else None) or "SP",
            "cep": _limpar_cnpj(endereco.cep) if endereco and endereco.cep else "00000000",
        }

        sucesso = []
        erros = []

        for numero_parcela in faltantes:
            try:
                data_base = data_vencimento_override or nota.data_vencimento
                data_venc = data_base + timedelta(days=30 * (numero_parcela - 1))
                data_inter = max(data_venc, date.today() + timedelta(days=5))
                valor = valor_ultima if numero_parcela == total_parcelas else valor_parcela

                sufixo = f"-{numero_parcela}/{total_parcelas}"
                base = base_numero[:15 - len(sufixo)]
                seu_numero = (base + sufixo)[:15]

                payload = {
                    "seuNumero": seu_numero,
                    "valorNominal": valor,
                    "dataVencimento": data_inter.strftime("%Y-%m-%d"),
                    "pagador": pagador,
                }
                if msg_payload:
                    payload["mensagem"] = msg_payload
                payload.update(mora_payload)

                resposta = inter_client.emitir_boleto(payload)

                db_boleto = BoletoRepository.create(db, {
                    "nota_fiscal_id": nota_id,
                    "codigo_solicitacao": resposta.get("codigoSolicitacao"),
                    "nosso_numero": resposta.get("nossoNumero"),
                    "seu_numero": seu_numero,
                    "valor_nominal": valor,
                    "valor_juros": 0.0,
                    "valor_multa": 0.0,
                    "data_emissao": date.today(),
                    "data_vencimento": data_inter,
                    "situacao": SituacaoBoleto.EMABERTO,
                    "numero_parcela": numero_parcela,
                    "total_parcelas": total_parcelas,
                    "forma_pagamento": "BOLETO_INTER",
                })

                sucesso.append(BoletoResponse.model_validate(db_boleto))
            except Exception as e:
                print(f"[BoletoService] ERRO parcela {numero_parcela} nota {nota_id}: {e}")
                erros.append({"nota_id": nota_id, "parcela": numero_parcela, "erro": str(e)})

        return GerarParcelasFaltantesResponse(sucesso=sucesso, erros=erros)

    @staticmethod
    def get_config_impostos(db: Session, nota_id: int) -> dict:
        """Retorna configuração de impostos e valor líquido calculado para uso no frontend (modal).
        Para notas vinculadas, inclui dados da nota parceira para o modal de aprovação.
        """
        from app.models.configuracao_impostos_model import ConfiguracaoImpostosServico, TipoServicoConfig
        from app.models.servico_model import ManutencaoAssistencia as _MA
        from app.models.nota_fiscal_model import NotaFiscal

        nota = NotaFiscalRepository.get_by_id(db, nota_id)
        if not nota:
            raise Exception("Nota não encontrada.")

        try:
            tipo_cfg = TipoServicoConfig(nota.tipo.value)
            config = db.query(ConfiguracaoImpostosServico).filter_by(tipo_servico=tipo_cfg, ativo=True).first()
        except Exception:
            config = None

        pct_pis    = float(config.pct_pis)    if config else 0.0
        pct_cofins = float(config.pct_cofins) if config else 0.0
        pct_inss   = float(config.pct_inss)   if config else 0.0
        pct_csll   = float(config.pct_csll)   if config else 0.0

        valor_liquido = _calcular_valor_liquido(db, nota)

        servico_os = db.query(_MA).filter(_MA.nota_fiscal_id == nota_id).first()
        numero_os = servico_os.numero_os if servico_os else None

        resultado = {
            "pct_pis":    pct_pis,
            "pct_cofins": pct_cofins,
            "pct_inss":   pct_inss,
            "pct_csll":   pct_csll,
            "valor_bruto":  float(nota.valor),
            "valor_liquido": valor_liquido,
            "numero_os": numero_os,
            "aplicar_juros_default": _aplicar_juros_default(nota),
            "alerta_impostos": bool(nota.alerta_impostos),
            "divergencia_impostos": nota.divergencia_impostos,
            "parcelas_json": nota.parcelas_json,
            "nota_vinculada_id": None,
            "nota_vinculada_numero": None,
            "valor_nota_vinculada": None,
        }

        # Se a nota tem vínculo, calcular valor combinado e incluir dados da parceira
        if nota.nota_vinculada_id:
            parceira = db.query(NotaFiscal).filter(NotaFiscal.id == nota.nota_vinculada_id).first()
            if parceira:
                liquido_parceira = _calcular_valor_liquido(db, parceira)
                resultado["nota_vinculada_id"]     = parceira.id
                resultado["nota_vinculada_numero"] = parceira.numero_nota
                resultado["valor_nota_vinculada"]  = float(parceira.valor)
                resultado["valor_bruto"]           = float(nota.valor) + float(parceira.valor)
                resultado["valor_liquido"]         = valor_liquido + liquido_parceira

        return resultado

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

                # dataPagamento pode estar no nível raiz ou dentro de dados["pagamento"]
                pag_obj = dados.get("pagamento") or {}
                if nova_situacao in (SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO):
                    print(f"[SyncStatus] Boleto {boleto.codigo_solicitacao} PAGO — resposta Inter: {dados}")
                data_pag_str = dados.get("dataPagamento") or pag_obj.get("dataPagamento")
                valor_rec = dados.get("valorTotalRecebido") or pag_obj.get("valorPago") or pag_obj.get("valorTotalRecebido")
                multa = dados.get("multa") or pag_obj.get("valorMulta")
                mora = dados.get("mora") or pag_obj.get("valorJurosMora")

                update = {"situacao": nova_situacao}
                if data_pag_str:
                    update["data_pagamento"] = date.fromisoformat(str(data_pag_str)[:10])
                if valor_rec:
                    update["valor_total_recebido"] = float(valor_rec)
                if multa:
                    update["valor_multa"] = float(multa)
                if mora:
                    update["valor_juros"] = float(mora)

                BoletoRepository.update(db, boleto, update)
                atualizados += 1
                if nova_situacao in (SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO) and boleto.nota_fiscal_id:
                    _atualizar_data_pagamento_nota(db, boleto.nota_fiscal_id)
            except Exception as e:
                erros.append({"codigo": boleto.codigo_solicitacao, "erro": str(e)})

        return SincronizarResponse(atualizados=atualizados, erros=erros)

    @staticmethod
    def sincronizar_do_inter(db: Session, data_inicio: str, data_fim: str) -> SincronizarInterResponse:
        criados = 0
        atualizados = 0
        sem_vinculo = 0
        erros = []
        sem_vinculo_lista = []

        try:
            cobrancas = inter_client.listar_cobrancas(data_inicio, data_fim)
        except Exception as e:
            return SincronizarInterResponse(criados=0, atualizados=0, sem_vinculo=0, erros=[{"erro": str(e)}])

        print(f"[SyncInter] Total retornado pelo Inter: {len(cobrancas)}")

        for item in cobrancas:
            try:
                cobranca = item.get("cobranca", item) if isinstance(item, dict) else item

                codigo = cobranca.get("codigoSolicitacao")
                seu_numero = "".join(c for c in cobranca.get("seuNumero", "") if c.isalnum())
                nova_situacao = _mapear_situacao(cobranca.get("situacao", "A_RECEBER"))

                # dataPagamento pode estar no nível raiz ou dentro de cobranca["pagamento"]
                pag_obj = cobranca.get("pagamento") or {}
                data_pag_str = cobranca.get("dataPagamento") or pag_obj.get("dataPagamento")
                valor_rec = cobranca.get("valorTotalRecebido") or pag_obj.get("valorPago") or pag_obj.get("valorTotalRecebido")
                multa = cobranca.get("multa") or pag_obj.get("valorMulta")
                mora = cobranca.get("mora") or pag_obj.get("valorJurosMora")

                update_data = {"situacao": nova_situacao}
                if data_pag_str:
                    update_data["data_pagamento"] = date.fromisoformat(str(data_pag_str)[:10])
                if valor_rec:
                    update_data["valor_total_recebido"] = float(valor_rec)
                if multa:
                    update_data["valor_multa"] = float(multa)
                if mora:
                    update_data["valor_juros"] = float(mora)

                # Verifica se já existe localmente pelo código
                existente = BoletoRepository.get_by_codigo(db, codigo) if codigo else None
                if existente:
                    BoletoRepository.update(db, existente, update_data)
                    atualizados += 1
                    if nova_situacao in (SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO) and existente.nota_fiscal_id:
                        _atualizar_data_pagamento_nota(db, existente.nota_fiscal_id)
                    continue

                # Busca nota com múltiplos fallbacks
                data_venc_inter  = cobranca.get("dataVencimento")
                valor_inter      = float(cobranca.get("valorNominal", 0)) or None
                cnpj_pagador     = (cobranca.get("pagador") or {}).get("cpfCnpj", "")
                nota, motivo = _buscar_nota(db, seu_numero, data_venc_inter, valor_inter, cnpj_pagador)

                if nota:
                    # Tenta encontrar o boleto específico por vencimento (parcela correta)
                    data_venc_date = date.fromisoformat(data_venc_inter) if data_venc_inter else None
                    boleto_da_nota = (
                        BoletoRepository.get_by_nota_and_vencimento(db, nota.id, data_venc_date)
                        if data_venc_date
                        else BoletoRepository.get_by_nota_fiscal(db, nota.id)
                    )
                    if boleto_da_nota:
                        BoletoRepository.update(db, boleto_da_nota, {
                            "codigo_solicitacao": codigo,
                            "nosso_numero": cobranca.get("nossoNumero") or boleto_da_nota.nosso_numero,
                            "seu_numero": seu_numero,
                            **update_data,
                        })
                        atualizados += 1
                        if nova_situacao in (SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO) and nota.id:
                            _atualizar_data_pagamento_nota(db, nota.id)
                    else:
                        # ── Validação 1: nota não pode ter mais boletos que parcelas ──
                        total_esperado = nota.parcelas if nota.parcelas and nota.parcelas > 0 else 1
                        existentes_na_nota = BoletoRepository.get_all_by_nota_fiscal(db, nota.id)
                        if len(existentes_na_nota) >= total_esperado:
                            print(
                                f"[SyncInter] SKIP nota #{nota.id} ({nota.numero_nota}): "
                                f"já tem {len(existentes_na_nota)}/{total_esperado} boleto(s). "
                                f"seuNumero={cobranca.get('seuNumero')} valor={cobranca.get('valorNominal')} "
                                f"motivo_match={motivo}"
                            )
                            sem_vinculo += 1
                            sem_vinculo_lista.append({
                                "seuNumero": cobranca.get("seuNumero", ""),
                                "codigo":    codigo or "",
                                "situacao":  cobranca.get("situacao", ""),
                                "valor":     cobranca.get("valorNominal", ""),
                                "vencimento": cobranca.get("dataVencimento", ""),
                                "pagamento": cobranca.get("dataPagamento") or "-",
                                "obs":       f"SKIP: nota #{nota.id} já completa ({len(existentes_na_nota)}/{total_esperado})",
                            })
                            continue

                        # ── Validação 2: valor do boleto deve ser compatível com nota ──
                        valor_boleto = float(cobranca.get("valorNominal", 0))
                        valor_esperado = float(nota.valor) / total_esperado
                        # Tolerância de 40%: cobre impostos retidos (~16%) + multas/juros + arredondamentos
                        tolerancia = float(nota.valor) * 0.40
                        if valor_boleto > 0 and abs(valor_boleto - valor_esperado) > tolerancia:
                            print(
                                f"[SyncInter] SKIP nota #{nota.id} ({nota.numero_nota}): "
                                f"valor incompatível — esperado≈{valor_esperado:.2f}, "
                                f"recebido={valor_boleto:.2f} (dif={abs(valor_boleto-valor_esperado):.2f} > tol={tolerancia:.2f}). "
                                f"motivo_match={motivo}"
                            )
                            sem_vinculo += 1
                            sem_vinculo_lista.append({
                                "seuNumero": cobranca.get("seuNumero", ""),
                                "codigo":    codigo or "",
                                "situacao":  cobranca.get("situacao", ""),
                                "valor":     cobranca.get("valorNominal", ""),
                                "vencimento": cobranca.get("dataVencimento", ""),
                                "pagamento": cobranca.get("dataPagamento") or "-",
                                "obs":       f"SKIP: valor {valor_boleto:.2f} incompatível com nota #{nota.id} (esperado≈{valor_esperado:.2f})",
                            })
                            continue

                        # Detecta número da parcela pelo seuNumero (ex: "7563-2/3")
                        numero_parcela = len(existentes_na_nota) + 1
                        total_parcelas_sync = total_esperado
                        if "-" in seu_numero and "/" in seu_numero:
                            try:
                                partes = seu_numero.rsplit("-", 1)[-1]
                                p, t = partes.split("/")
                                numero_parcela = int(p)
                                total_parcelas_sync = int(t)
                            except Exception:
                                pass

                        BoletoRepository.create(db, {
                            "nota_fiscal_id": nota.id,
                            "codigo_solicitacao": codigo,
                            "nosso_numero": cobranca.get("nossoNumero"),
                            "seu_numero": seu_numero,
                            "valor_nominal": valor_boleto,
                            "data_emissao": date.fromisoformat(cobranca["dataEmissao"]) if cobranca.get("dataEmissao") else date.today(),
                            "data_vencimento": data_venc_date or date.today(),
                            "numero_parcela": numero_parcela,
                            "total_parcelas": total_parcelas_sync,
                            **update_data,
                        })
                        criados += 1
                        if nova_situacao in (SituacaoBoleto.PAGO, SituacaoBoleto.BAIXADO):
                            _atualizar_data_pagamento_nota(db, nota.id)
                else:
                    sem_vinculo += 1
                    sem_vinculo_lista.append({
                        "seuNumero" : cobranca.get("seuNumero", ""),
                        "codigo"    : codigo or "",
                        "situacao"  : cobranca.get("situacao", ""),
                        "valor"     : cobranca.get("valorNominal", ""),
                        "vencimento": cobranca.get("dataVencimento", ""),
                        "pagamento" : cobranca.get("dataPagamento") or "-",
                    })

            except Exception as e:
                erros.append({"codigo": item.get("codigoSolicitacao") if isinstance(item, dict) else None, "erro": str(e)})

        # Resumo final no terminal
        print(f"[SyncInter] criados={criados}  atualizados={atualizados}  sem_vinculo={sem_vinculo}  erros={len(erros)}")

        if sem_vinculo_lista:
            W = (14, 38, 14, 10, 12, 12)
            header = (
                "seuNumero".ljust(W[0]),
                "codigoSolicitacao".ljust(W[1]),
                "situacao".ljust(W[2]),
                "valor".ljust(W[3]),
                "vencimento".ljust(W[4]),
                "pagamento".ljust(W[5]),
            )
            sep = "-" * (sum(W) + len(W) * 2)
            print(f"\n{'='*100}")
            print(f"[SyncInter] BOLETOS SEM VINCULO COM NOTA FISCAL ({len(sem_vinculo_lista)}):")
            print(sep)
            print("  ".join(header))
            print(sep)
            for b in sem_vinculo_lista:
                print("  ".join([
                    str(b["seuNumero"]).ljust(W[0]),
                    str(b["codigo"]).ljust(W[1]),
                    str(b["situacao"]).ljust(W[2]),
                    str(b["valor"]).ljust(W[3]),
                    str(b["vencimento"]).ljust(W[4]),
                    str(b["pagamento"]).ljust(W[5]),
                ]))
            print("=" * 100)

        return SincronizarInterResponse(criados=criados, atualizados=atualizados, sem_vinculo=sem_vinculo, erros=erros)

    @staticmethod
    def deletar_boleto(db: Session, boleto_id: int) -> None:
        db_boleto = BoletoRepository.get_by_id(db, boleto_id)
        if not db_boleto:
            raise Exception("Boleto não encontrado.")
        BoletoRepository.delete(db, db_boleto)

    @staticmethod
    def vincular_nota(db: Session, boleto_id: int, nota_fiscal_id: int) -> BoletoResponse:
        db_boleto = BoletoRepository.get_by_id(db, boleto_id)
        if not db_boleto:
            raise Exception("Boleto não encontrado.")
        nota = NFRepo.get_by_id(db, nota_fiscal_id)
        if not nota:
            raise Exception("Nota fiscal não encontrada.")
        BoletoRepository.update(db, db_boleto, {"nota_fiscal_id": nota_fiscal_id})
        return BoletoResponse.model_validate(db_boleto)

    @staticmethod
    def get_notas_sem_boleto(db: Session) -> List[NotaSemBoletoResponse]:
        from app.models.nota_fiscal_model import NotaFiscal, StatusNota
        from app.models.boleto_model import Boleto
        from sqlalchemy import not_, exists

        notas = (
            db.query(NotaFiscal)
            .filter(
                NotaFiscal.status != StatusNota.CANCELADA,
                not_(exists().where(Boleto.nota_fiscal_id == NotaFiscal.id)),
            )
            .order_by(NotaFiscal.data_vencimento)
            .all()
        )

        hoje = date.today()
        resultado = []
        for n in notas:
            dias = (hoje - n.data_vencimento).days if n.data_vencimento else 0
            cond_nome = n.condominio.nome if n.condominio else None
            resultado.append(NotaSemBoletoResponse(
                id=n.id,
                numero_nota=n.numero_nota or str(n.id),
                valor=float(n.valor),
                data_vencimento=n.data_vencimento,
                tipo=str(n.tipo.value) if n.tipo else "OUTROS",
                condominio_id=n.condominio_id,
                condominio_nome=cond_nome,
                dias_atraso=dias,
            ))
        return resultado

    @staticmethod
    def get_inconsistencias(db: Session) -> list:
        """
        Detecta boletos incorretamente vinculados a notas fiscais.
        Retorna lista de inconsistências com detalhes para correção.
        """
        from app.models.nota_fiscal_model import NotaFiscal

        todas_notas = db.query(NotaFiscal).all()
        resultado = []

        for nota in todas_notas:
            boletos = BoletoRepository.get_all_by_nota_fiscal(db, nota.id)
            if not boletos:
                continue

            total_esperado = nota.parcelas if nota.parcelas and nota.parcelas > 0 else 1
            valor_esperado_parcela = float(nota.valor) / total_esperado
            tolerancia = float(nota.valor) * 0.40

            problemas = []

            # Problema 1: mais boletos que parcelas
            if len(boletos) > total_esperado:
                problemas.append({
                    "tipo": "excesso_boletos",
                    "detalhe": f"{len(boletos)} boletos para nota com {total_esperado} parcela(s)",
                })

            # Problema 2: valor de algum boleto incompatível
            for b in boletos:
                if abs(b.valor_nominal - valor_esperado_parcela) > tolerancia:
                    problemas.append({
                        "tipo": "valor_incompativel",
                        "boleto_id": b.id,
                        "detalhe": (
                            f"Boleto #{b.id} valor={b.valor_nominal:.2f} "
                            f"muito diferente do esperado≈{valor_esperado_parcela:.2f}"
                        ),
                    })

            if problemas:
                cond_nome = nota.condominio.nome if nota.condominio else "Sem condomínio"
                resultado.append({
                    "nota_id": nota.id,
                    "nota_numero": nota.numero_nota,
                    "condominio": cond_nome,
                    "valor_nota": float(nota.valor),
                    "parcelas_nota": total_esperado,
                    "boletos_count": len(boletos),
                    "boletos": [
                        {
                            "id": b.id,
                            "valor_nominal": b.valor_nominal,
                            "data_vencimento": str(b.data_vencimento),
                            "situacao": b.situacao.value,
                            "seu_numero": b.seu_numero,
                            "codigo_solicitacao": b.codigo_solicitacao,
                        }
                        for b in boletos
                    ],
                    "problemas": problemas,
                })

        return resultado

    @staticmethod
    def get_stats(db: Session) -> BoletoStats:
        data = BoletoRepository.get_stats(db)
        return BoletoStats(**data)

    @staticmethod
    def preview_email_boleto(db: Session, boleto_id: int) -> str:
        """Retorna o HTML do email que seria enviado para o boleto (para preview no frontend)."""
        from app.services.email_service import gerar_html_boleto

        boleto = BoletoRepository.get_by_id(db, boleto_id)
        if not boleto:
            raise Exception("Boleto não encontrado.")

        nota = NotaFiscalRepository.get_by_id(db, boleto.nota_fiscal_id)
        if not nota:
            raise Exception("Nota fiscal não encontrada.")

        condominio = nota.condominio
        nome_condominio = (
            (condominio.razao_social or condominio.nome) if condominio else "Condomínio"
        )

        # Tenta obter linha digitável do Inter (sem lançar erro se falhar)
        linha_digitavel = None
        if boleto.codigo_solicitacao:
            try:
                detalhe = inter_client.consultar_boleto(boleto.codigo_solicitacao)
                linha_digitavel = (
                    detalhe.get("linhaDigitavel")
                    or detalhe.get("cobranca", {}).get("linhaDigitavel")
                )
            except Exception:
                pass

        return gerar_html_boleto(
            nome_condominio=nome_condominio,
            numero_nota=nota.numero_nota or str(nota.id),
            valor=boleto.valor_nominal,
            vencimento=boleto.data_vencimento,
            numero_parcela=boleto.numero_parcela,
            total_parcelas=boleto.total_parcelas,
            linha_digitavel=linha_digitavel,
        )

    @staticmethod
    def enviar_email_boleto(db: Session, boleto_id: int, destinatarios: List[str]) -> dict:
        """
        Baixa o PDF do boleto no Inter, busca o XML da nota e envia por email
        para a lista de destinatários informada.
        """
        from app.services.email_service import EmailService

        boleto = BoletoRepository.get_by_id(db, boleto_id)
        if not boleto:
            raise Exception("Boleto não encontrado.")
        if not boleto.codigo_solicitacao:
            raise Exception("Este boleto não possui código Inter para download de PDF.")

        nota = NotaFiscalRepository.get_by_id(db, boleto.nota_fiscal_id)
        if not nota:
            raise Exception("Nota fiscal não encontrada.")

        condominio = nota.condominio
        nome_condominio = (
            (condominio.razao_social or condominio.nome) if condominio else "Condomínio"
        )

        # Baixa PDF do boleto via Inter
        pdf_bytes = inter_client.baixar_pdf(boleto.codigo_solicitacao)

        # Tenta obter linha digitável consultando o Inter
        linha_digitavel = None
        try:
            detalhe = inter_client.consultar_boleto(boleto.codigo_solicitacao)
            linha_digitavel = (
                detalhe.get("linhaDigitavel")
                or detalhe.get("cobranca", {}).get("linhaDigitavel")
            )
        except Exception:
            pass

        # XML da nota como anexo (se disponível)
        xml_bytes = None
        xml_filename = None
        if nota.xml_original:
            xml_bytes = nota.xml_original.encode("utf-8") if isinstance(nota.xml_original, str) else nota.xml_original
            xml_filename = f"nota_{nota.numero_nota or nota.id}.xml"

        EmailService.enviar_boleto(
            destinatarios=destinatarios,
            boleto_pdf=pdf_bytes,
            codigo_boleto=boleto.codigo_solicitacao,
            numero_nota=nota.numero_nota or str(nota.id),
            nome_condominio=nome_condominio,
            valor=boleto.valor_nominal,
            vencimento=boleto.data_vencimento,
            numero_parcela=boleto.numero_parcela,
            total_parcelas=boleto.total_parcelas,
            linha_digitavel=linha_digitavel,
            xml_bytes=xml_bytes,
            xml_filename=xml_filename,
        )

        return {"enviado": True, "destinatarios": destinatarios, "boleto_id": boleto_id}
