from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session


@dataclass
class ImpostosCalculados:
    percentual_inss: float
    percentual_cofins: float
    percentual_pis: float
    percentual_csll: float
    valor_inss: float
    valor_cofins: float
    valor_pis: float
    valor_csll: float
    valor_liquido: float


class ImpostoService:
    """Único ponto de cálculo de impostos para MANUTENCAO/ASSISTENCIA.

    Centraliza a lógica que antes estava duplicada em boleto_service.
    """

    @staticmethod
    def calcular_impostos(
        db: Session,
        valor_bruto: float,
        tipo_servico_str: str = "MANUTENCAO",
        percentuais_override: Optional[dict] = None,
    ) -> ImpostosCalculados:
        """
        Calcula impostos sobre valor_bruto.

        percentuais_override: dict com chaves opcionais pct_pis, pct_cofins, pct_inss, pct_csll.
        Se fornecido, usa esses valores em vez da tabela configuracao_impostos_servico.
        """
        from app.models.configuracao_impostos_model import ConfiguracaoImpostosServico, TipoServicoConfig

        pct_inss = pct_cofins = pct_pis = pct_csll = 0.0

        if percentuais_override:
            pct_pis    = float(percentuais_override.get("pct_pis", 0) or 0)
            pct_cofins = float(percentuais_override.get("pct_cofins", 0) or 0)
            pct_inss   = float(percentuais_override.get("pct_inss", 0) or 0)
            pct_csll   = float(percentuais_override.get("pct_csll", 0) or 0)
        else:
            try:
                tipo_cfg = TipoServicoConfig(tipo_servico_str)
                config = db.query(ConfiguracaoImpostosServico).filter_by(
                    tipo_servico=tipo_cfg, ativo=True
                ).first()
                if config:
                    pct_pis    = float(config.pct_pis)
                    pct_cofins = float(config.pct_cofins)
                    pct_inss   = float(config.pct_inss)
                    pct_csll   = float(config.pct_csll)
            except Exception:
                pass

        v = float(valor_bruto)
        v_inss   = round(v * (pct_inss   / 100), 2)
        v_cofins = round(v * (pct_cofins / 100), 2)
        v_pis    = round(v * (pct_pis    / 100), 2)
        v_csll   = round(v * (pct_csll   / 100), 2)
        liquido  = max(round(v - (v_inss + v_cofins + v_pis + v_csll), 2), 0.01)

        return ImpostosCalculados(
            percentual_inss=pct_inss,
            percentual_cofins=pct_cofins,
            percentual_pis=pct_pis,
            percentual_csll=pct_csll,
            valor_inss=v_inss,
            valor_cofins=v_cofins,
            valor_pis=v_pis,
            valor_csll=v_csll,
            valor_liquido=liquido,
        )
