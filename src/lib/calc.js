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
 * @param {string} [params.retentionMode] - Como a retenção é aplicada a este pagamento:
 *   'proportional' (padrão) - retenção calculada apenas sobre a fatia de Mão de Obra
 *     correspondente a este pagamento (comportamento original).
 *   'none' - este pagamento não gera retenção nenhuma (ex: cliente que só liquida a
 *     retenção mais tarde, num pagamento à parte).
 *   'full' - calcula a retenção sobre a Mão de Obra TOTAL do contrato de uma só vez
 *     neste pagamento (ex: pagamento final onde o cliente liquida toda a retenção
 *     acumulada). Deve ser usado normalmente uma única vez por Obra — se outros
 *     pagamentos também tiverem retenção 'proportional' ou 'full', o total pode ficar
 *     contado a dobrar.
 */
export function calculatePayment({ obraTotal, totalMaoDeObra, paymentAmount, retentionRate, retentionMode = 'proportional' }) {
  const safeObraTotal = Number(obraTotal) || 0
  const safeMaoDeObra = Number(totalMaoDeObra) || 0
  const safeAmount = Number(paymentAmount) || 0
  const safeRate = Number(retentionRate) || 0

  const paymentPercent = safeObraTotal > 0 ? (safeAmount / safeObraTotal) * 100 : 0
  const maoDeObraPortion = safeMaoDeObra * (paymentPercent / 100)

  let retentionAmount
  if (retentionMode === 'none') {
    retentionAmount = 0
  } else if (retentionMode === 'full') {
    retentionAmount = safeMaoDeObra * (safeRate / 100)
  } else {
    retentionAmount = maoDeObraPortion * (safeRate / 100)
  }

  return {
    paymentPercent: round2(paymentPercent),
    maoDeObraPortion: round2(maoDeObraPortion),
    retentionAmount: round2(retentionAmount),
    retentionMode
  }
}

/**
 * Recalcula o estado completo de uma Obra a partir de todos os seus pagamentos.
 * Cada pagamento é recalculado de forma independente (percentagem própria,
 * mão de obra própria, retenção própria) e depois somados — nunca se aplica
 * a taxa de retenção sobre o total acumulado.
 *
 * @param {Object} obra - deve conter obraTotal (totalGeral) e totalMaoDeObra
 * @param {Array} payments - lista de pagamentos { paymentAmount, paymentDate, retentionRate, retentionMode }
 *   retentionRate pode variar por pagamento (ex: alterado a meio do contrato);
 *   se omitido, usa obra.retentionRate ou o valor global das definições.
 *   retentionMode pode variar por pagamento ('proportional' | 'none' | 'full');
 *   se omitido, assume 'proportional' (comportamento original).
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
    const effectiveMode = p.retentionMode || 'proportional'
    const calc = calculatePayment({
      obraTotal,
      totalMaoDeObra,
      paymentAmount: p.paymentAmount,
      retentionRate: effectiveRate,
      retentionMode: effectiveMode
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

/**
 * Uma Obra pode ter várias Proformas (ex.: Proforma nº 1, 2 e 3). Um único
 * pagamento pode cobrir todas, algumas, ou apenas uma delas — em qualquer
 * combinação e com qualquer valor, não têm de ser divididas em partes iguais.
 *
 * Para isso, cada pagamento pode ter um campo `allocations`:
 *   [{ proformaId, amount }, ...]
 * indicando exatamente quanto desse pagamento foi aplicado a cada Proforma.
 * A soma das alocações pode ser menor que o valor do pagamento — a diferença
 * fica "não alocada" (conta só para o total geral da Obra, não para nenhuma
 * Proforma específica).
 *
 * Pagamentos antigos, criados antes desta funcionalidade existir, não têm
 * `allocations` — continuam a contar apenas para o total da Obra.
 */
export function computeProformaBalances(proformas, payments) {
  const paidMap = {}

  ;(payments || []).forEach((p) => {
    if (Array.isArray(p.allocations) && p.allocations.length) {
      p.allocations.forEach((a) => {
        if (!a?.proformaId) return
        paidMap[a.proformaId] = round2((paidMap[a.proformaId] || 0) + (Number(a.amount) || 0))
      })
    } else if (p.proformaId) {
      // Compatibilidade com pagamentos antigos que só guardavam UMA proforma
      // associada (sem divisão): conta o pagamento inteiro para essa proforma.
      paidMap[p.proformaId] = round2((paidMap[p.proformaId] || 0) + (Number(p.paymentAmount) || 0))
    }
  })

  const unallocated = round2(
    (payments || []).reduce((sum, p) => {
      if (Array.isArray(p.allocations) && p.allocations.length) {
        const allocatedInThisPayment = p.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)
        return sum + Math.max(0, (Number(p.paymentAmount) || 0) - allocatedInThisPayment)
      }
      if (!p.proformaId) return sum + (Number(p.paymentAmount) || 0)
      return sum
    }, 0)
  )

  const rows = (proformas || []).map((pf) => {
    const total = Number(pf.totalGeral) || 0
    const paidAmount = paidMap[pf.id] || 0
    const remaining = round2(total - paidAmount)
    let status = 'Não Pago'
    if (paidAmount <= 0) status = 'Não Pago'
    else if (remaining <= 0.01) status = 'Pago'
    else status = 'Parcialmente Pago'
    return { ...pf, total, paidAmount, remaining, status }
  })

  return { rows, unallocated }
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