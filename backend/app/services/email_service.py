import base64
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Optional
from datetime import date

from app.core.config import settings

# Importação lazy para evitar ciclo (graph_email_service → msal → requests)
# O import real acontece dentro do método enviar_boleto quando necessário.

# Carrega a imagem de assinatura em base64 uma única vez ao importar o módulo
_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
_ASSINATURA_B64 = ""
try:
    _sig_path = os.path.join(_ASSETS_DIR, "logo_novo.jpg")
    with open(_sig_path, "rb") as _f:
        _ASSINATURA_B64 = base64.b64encode(_f.read()).decode()
except Exception:
    pass  # Assinatura não encontrada — rodapé ficará sem imagem


def valor_por_extenso(valor: float) -> str:
    """Retorna o valor em Reais por extenso (versão simplificada)."""
    from decimal import Decimal
    
    unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"]
    dezenas = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]
    especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"]
    centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"]
    
    def converter_bloco(n):
        if n == 0: return ""
        if n == 100: return "cem"
        res = []
        c, d, u = n // 100, (n % 100) // 10, n % 10
        if c > 0: res.append(centenas[c])
        if d == 1:
            res.append(especiais[u])
        else:
            if d > 1: res.append(dezenas[d])
            if u > 0: res.append(unidades[u])
        return " e ".join(res)

    v = Decimal(str(valor)).quantize(Decimal("0.00"))
    reais = int(v)
    centavos = int((v - reais) * 100)

    partes = []
    
    # Reais (até 999.999 — suficiente para CMPort)
    if reais == 0:
        partes.append("zero reais")
    else:
        milhares = reais // 1000
        resto = reais % 1000
        if milhares > 0:
            txt_mil = converter_bloco(milhares)
            partes.append(f"{txt_mil} mil" if milhares > 1 else "mil")
        if resto > 0:
            partes.append(converter_bloco(resto))
        partes.append("reais" if reais > 1 else "real")

    # Centavos
    if centavos > 0:
        partes.append("e")
        partes.append(converter_bloco(centavos))
        partes.append("centavos" if centavos > 1 else "centavo")

    return " ".join(p for p in partes if p).capitalize()


def gerar_html_boleto(
    nome_condominio: str,
    numero_nota: str,
    valor: float,
    vencimento,
    numero_parcela: int = 1,
    total_parcelas: int = 1,
    linha_digitavel: Optional[str] = None,
    dados_manutencao: Optional[dict] = None,
) -> str:
    """Gera e retorna o HTML do email de boleto (usado no preview)."""
    if dados_manutencao:
        return _html_manutencao(**dados_manutencao)
    
    return _html_boleto(
        nome_condominio=nome_condominio,
        numero_nota=numero_nota,
        valor=valor,
        vencimento=vencimento,
        numero_parcela=numero_parcela,
        total_parcelas=total_parcelas,
        linha_digitavel=linha_digitavel,
    )


def _fmt_valor(valor: float) -> str:
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_data(d) -> str:
    if isinstance(d, date):
        return d.strftime("%d/%m/%Y")
    return str(d)


_SAUDACAO_PADRAO = "Prezados(as),"
_RODAPE_PADRAO   = ("O boleto em PDF e a ordem de serviço estão anexados a este email.\n"
                    "Por gentileza, confirmar o recebimento deste e-mail.")


