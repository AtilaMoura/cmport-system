from pymysqlreplication import BinLogStreamReader
from pymysqlreplication.row_event import UpdateRowsEvent
from datetime import datetime
import pymysql

MYSQL_SETTINGS = {'host': '172.18.0.3', 'port': 3306, 'user': 'root', 'passwd': 'cmport2026'}
COLS_CONDOMINIOS = ['id','auvo_id','external_id','nome','cnpj','razao_social','observacao','ativo','criado_em','atualizado_em']
COLS_CONTATOS = ['id','condominio_id','nome','telefone','email','funcao','principal','receber_boleto','criado_em','atualizado_em']

def mapear(row_dict, cols):
    return {cols[i] if i < len(cols) else 'col'+str(i): v for i, v in enumerate(row_dict.values())}

stream = BinLogStreamReader(connection_settings=MYSQL_SETTINGS, server_id=100,
    log_file='binlog.000006', log_pos=708842,
    only_schemas=['cmport_gerenciamento'], only_tables=['condominios','contatos'],
    resume_stream=True, blocking=False)

estado_final_condo = {}
estado_final_contato = {}

for event in stream:
    ts = datetime.fromtimestamp(event.timestamp)
    if ts.date().isoformat() != '2026-05-28':
        continue
    if not isinstance(event, UpdateRowsEvent):
        continue
    cols = COLS_CONDOMINIOS if event.table == 'condominios' else COLS_CONTATOS
    alvo = estado_final_condo if event.table == 'condominios' else estado_final_contato
    for row in event.rows:
        after = mapear(row['after_values'], cols)
        rid = after['id']
        if rid not in alvo:
            alvo[rid] = {}
        for k, v in after.items():
            if k not in ('atualizado_em', 'criado_em'):
                alvo[rid][k] = v

stream.close()

conn = pymysql.connect(host='172.18.0.3', port=3306, user='root', password='cmport2026',
    db='cmport_gerenciamento', charset='utf8mb4')
cur = conn.cursor()

restaurados_condo = 0
for cid, campos in estado_final_condo.items():
    fields = [k for k in campos if k != 'id']
    if not fields:
        continue
    vals = [campos[k] for k in fields] + [cid]
    parts = ', '.join('`' + k + '` = %s' for k in fields)
    sql = 'UPDATE condominios SET ' + parts + ' WHERE id = %s'
    cur.execute(sql, vals)
    restaurados_condo += 1

restaurados_contato = 0
for cid, campos in estado_final_contato.items():
    fields = [k for k in campos if k != 'id']
    if not fields:
        continue
    vals = [campos[k] for k in fields] + [cid]
    parts = ', '.join('`' + k + '` = %s' for k in fields)
    sql = 'UPDATE contatos SET ' + parts + ' WHERE id = %s'
    cur.execute(sql, vals)
    restaurados_contato += 1

conn.commit()
cur.close()
conn.close()
print('Restaurados:', restaurados_condo, 'condominios,', restaurados_contato, 'contatos')
