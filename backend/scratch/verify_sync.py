import sys
import os
from datetime import datetime, timedelta

# Adiciona o diretório atual ao sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from app.core.database import SessionLocal, Base, engine
# Importar todos os modelos para registrar no Base
import app.models.condominio_model
import app.models.endereco_model
import app.models.contato_model
import app.models.servico_model
import app.models.nota_fiscal_model
import app.models.exclusao_model
import app.models.boleto_model
import app.models.configuracao_impostos_model
import app.models.usuario_model
import app.models.configuracao_model
import app.models.ordem_servico_model
import app.models.produto_model
import app.models.orcamento_model

from app.services.orcamento_service import OrcamentoService

def verify():
    db = SessionLocal()
    try:
        # Período de teste: últimos 30 dias
        date_end = datetime.now().strftime('%Y-%m-%d')
        date_start = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        print(f"Iniciando sincronização de {date_start} até {date_end}...")
        resultado = OrcamentoService.sincronizar(db, date_start, date_end)
        print(f"Resultado: {resultado}")
        
        # Verificar se salvou algo
        from app.models.orcamento_model import Orcamento
        count = db.query(Orcamento).count()
        print(f"Total de orçamentos no banco local: {count}")
        
    except Exception as e:
        print(f"ERRO: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    verify()
