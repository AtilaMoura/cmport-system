-- Migration: adicionar nota_produto_id e numero_nf_produto ao corpo da nota
-- Executar no banco local (Adminer: http://localhost:8080) e na VPS

ALTER TABLE corpos_nota
  ADD COLUMN nota_produto_id INT NULL AFTER nota_fiscal_id,
  ADD COLUMN numero_nf_produto INT NULL AFTER numero_nf,
  ADD INDEX ix_corpo_nota_produto_id (nota_produto_id),
  ADD CONSTRAINT fk_corpo_nota_produto
    FOREIGN KEY (nota_produto_id) REFERENCES notas_fiscais(id) ON DELETE SET NULL;