def _html_boleto(
    nome_condominio: str,
    numero_nota: str,
    valor: float,
    vencimento,
    numero_parcela: int,
    total_parcelas: int,
    linha_digitavel: Optional[str],
    saudacao: Optional[str] = None,
    corpo: Optional[str] = None,
    rodape: Optional[str] = None,
) -> str:
    parcela_txt = f"Parcela {numero_parcela}/{total_parcelas}" if total_parcelas > 1 else "À vista"

    _saudacao = (saudacao or _SAUDACAO_PADRAO).replace("\n", "<br>")
    _corpo = (corpo or (
        f"Segue em anexo o boleto e a ordem de serviço "
        f"referente à Nota Fiscal <strong>#{numero_nota}</strong> — "
        f"<strong>{nome_condominio}</strong>."
    )).replace("\n", "<br>")
    _rodape = (rodape or _RODAPE_PADRAO).replace("\n", "<br>")

    linha_bloco = ""
    if linha_digitavel:
        linha_bloco = (
            '<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">'
            '<span style="color:#64748b;font-size:13px;">Linha Digitável</span><br>'
            '<span style="font-family:monospace;font-size:15px;font-weight:700;'
            'letter-spacing:1px;color:#1e293b;word-break:break-all;">'
            f'{linha_digitavel}</span></td></tr>'
        )

    assinatura_bloco = ""
    if _ASSINATURA_B64:
        assinatura_bloco = (
            f'<img src="data:image/jpeg;base64,{_ASSINATURA_B64}" '
            'alt="Assinatura CM Port" '
            'style="max-width:150px;width:100%;height:auto;display:block;margin:0 auto;" />'
        )

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,.08);">

        <!-- Cabeçalho -->
        <tr>
          <td style="background:#1e40af;padding:32px 40px;text-align:center;">
            <p style="margin:0;color:#93c5fd;font-size:13px;font-weight:600;
                      text-transform:uppercase;letter-spacing:2px;">CMPort</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:800;">
              Boleto Disponível
            </h1>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 24px;color:#374151;font-size:15px;">
              {_saudacao}<br><br>{_corpo}
            </p>

            <!-- Tabela de dados -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-collapse:collapse;margin-bottom:24px;">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">Condomínio</span><br>
                  <span style="font-size:16px;font-weight:700;color:#1e293b;">{nome_condominio}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">Nota Fiscal</span><br>
                  <span style="font-size:16px;font-weight:700;color:#1e293b;">#{numero_nota}
                    &nbsp;<span style="font-size:13px;font-weight:400;color:#64748b;">
                      ({parcela_txt})</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">Valor do Boleto</span><br>
                  <span style="font-size:22px;font-weight:800;color:#1e40af;">
                    {_fmt_valor(valor)}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">Vencimento</span><br>
                  <span style="font-size:16px;font-weight:700;color:#dc2626;">
                    {_fmt_data(vencimento)}
                  </span>
                </td>
              </tr>
              {linha_bloco}
            </table>

            <p style="margin:0 0 8px;color:#64748b;font-size:13px;">
              {_rodape}
            </p>
          </td>
        </tr>

        <!-- Assinatura -->
        <tr>
          <td style="background:#f8fafc;padding:28px 40px;border-top:1px solid #e2e8f0;">
            {assinatura_bloco}
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _html_manutencao(
    saudacao: str,
    servico: str,
    nome_condominio: str,
    periodo: str,
    data_execucao: str,
    numero_os: str,
    quantidade_parcelas: str,
    valor_bruto: float,
    inss: float,
    cofins: float,
    pis: float,
    csll: float,
    valor_liquido: float,
    vencimento: str,
    descricao_servicos: str,
    titulo: str = "Cobrança de Manutenção Preventiva",
    email_financeiro: str = "financeiro@cmport.com.br",
    email_comercial: str = "comercial@cmport.com.br",
    corpo: str = None,
    rodape: str = None,
) -> str:
    """Template de email para Manutenção Preventiva e Serviços Prestados."""

    bruto_fmt = _fmt_valor(valor_bruto)
    bruto_extenso = valor_por_extenso(valor_bruto)
    liquido_fmt = _fmt_valor(valor_liquido)
    liquido_extenso = valor_por_extenso(valor_liquido)

    inss_fmt = _fmt_valor(inss or 0)
    cofins_fmt = _fmt_valor(cofins or 0)
    pis_fmt = _fmt_valor(pis or 0)
    csll_fmt = _fmt_valor(csll or 0)

    corpo_html = corpo.replace('\n', '<br>') if corpo else ''
    rodape_html = rodape.replace('\n', '<br>') if rodape else ''
    descricao_html = (descricao_servicos or '').replace('\n', '<br>')

    bloco_corpo = f"""
              <p style="margin:0 0 18px;color:#334155;font-size:15px;line-height:1.7;">{corpo_html}</p>
""" if corpo_html else ""

    bloco_rodape = f"""
              <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.7;">{rodape_html}</p>
""" if rodape_html else ""

    logo_url = f"data:image/jpeg;base64,{_ASSINATURA_B64}" if _ASSINATURA_B64 else ""
    assinatura_bloco = f"""<!-- ASSINATURA CM PORT -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td style="padding:0;margin:0;">
      <!-- faixa superior -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="height:10px;background-color:#1f4e79;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>

      <!-- corpo da assinatura -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr>
          <td align="center" valign="middle" style="padding:16px 20px;background-color:#ffffff;">
            <table cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
              <tr>
                <!-- coluna esquerda: logo -->
                <td valign="middle" align="center" style="width:38%;padding:6px 16px 6px 0;">
                  <img
                    src="{logo_url}"
                    alt="CM Port"
                    style="display:block;max-width:70px;width:100%;height:auto;border:0;outline:none;text-decoration:none;"
                  />
                </td>

                <!-- divisor -->
                <td valign="middle" style="width:2%;padding:0;">
                  <div style="width:3px;height:80px;background-color:#1f4e79;margin:0 auto;border-radius:2px;"></div>
                </td>

                <!-- coluna direita: dados -->
                <td valign="middle" style="width:60%;padding:6px 0 6px 16px;">
                  <div style="font-size:17px;line-height:1.2;font-weight:700;color:#1f4e79;letter-spacing:0.2px;">
                    Fabiana Pedretti
                  </div>

                  <div style="font-size:13px;line-height:1.3;color:#6a6a6a;font-weight:400;margin-top:4px;letter-spacing:0.2px;">
                    Gerente Comercial
                  </div>

                  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
                    <tr>
                      <td style="padding:3px 8px 3px 0;vertical-align:middle;">
                        <span style="font-size:13px;line-height:1;color:#6a6a6a;">✉</span>
                      </td>
                      <td style="padding:3px 0;vertical-align:middle;">
                        <span style="font-size:12px;line-height:1.3;color:#5b7690;">comercial@cmport.com.br</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:3px 8px 3px 0;vertical-align:middle;">
                        <span style="font-size:13px;line-height:1;color:#6a6a6a;">🌐</span>
                      </td>
                      <td style="padding:3px 0;vertical-align:middle;">
                        <span style="font-size:12px;line-height:1.3;color:#5b7690;">www.cmport.com.br</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:3px 8px 3px 0;vertical-align:middle;">
                        <span style="font-size:13px;line-height:1;color:#6a6a6a;">☎</span>
                      </td>
                      <td style="padding:3px 0;vertical-align:middle;">
                        <span style="font-size:12px;line-height:1.3;color:#5b7690;">(11) 94034-1682</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:3px 8px 3px 0;vertical-align:middle;">
                        <span style="font-size:13px;line-height:1;color:#6a6a6a;">☏</span>
                      </td>
                      <td style="padding:3px 0;vertical-align:middle;">
                        <span style="font-size:12px;line-height:1.3;color:#5b7690;">(11) 3998-1347</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- faixa inferior -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="height:10px;background-color:#1f4e79;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
</table>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">
          
          <!-- Cabeçalho -->
          <tr>
            <td style="background-color:#1e40af;padding:40px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">
                {titulo}
              </h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;font-weight:500;line-height:1.5;">
                Relatório, retenções e cobrança do serviço realizado
              </p>
            </td>
          </tr>

          <!-- Conteúdo -->
          <tr>
            <td style="padding:40px 40px 24px 40px;">
              <p style="margin:0 0 18px;color:#334155;font-size:16px;line-height:1.7;">
                {saudacao.replace('\\n', '<br>')}<br><br>
                Segue abaixo a cobrança referente à {servico.lower()}, conforme detalhamento:
              </p>
{bloco_corpo}
              <!-- Bloco principal -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Serviço</span>
                    <span style="color:#0f172a;font-size:16px;font-weight:700;">{servico}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Condomínio</span>
                    <span style="color:#0f172a;font-size:16px;font-weight:600;">{nome_condominio}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Período</span>
                    <span style="color:#0f172a;font-size:16px;font-weight:600;">{periodo}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Data de execução</span>
                    <span style="color:#0f172a;font-size:16px;font-weight:600;">{data_execucao}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Ordem de Serviço</span>
                    <span style="color:#0f172a;font-size:16px;font-weight:700;">{numero_os}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Quantidade de parcelas</span>
                    <span style="color:#0f172a;font-size:16px;font-weight:600;">{quantidade_parcelas}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Valor bruto</span>
                    <span style="color:#0f172a;font-size:18px;font-weight:800;">{bruto_fmt}</span>
                    <div style="margin-top:4px;color:#64748b;font-size:13px;line-height:1.5;">({bruto_extenso})</div>
                  </td>
                </tr>
              </table>

              <!-- Retenções -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;background-color:#f8fafc;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Retenções</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;color:#334155;font-size:15px;line-height:1.6;">INSS</td>
                        <td align="right" style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:700;">{inss_fmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#334155;font-size:15px;line-height:1.6;">COFINS</td>
                        <td align="right" style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:700;">{cofins_fmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#334155;font-size:15px;line-height:1.6;">PIS</td>
                        <td align="right" style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:700;">{pis_fmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#334155;font-size:15px;line-height:1.6;">CSLL</td>
                        <td align="right" style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:700;">{csll_fmt}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Valor líquido e vencimento -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #bfdbfe;">
                    <span style="display:block;color:#1d4ed8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Valor líquido do boleto</span>
                    <span style="color:#1e3a8a;font-size:22px;font-weight:900;">{liquido_fmt}</span>
                    <div style="margin-top:4px;color:#1d4ed8;font-size:13px;line-height:1.5;">({liquido_extenso})</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <span style="display:block;color:#1d4ed8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Vencimento</span>
                    <span style="color:#dc2626;font-size:18px;font-weight:800;">{vencimento}</span>
                  </td>
                </tr>
              </table>

              <!-- Descrição do serviço -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;background-color:#f8fafc;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Descrição dos serviços realizados</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0;color:#334155;font-size:15px;line-height:1.7;">{descricao_html}</p>
                  </td>
                </tr>
              </table>

              <!-- Atualização de e-mails -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #e2e8f0;background-color:#f8fafc;">
                    <span style="display:block;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Atualização de e-mails da empresa</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.7;">Informamos também que os e-mails da empresa foram atualizados:</p>
                    <p style="margin:0;color:#334155;font-size:15px;line-height:1.7;">
                      <strong>Financeiro:</strong> {email_financeiro}<br>
                      <strong>Comercial:</strong> {email_comercial}
                    </p>
                  </td>
                </tr>
              </table>

{bloco_rodape}
              <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.7;">
                Ficamos à disposição para quaisquer esclarecimentos.<br><br>
                Por gentileza, solicitamos a confirmação de recebimento deste e-mail.
              </p>
              <p style="margin:0;color:#334155;font-size:15px;line-height:1.7;">Atenciosamente,</p>
            </td>
          </tr>

          <!-- Rodapé / Assinatura -->
          <tr>
            <td style="background-color:#f8fafc;padding:0;border-top:1px solid #e2e8f0;text-align:center;">
              {assinatura_bloco}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


class EmailService:
    @staticmethod
    def enviar_boleto(
        destinatarios: List[str],
        boleto_pdf: bytes,
        codigo_boleto: str,
        numero_nota: str,
        nome_condominio: str,
        valor: float,
        vencimento,
        numero_parcela: int = 1,
        total_parcelas: int = 1,
        linha_digitavel: Optional[str] = None,
        xml_bytes: Optional[bytes] = None,
        xml_filename: Optional[str] = None,
        assunto_override: Optional[str] = None,
        saudacao: Optional[str] = None,
        corpo: Optional[str] = None,
        rodape: Optional[str] = None,
        anexos_extras: Optional[List[tuple]] = None,
        # Credenciais SMTP explícitas (legado — ignoradas quando db é fornecido)
        email_remetente: Optional[str] = None,
        senha_remetente: Optional[str] = None,
        from_name: Optional[str] = None,
        # Sessão DB: quando presente, detecta automaticamente SMTP vs Graph
        db=None,
        # Dados para template de manutenção
        dados_manutencao: Optional[dict] = None,
        # CC por envio (mesclado com CC global da ConfiguracaoEmpresa)
        cc_emails: Optional[List[str]] = None,
    ) -> None:
        """
        Envia email com boleto (PDF + XML + anexos extras).
        Quando `db` é fornecido, usa a conta ativa do banco (SMTP ou Graph API).
        Sem `db`, usa SMTP com as credenciais explícitas ou o fallback do .env.
        """
        if not destinatarios:
            raise Exception("Nenhum destinatário informado.")

        # Mescla CC por envio com CC global da empresa
        import json as _json
        cc_final: List[str] = list(cc_emails or [])
        if db is not None:
            try:
                from app.models.configuracao_model import ConfiguracaoEmpresa as _Empresa
                _empresa = db.query(_Empresa).first()
                if _empresa and _empresa.emails_copia:
                    cc_global = _json.loads(_empresa.emails_copia)
                    cc_final = list(set(cc_final + cc_global))
            except Exception:
                pass

        if not assunto_override and dados_manutencao:
            _serv = dados_manutencao.get("servico", "Manutenção Preventiva")
            assunto = f"{nome_condominio} - {_serv}"
        else:
            assunto = assunto_override or f"Boleto #{numero_nota} — {nome_condominio} — Venc. {_fmt_data(vencimento)}"

        # Monta lista de todos os anexos para ambos os fluxos
        todos_anexos: List[tuple] = []
        todos_anexos.append((f"boleto_{codigo_boleto}.pdf", boleto_pdf, "application/pdf"))
        if xml_bytes and xml_filename:
            todos_anexos.append((xml_filename, xml_bytes, "application/xml"))
        for item in (anexos_extras or []):
            todos_anexos.append(item)

        # Gera HTML do email
        if dados_manutencao:
            html = _html_manutencao(**dados_manutencao, corpo=corpo, rodape=rodape)
        else:
            html = _html_boleto(
                nome_condominio=nome_condominio,
                numero_nota=numero_nota,
                valor=valor,
                vencimento=vencimento,
                numero_parcela=numero_parcela,
                total_parcelas=total_parcelas,
                linha_digitavel=linha_digitavel,
                saudacao=saudacao,
                corpo=corpo,
                rodape=rodape,
            )

        # ── Detecta conta ativa ───────────────────────────────────────────────
        if db is not None:
            from app.services.configuracao_service import get_config_ativa
            cfg = get_config_ativa(db)

            if cfg["tipo"] == "GRAPH_API":
                EmailService._enviar_graph(
                    sender_email=cfg["email"],
                    destinatarios=destinatarios,
                    assunto=assunto,
                    corpo_html=html,
                    from_name=cfg.get("from_name"),
                    graph_client_id=cfg["graph_client_id"],
                    graph_tenant_id=cfg["graph_tenant_id"],
                    graph_client_secret=cfg["graph_client_secret"],
                    todos_anexos=todos_anexos,
                    cc_emails=cc_final,
                )
                return

            # SMTP via DB
            email_remetente = cfg["email"]
            senha_remetente = cfg["senha"]
            from_name       = cfg.get("from_name") or from_name

        # ── Fluxo SMTP ────────────────────────────────────────────────────────
        _email = email_remetente or settings.OUTLOOK_EMAIL
        _senha = senha_remetente or settings.OUTLOOK_PASSWORD
        _from  = from_name or settings.EMAIL_FROM_NAME

        if not _email or not _senha:
            raise Exception("Nenhuma conta de email configurada. Acesse Configurações → Email.")

        msg = MIMEMultipart("mixed")
        msg["From"]    = f"{_from} <{_email}>"
        msg["To"]      = ", ".join(destinatarios)
        msg["Subject"] = assunto
        if cc_final:
            msg["Cc"] = ", ".join(cc_final)
        msg.attach(MIMEText(html, "html", "utf-8"))

        for (filename, conteudo, content_type) in todos_anexos:
            tipo_principal, subtipo = (content_type or "application/octet-stream").split("/", 1)
            parte = MIMEBase(tipo_principal, subtipo)
            parte.set_payload(conteudo)
            encoders.encode_base64(parte)
            parte.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(parte)

        context = ssl.create_default_context()
        with smtplib.SMTP("smtp.office365.com", 587, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(_email, _senha)
            todos_dest = destinatarios + cc_final
            smtp.sendmail(_email, todos_dest, msg.as_bytes())

    @staticmethod
    def _enviar_graph(
        sender_email: str,
        destinatarios: List[str],
        assunto: str,
        corpo_html: str,
        from_name: Optional[str],
        graph_client_id: str,
        graph_tenant_id: str,
        graph_client_secret: str,
        todos_anexos: List[tuple],
        cc_emails: Optional[List[str]] = None,
    ) -> None:
        if not graph_client_id or not graph_tenant_id or not graph_client_secret:
            raise Exception("Credenciais Graph API incompletas. Verifique Configurações → Email.")

        from app.services.graph_email_service import GraphEmailService
        token = GraphEmailService.obter_token(graph_client_id, graph_client_secret, graph_tenant_id)
        GraphEmailService.enviar(
            sender_email=sender_email,
            destinatarios=destinatarios,
            assunto=assunto,
            corpo_html=corpo_html,
            token=token,
            from_name=from_name,
            anexos_extras=todos_anexos,
            cc_emails=cc_emails,
        )
