// ---------------------------------------------------------------------------
// Núcleo de cálculo financeiro do ObraTrack.
//
// Regra de negócio (ver especificação):
//   1. Percentagem do Pagamento   = Valor Pago / Total da Obra × 100
//   2. Mão de Obra do Pagamento   = Total Mão de Obra × Percentagem do Pagamento
//   3. Retenção do Pagamento      = Mão de Obra do Pagamento × Taxa de Retenção
//
// A Retenção é sempre calculada por pagamento individual (nunca sobre o total
// da Mão de Obra de uma só vez), para evitar contagem duplicada quando um
// cliente paga uma Obra em várias tranches.
// ---------------------------------------------------------------------------

/** Arredonda para 2 casas decimais evitando erros de vírgula flutuante. */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

/**
 * Calcula os valores derivados de um único pagamento.
 *
 * @param {Object} params
 * @param {number} params.obraTotal - Total Geral da Obra (contractValue / totalGeral)
 * @param {number} params.totalMaoDeObra - Total Mão de Obra da Obra/Proforma
 * @param {number} params.paymentAmount - Valor deste pagamento
 * @param {number} params.retentionRate - Taxa de retenção em % (ex: 30 para 30%)
 */
export function calculatePayment({ obraTotal, totalMaoDeObra, paymentAmount, retentionRate }) {
  const safeObraTotal = Number(obraTotal) || 0
  const safeMaoDeObra = Number(totalMaoDeObra) || 0
  const safeAmount = Number(paymentAmount) || 0
  const safeRate = Number(retentionRate) || 0

  const paymentPercent = safeObraTotal > 0 ? (safeAmount / safeObraTotal) * 100 : 0
  const maoDeObraPortion = safeMaoDeObra * (paymentPercent / 100)
  const retentionAmount = maoDeObraPortion * (safeRate / 100)

  return {
    paymentPercent: round2(paymentPercent),
    maoDeObraPortion: round2(maoDeObraPortion),
    retentionAmount: round2(retentionAmount)
  }
}

/**
 * Recalcula o estado completo de uma Obra a partir de todos os seus pagamentos.
 * Cada pagamento é recalculado de forma independente (percentagem própria,
 * mão de obra própria, retenção própria) e depois somados — nunca se aplica
 * a taxa de retenção sobre o total acumulado.
 *
 * @param {Object} obra - deve conter obraTotal (totalGeral) e totalMaoDeObra
 * @param {Array} payments - lista de pagamentos { paymentAmount, paymentDate, retentionRate }
 *   retentionRate pode variar por pagamento (ex: alterado a meio do contrato);
 *   se omitido, usa obra.retentionRate ou o valor global das definições.
 * @param {number} defaultRetentionRate - taxa a usar quando o pagamento não define uma
 */
export function computeObraSummary(obra, payments, defaultRetentionRate = 0) {
  const obraTotal = Number(obra?.totalGeral ?? obra?.contractValue ?? 0)
  const totalMaoDeObra = Number(obra?.totalMaoDeObra ?? 0)
  const rate = obra?.retentionRate ?? defaultRetentionRate

  const sorted = [...(payments || [])].sort(
    (a, b) => new Date(a.paymentDate) - new Date(b.paymentDate)
  )

  let cumulativePaid = 0
  let cumulativeRetention = 0
  let cumulativeMaoDeObra = 0

  const rows = sorted.map((p) => {
    const effectiveRate = p.retentionRate ?? rate
    const calc = calculatePayment({
      obraTotal,
      totalMaoDeObra,
      paymentAmount: p.paymentAmount,
      retentionRate: effectiveRate
    })

    cumulativePaid = round2(cumulativePaid + Number(p.paymentAmount || 0))
    cumulativeRetention = round2(cumulativeRetention + calc.retentionAmount)
    cumulativeMaoDeObra = round2(cumulativeMaoDeObra + calc.maoDeObraPortion)

    const cumulativePercent = obraTotal > 0 ? round2((cumulativePaid / obraTotal) * 100) : 0

    return {
      ...p,
      paymentPercent: calc.paymentPercent,
      cumulativePercent,
      maoDeObraPortion: calc.maoDeObraPortion,
      retentionAmount: calc.retentionAmount,
      totalPaidAfter: cumulativePaid,
      remainingAfter: round2(obraTotal - cumulativePaid)
    }
  })

  const remaining = round2(obraTotal - cumulativePaid)
  const paidPercent = obraTotal > 0 ? round2((cumulativePaid / obraTotal) * 100) : 0

  let status = 'Não Iniciado'
  if (cumulativePaid <= 0) status = 'Não Iniciado'
  else if (remaining <= 0.01) status = 'Pago'
  else status = 'Parcialmente Pago'

  return {
    obraTotal: round2(obraTotal),
    totalMaoDeObra: round2(totalMaoDeObra),
    totalPaid: cumulativePaid,
    remaining,
    paidPercent,
    totalRetention: cumulativeRetention,
    totalMaoDeObraPaid: cumulativeMaoDeObra,
    paymentCount: rows.length,
    status,
    rows
  }
}

/** Agrega o resumo de um Cliente a partir das Obras já calculadas (computeObraSummary). */
export function computeClientSummary(obraSummaries) {
  return obraSummaries.reduce(
    (acc, s) => {
      acc.totalObras += 1
      acc.totalContractValue = round2(acc.totalContractValue + s.obraTotal)
      acc.totalPaid = round2(acc.totalPaid + s.totalPaid)
      acc.totalOutstanding = round2(acc.totalOutstanding + s.remaining)
      acc.totalRetention = round2(acc.totalRetention + s.totalRetention)
      return acc
    },
    { totalObras: 0, totalContractValue: 0, totalPaid: 0, totalOutstanding: 0, totalRetention: 0 }
  )
}

/** IVA: Subtotal = Material + Mão de Obra; IVA = Subtotal × taxa; Total Geral = Subtotal + IVA */
export function calculateProformaTotals({ totalMaterial, totalMaoDeObra, ivaRate }) {
  const material = Number(totalMaterial) || 0
  const maoDeObra = Number(totalMaoDeObra) || 0
  const rate = Number(ivaRate) || 0

  const subtotal = round2(material + maoDeObra)
  const ivaAmount = round2(subtotal * (rate / 100))
  const totalGeral = round2(subtotal + ivaAmount)

  return { subtotal, ivaAmount, totalGeral }
}
