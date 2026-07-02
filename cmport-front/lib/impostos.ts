// lib/impostos.ts
// Replica o arredondamento bancário (ROUND_HALF_EVEN) usado no backend
// (app/services/imposto_service.py) para que o preview no frontend bata
// exatamente com o valor líquido calculado no corpo da nota / boleto.
//
// Usa aritmética inteira (BigInt em centavos) para evitar o erro de ponto
// flutuante do JS: 450 * 0.65 / 100 === 2.925 (empate exato), e Math.round
// sempre arredonda .5 para cima (2.93), divergindo do half-even do Python (2.92).

/** Calcula bruto * pct / 100, arredondado a 2 casas com half-even (banker's rounding).
 * Usa aritmética inteira (números seguros até 2^53) em vez de BigInt para
 * compatibilidade com o target ES2017 do projeto. */
export function calcularImposto(bruto: number, pct: number): number {
  if (!pct) return 0;
  const brutoCents = Math.round(bruto * 100);
  const pctBasis = Math.round(pct * 100); // pct em centésimos (ex.: 0.65% -> 65)
  const denom = 10000;
  const numerator = brutoCents * pctBasis; // seguro: |numerator| << Number.MAX_SAFE_INTEGER
  const q = Math.floor(numerator / denom);
  const r = numerator - q * denom;
  const twiceR = r * 2;
  let cents = q;
  if (twiceR > denom || (twiceR === denom && q % 2 !== 0)) {
    cents += 1;
  }
  return cents / 100;
}

/** Soma vários impostos (já arredondados individualmente) e retorna também o líquido. */
export function calcularImpostosTotais(
  bruto: number,
  pcts: { pis: number; cofins: number; inss: number; csll: number }
): { pis: number; cofins: number; inss: number; csll: number; total: number; liquido: number } {
  const pis = calcularImposto(bruto, pcts.pis);
  const cofins = calcularImposto(bruto, pcts.cofins);
  const inss = calcularImposto(bruto, pcts.inss);
  const csll = calcularImposto(bruto, pcts.csll);
  const total = Math.round((pis + cofins + inss + csll) * 100) / 100;
  const liquido = Math.max(Math.round((bruto - total) * 100) / 100, 0.01);
  return { pis, cofins, inss, csll, total, liquido };
}
