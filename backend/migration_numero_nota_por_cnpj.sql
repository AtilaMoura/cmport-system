-- Migration: permitir numero_nota repetido entre CNPJs emitentes diferentes
-- Antes: numero_nota era unico globalmente, bloqueando import de notas de
-- empresas diferentes (ex: CMPORT e CMPORT TEC) que coincidem no numero.
-- Executar no banco local (Adminer: http://localhost:8080) e na VPS

ALTER TABLE notas_fiscais
  DROP INDEX ix_notas_fiscais_numero_nota,
  ADD UNIQUE INDEX uq_notas_fiscais_numero_cnpj (numero_nota, cnpj_emitente);
