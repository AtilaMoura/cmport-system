#!/bin/bash
cd /root/cmport-system
source .env.production
docker exec -i cmport_db mysql -u root -p"$DB_PASSWORD" cmport_gerenciamento -e 'SELECT COUNT(*) FROM notas_fiscais;'
