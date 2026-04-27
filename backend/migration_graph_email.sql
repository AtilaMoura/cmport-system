-- Migration: adiciona suporte a Graph API na tabela configuracao_email
-- Rodar uma vez no banco de desenvolvimento e produção

ALTER TABLE configuracao_email
  MODIFY COLUMN senha_enc TEXT NULL,
  ADD COLUMN IF NOT EXISTS tipo             VARCHAR(20) NOT NULL DEFAULT 'SMTP' AFTER email,
  ADD COLUMN IF NOT EXISTS graph_client_id  VARCHAR(200)         DEFAULT NULL   AFTER senha_enc,
  ADD COLUMN IF NOT EXISTS graph_tenant_id  VARCHAR(200)         DEFAULT NULL   AFTER graph_client_id,
  ADD COLUMN IF NOT EXISTS graph_secret_enc TEXT                 DEFAULT NULL   AFTER graph_tenant_id;

-- Garante que registros existentes ficam com tipo SMTP
UPDATE configuracao_email SET tipo = 'SMTP' WHERE tipo IS NULL OR tipo = '';
