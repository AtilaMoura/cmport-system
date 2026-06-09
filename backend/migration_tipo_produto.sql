-- Migration: OUTROS → PRODUTO no enum TipoNota de notas_fiscais
-- Executar na ordem: UPDATE primeiro, depois ALTER TABLE

-- 1. Atualizar registros existentes (OUTROS → PRODUTO)
UPDATE notas_fiscais SET tipo = 'PRODUTO' WHERE tipo = 'OUTROS';

-- 2. Alterar o enum da coluna (remove OUTROS, adiciona PRODUTO)
ALTER TABLE notas_fiscais
  MODIFY COLUMN tipo ENUM('ASSISTENCIA', 'MANUTENCAO', 'PRODUTO') NOT NULL DEFAULT 'PRODUTO';

-- 3. Corrigir conta Inter que emite NF de produto (ajuste o id conforme o ambiente)
UPDATE configuracao_inter SET tipo_nota = 'PRODUTO' WHERE id = 2;
