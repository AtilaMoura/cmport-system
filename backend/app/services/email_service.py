import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Optional
from datetime import date

from app.core.config import settings


def _fmt_valor(valor: float) -> str:
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_data(d) -> str:
    if isinstance(d, date):
        return d.strftime("%d/%m/%Y")
    return str(d)


def _html_boleto(
    nome_condominio: str,
    numero_nota: str,
    valor: float,
    vencimento,
    numero_parcela: int,
    total_parcelas: int,
    linha_digitavel: Optional[str],
) -> str:
    parcela_txt = f"Parcela {numero_parcela}/{total_parcelas}" if total_parcelas > 1 else "À vista"
    linha_bloco = ""
    if linha_digitavel:
        linha_bloco = f"""
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
            <span style="color:#64748b;font-size:13px;">Linha Digitável</span><br>
            <span style="font-family:monospace;font-size:15px;font-weight:700;
                         letter-spacing:1px;color:#1e293b;word-break:break-all;">
              {linha_digitavel}
            </span>
          </td>
        </tr>"""

    return f"""
<!DOCTYPE html>
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
              Olá, <strong>{nome_condominio}</strong>.<br>
              Segue o boleto referente à Nota Fiscal <strong>#{numero_nota}</strong>.
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
                  <span style="color:#64748b;font-size:13px;">Valor</span><br>
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
              O boleto em PDF está anexado a este email.<br>
              Em caso de dúvidas, entre em contato conosco.
            </p>
          </td>
        </tr>

        <!-- Rodapé -->
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;text-align:center;
                     border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              CMPort — Sistema de Gestão de Condomínios<br>
              Este é um email automático, por favor não responda diretamente.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
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
    ) -> None:
        """
        Envia email com boleto em PDF + XML da nota para a lista de destinatários.
        Usa Outlook SMTP (smtp.office365.com:587 com STARTTLS).
        """
        if not settings.OUTLOOK_EMAIL or not settings.OUTLOOK_PASSWORD:
            raise Exception("Configurações de email não definidas (OUTLOOK_EMAIL / OUTLOOK_PASSWORD).")

        if not destinatarios:
            raise Exception("Nenhum destinatário informado.")

        assunto = f"Boleto #{numero_nota} — {nome_condominio} — Venc. {_fmt_data(vencimento)}"

        msg = MIMEMultipart("mixed")
        msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.OUTLOOK_EMAIL}>"
        msg["To"] = ", ".join(destinatarios)
        msg["Subject"] = assunto

        # Corpo HTML
        html = _html_boleto(
            nome_condominio=nome_condominio,
            numero_nota=numero_nota,
            valor=valor,
            vencimento=vencimento,
            numero_parcela=numero_parcela,
            total_parcelas=total_parcelas,
            linha_digitavel=linha_digitavel,
        )
        msg.attach(MIMEText(html, "html", "utf-8"))

        # Anexo: PDF do boleto
        pdf_part = MIMEBase("application", "pdf")
        pdf_part.set_payload(boleto_pdf)
        encoders.encode_base64(pdf_part)
        pdf_part.add_header(
            "Content-Disposition",
            "attachment",
            filename=f"boleto_{codigo_boleto}.pdf",
        )
        msg.attach(pdf_part)

        # Anexo: XML da nota (se disponível)
        if xml_bytes and xml_filename:
            xml_part = MIMEBase("application", "xml")
            xml_part.set_payload(xml_bytes)
            encoders.encode_base64(xml_part)
            xml_part.add_header(
                "Content-Disposition",
                "attachment",
                filename=xml_filename,
            )
            msg.attach(xml_part)

        # Envio via Outlook SMTP com STARTTLS
        context = ssl.create_default_context()
        with smtplib.SMTP("smtp.office365.com", 587, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(settings.OUTLOOK_EMAIL, settings.OUTLOOK_PASSWORD)
            smtp.sendmail(settings.OUTLOOK_EMAIL, destinatarios, msg.as_bytes())
