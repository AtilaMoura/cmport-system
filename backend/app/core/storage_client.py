import boto3
from botocore.client import Config
import logging

logger = logging.getLogger(__name__)

class StorageClient:
    def __init__(
        self,
        endpoint_url: str,
        access_key: str,
        secret_key: str,
        region_name: str = "us-east-1"
    ):
        self.client = boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region_name,
            config=Config(signature_version='s3v4')
        )

    def ensure_bucket_exists(self, bucket: str):
        """Garante que o bucket existe no storage."""
        try:
            self.client.head_bucket(Bucket=bucket)
        except Exception:
            try:
                # Para S3/R2/MinIO, create_bucket pode variar se for us-east-1 ou não
                # mas MinIO e R2 aceitam o padrão.
                self.client.create_bucket(Bucket=bucket)
                logger.info(f"Bucket '{bucket}' criado ou verificado com sucesso.")
            except Exception as e:
                logger.warning(f"Aviso ao verificar/criar bucket '{bucket}': {e}")

    def upload(self, bucket: str, key: str, data: bytes, content_type: str = "application/pdf"):
        """Faz upload de um arquivo para o storage."""
        try:
            self.client.put_object(
                Bucket=bucket,
                Key=key,
                Body=data,
                ContentType=content_type
            )
            return key
        except Exception as e:
            logger.error(f"Erro no upload para storage: {e}")
            raise e

    def download(self, bucket: str, key: str) -> bytes:
        """Faz download de um arquivo do storage."""
        try:
            response = self.client.get_object(Bucket=bucket, Key=key)
            return response['Body'].read()
        except Exception as e:
            logger.error(f"Erro no download do storage: {e}")
            raise e

    def delete(self, bucket: str, key: str):
        """Remove um arquivo do storage."""
        try:
            self.client.delete_object(Bucket=bucket, Key=key)
        except Exception as e:
            logger.error(f"Erro ao deletar do storage: {e}")
            raise e

    def get_presigned_url(self, bucket: str, key: str, expiry_seconds: int = 900) -> str:
        """Gera uma URL assinada para visualização temporária."""
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': key},
                ExpiresIn=expiry_seconds
            )
            return url
        except Exception as e:
            logger.error(f"Erro ao gerar URL assinada: {e}")
            raise e
