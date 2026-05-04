import sys
import os

# Adiciona o diretório backend ao path para importar app
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.core.storage_client import StorageClient
from app.core.config import settings

def test_storage():
    print("Iniciando teste de storage...")
    client = StorageClient(
        endpoint_url=settings.STORAGE_ENDPOINT,
        access_key=settings.STORAGE_ACCESS_KEY,
        secret_key=settings.STORAGE_SECRET_KEY,
        region_name=settings.STORAGE_REGION
    )
    
    bucket = settings.STORAGE_BUCKET
    print(f"Tentando conectar ao MinIO em {settings.STORAGE_ENDPOINT}...")
    
    try:
        client.ensure_bucket_exists(bucket)
        print(f"Bucket {bucket} verificado/criado.")
        
        test_data = b"Hello CMPort Storage"
        test_key = "test/hello.txt"
        
        print(f"Fazendo upload de {test_key}...")
        client.upload(bucket, test_key, test_data, content_type="text/plain")
        
        print(f"Fazendo download de {test_key}...")
        downloaded = client.download(bucket, test_key)
        assert downloaded == test_data
        print("Download bem sucedido e dados conferem!")
        
        print("Gerando URL assinada...")
        url = client.get_presigned_url(bucket, test_key)
        print(f"URL: {url}")
        
        print(f"Deletando {test_key}...")
        client.delete(bucket, test_key)
        print("Teste concluído com sucesso!")
        
    except Exception as e:
        print(f"Erro durante o teste: {e}")
        print("Dica: O MinIO está rodando? (docker compose up -d minio)")

if __name__ == "__main__":
    test_storage()
