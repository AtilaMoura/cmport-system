import smtplib
import ssl
import os
from dotenv import load_dotenv

# Carrega o arquivo .env
load_dotenv()

email = os.getenv("OUTLOOK_EMAIL")
senha = os.getenv("OUTLOOK_PASSWORD")
from_name = os.getenv("EMAIL_FROM_NAME")

print(f"Tentando conectar ao SMTP com: {email}")

context = ssl.create_default_context()
try:
    with smtplib.SMTP("smtp.office365.com", 587, timeout=30) as smtp:
        print("Conectado ao servidor. Enviando EHLO...")
        smtp.ehlo()
        print("Iniciando STARTTLS...")
        smtp.starttls(context=context)
        smtp.ehlo()
        print("Tentando login...")
        smtp.login(email, senha)
        print("Login realizado com sucesso!")
        
        # Opcional: enviar um email de teste real
        # destinatario = email
        # assunto = "Teste de Conexão SMTP - CMPort"
        # corpo = "Este é um e-mail de teste para validar as configurações de SMTP."
        # msg = f"Subject: {assunto}\n\n{corpo}"
        # smtp.sendmail(email, [destinatario], msg.encode('utf-8'))
        # print(f"Email de teste enviado para {destinatario}")

except Exception as e:
    print(f"ERRO ao testar SMTP: {e}")
