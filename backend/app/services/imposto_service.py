from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_DOWN
from typing import Optional
from sqlalchemy.orm import Session


@dataclass
class ImpostosCalculados:
    percentual_inss: float
    percentual_cofins: float
    percentual_pis: float
    percentual_csll: float
    percentual_iss: float
    valor_inss: float
    valor_cofins: float
    valor_pis: float
    valor_csll: float
    valor_iss: float
    valor_liquido: float


class ImpostoService:

    @staticmethod
    def calcular_impostos(
        db: Session,
        valor_bruto: float,
        tipo_servico_str: str = "MANUTENCAO",
        percentuais_override: Optional[dict] = None,
    ) -> ImpostosCalculados:
        """
        Calcula impostos sobre valor_bruto.

        percentuais_override: dict com chaves opcionais pct_pis, pct_cofins, pct_inss, pct_csll, pct_iss.
        """
        from app.models.configuracao_impostos_model import ConfiguracaoImpostosServico, TipoServicoConfig

        pct_inss = pct_cofins = pct_pis = pct_csll = pct_iss = 0.0

        if percentuais_override:
            pct_pis    = float(percentuais_override.get("pct_pis", 0) or 0)
            pct_cofins = float(percentuais_override.get("pct_cofins", 0) or 0)
            pct_inss   = float(percentuais_override.get("pct_inss", 0) or 0)
            pct_csll   = float(percentuais_override.get("pct_csll", 0) or 0)
            pct_iss    = float(percentuais_override.get("pct_iss", 0) or 0)
        else:
            try:
                # SERVICO (corpo de nota) usa as mesmas alíquotas de ASSISTENCIA
                _mapa = {"SERVICO": "ASSISTENCIA", "PRODUTO": "OUTROS"}
                tipo_cfg = TipoServicoConfig(_mapa.get(tipo_servico_str, tipo_servico_str))
                config = db.query(ConfiguracaoImpostosServico).filter_by(
                    tipo_servico=tipo_cfg, ativo=True
                ).first()
                if config:
                    pct_pis    = float(config.pct_pis)
                    pct_cofins = float(config.pct_cofins)
                    pct_inss   = float(config.pct_inss)
                    pct_csll   = float(config.pct_csll)
                    pct_iss    = float(getattr(config, "pct_iss", 0) or 0)
            except Exception:
                pass

        def _truncar(base: float, pct: float) -> float:
            """Arredondamento fiscal BR (ROUND_HALF_DOWN): sobe quando 3º decimal >= 5,
            exceto empate exato em .5 que vai para baixo."""
            if not pct:
                return 0.0
            resultado = Decimal(str(base)) * Decimal(str(pct)) / Decimal('100')
            return float(resultado.quantize(Decimal('0.01'), rounding=ROUND_HALF_DOWN))

        v = float(valor_bruto)
        v_inss   = _truncar(v, pct_inss)
        v_cofins = _truncar(v, pct_cofins)
        v_pis    = _truncar(v, pct_pis)
        v_csll   = _truncar(v, pct_csll)
        v_iss    = _truncar(v, pct_iss)
        liquido  = max(round(v - (v_inss + v_cofins + v_pis + v_csll + v_iss), 2), 0.01)

        return ImpostosCalculados(
            percentual_inss=pct_inss,
            percentual_cofins=pct_cofins,
            percentual_pis=pct_pis,
            percentual_csll=pct_csll,
            percentual_iss=pct_iss,
            valor_inss=v_inss,
            valor_cofins=v_cofins,
            valor_pis=v_pis,
            valor_csll=v_csll,
            valor_iss=v_iss,
            valor_liquido=liquido,
        )
