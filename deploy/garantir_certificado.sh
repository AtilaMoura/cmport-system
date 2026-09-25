#!/bin/bash
# garantir_certificado.sh — garante o certificado HTTPS do dash.cmport.com.br.
#
# Roda no deploy ANTES do `docker compose up`: o nginx.conf escuta 443 com o
# certificado do Let's Encrypt e, se o arquivo não existir, o nginx não sobe
# (site inteiro fora). Aqui: se faltar, emite pelo webroot (o nginx que está
# rodando já serve /.well-known/acme-challenge/); se a emissão falhar, aborta o
# deploy com o nginx antigo ainda no ar.
#
# Também instala o hook que recarrega o nginx quando o certbot.timer do host
# renova o certificado (a cada ~60 dias). Idempotente — pode rodar em todo deploy.
#
# Uso (na VPS, em /root/cmport-system): bash deploy/garantir_certificado.sh

set -euo pipefail

DOMINIO="dash.cmport.com.br"
WEBROOT="/var/www/certbot"
CERT="/etc/letsencrypt/live/${DOMINIO}/fullchain.pem"
HOOK="/etc/letsencrypt/renewal-hooks/deploy/recarregar-nginx.sh"

mkdir -p "$WEBROOT"

if [ -f "$CERT" ]; then
    echo "==> Certificado de ${DOMINIO} presente (vence: $(openssl x509 -in "$CERT" -noout -enddate | cut -d= -f2))"
else
    echo "==> Certificado de ${DOMINIO} ausente, emitindo via webroot..."
    # Conta ACME já existe em /etc/letsencrypt/accounts — sem email
    certbot certonly --webroot -w "$WEBROOT" -d "$DOMINIO" \
        --non-interactive --agree-tos --register-unsafely-without-email \
        || { echo "==> ERRO: falha ao emitir certificado — deploy abortado (nginx antigo segue no ar)"; exit 1; }
fi

# Renovação: recarrega o nginx pra ele pegar o certificado novo
mkdir -p "$(dirname "$HOOK")"
cat > "$HOOK" <<'EOF'
#!/bin/sh
# Instalado por deploy/garantir_certificado.sh — recarrega o nginx após renovação
docker exec cmport_nginx nginx -s reload
EOF
chmod +x "$HOOK"
