import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatKz, formatPercent } from './format.js'

function baseDoc(title, subtitle) {
  const doc = new jsPDF({ unit: 'pt' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(15, 20, 32)
  doc.text('ObraTrack', 40, 45)
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text('Gestão de Pagamentos e Retenção · Angola', 40, 60)

  doc.setFontSize(13)
  doc.setTextColor(15, 20, 32)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 40, 90)
  if (subtitle) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(90, 90, 90)
    doc.text(subtitle, 40, 106)
  }
  return doc
}

function footer(doc) {
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Gerado em ${formatDate(new Date())} · Página ${i} de ${pageCount}`, 40, doc.internal.pageSize.height - 20)
  }
}

export function exportClientStatementPDF(client, rows, summary) {
  const doc = baseDoc(`Extrato de Pagamentos — ${client.clientName}`, `NIF: ${client.nif || '—'}`)

  autoTable(doc, {
    startY: 125,
    head: [['Obra', 'Proforma', 'Total Obra', 'Pagamento', 'Data', 'Total Pago', 'Restante', 'Pago %']],
    body: rows.map((r) => [
      r.obraName,
      r.proformaNumber || '—',
      formatKz(r.obraTotal),
      formatKz(r.paymentAmount),
      formatDate(r.paymentDate),
      formatKz(r.totalPaidAfter),
      formatKz(r.remainingAfter),
      formatPercent(r.cumulativePercent)
    ]),
    headStyles: { fillColor: [15, 20, 32], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    styles: { cellPadding: 5 }
  })

  const finalY = doc.lastAutoTable.finalY + 20
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total Contratado: ${formatKz(summary.totalContractValue)}`, 40, finalY)
  doc.text(`Total Pago: ${formatKz(summary.totalPaid)}`, 40, finalY + 16)
  doc.text(`Total em Aberto: ${formatKz(summary.totalOutstanding)}`, 40, finalY + 32)
  doc.text(`Retenção Total: ${formatKz(summary.totalRetention)}`, 40, finalY + 48)

  footer(doc)
  doc.save(`extrato-${client.clientName.replace(/\s+/g, '-').toLowerCase()}.pdf`)
}

export function exportObraStatementPDF(obra, client, summary) {
  const doc = baseDoc(`Extrato da Obra — ${obra.obraName}`, `Cliente: ${client?.clientName || '—'}`)

  autoTable(doc, {
    startY: 125,
    head: [['Data', 'Pagamento', '%', '% Acumulada', 'Mão de Obra', 'Retenção', 'Restante']],
    body: summary.rows.map((r) => [
      formatDate(r.paymentDate),
      formatKz(r.paymentAmount),
      formatPercent(r.paymentPercent),
      formatPercent(r.cumulativePercent),
      formatKz(r.maoDeObraPortion),
      formatKz(r.retentionAmount),
      formatKz(r.remainingAfter)
    ]),
    headStyles: { fillColor: [15, 20, 32], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    styles: { cellPadding: 5 }
  })

  const finalY = doc.lastAutoTable.finalY + 20
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total Obra: ${formatKz(summary.obraTotal)}`, 40, finalY)
  doc.text(`Total Pago: ${formatKz(summary.totalPaid)}`, 40, finalY + 16)
  doc.text(`Restante: ${formatKz(summary.remaining)}`, 40, finalY + 32)
  doc.text(`Retenção Total: ${formatKz(summary.totalRetention)}`, 40, finalY + 48)

  footer(doc)
  doc.save(`extrato-obra-${obra.obraName.replace(/\s+/g, '-').toLowerCase()}.pdf`)
}

export function exportPaymentReceiptPDF(payment, client, obra, calc) {
  const doc = baseDoc('Recibo de Pagamento', `Referência: ${payment.paymentReference || '—'}`)

  autoTable(doc, {
    startY: 125,
    head: [['Campo', 'Valor']],
    body: [
      ['Cliente', client?.clientName || '—'],
      ['NIF', client?.nif || '—'],
      ['Obra', obra?.obraName || '—'],
      ['Data do Pagamento', formatDate(payment.paymentDate)],
      ['Valor Pago', formatKz(payment.paymentAmount)],
      ['Método', payment.paymentMethod || '—'],
      ['Percentagem do Pagamento', formatPercent(calc.paymentPercent)],
      ['Mão de Obra Correspondente', formatKz(calc.maoDeObraPortion)],
      ['Retenção', formatKz(calc.retentionAmount)]
    ],
    headStyles: { fillColor: [15, 20, 32], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    styles: { cellPadding: 6 }
  })

  footer(doc)
  doc.save(`recibo-${(payment.paymentReference || payment.id || 'pagamento').toString().toLowerCase()}.pdf`)
}

export function exportProformaPDF(proforma, items) {
  const doc = baseDoc(`Proforma ${proforma.proformaNumber}`, `Cliente: ${proforma.clientName} · Obra: ${proforma.obraName}`)

  autoTable(doc, {
    startY: 125,
    head: [['Item', 'Descrição', 'Un.', 'Qtd.', 'Preço Unit.', 'Montante']],
    body: items.map((it) => [
      it.itemNo,
      it.description,
      it.unit,
      formatKz(it.quantity).replace(' Kz', ''),
      formatKz(it.rate),
      formatKz(it.amount)
    ]),
    headStyles: { fillColor: [15, 20, 32], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    styles: { cellPadding: 5 }
  })

  const finalY = doc.lastAutoTable.finalY + 20
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total Material: ${formatKz(proforma.totalMaterial)}`, 40, finalY)
  doc.text(`Total Mão de Obra: ${formatKz(proforma.totalMaoDeObra)}`, 40, finalY + 16)
  doc.text(`IVA (${proforma.ivaRate}%): ${formatKz(proforma.ivaAmount)}`, 40, finalY + 32)
  doc.text(`Total Geral: ${formatKz(proforma.totalGeral)}`, 40, finalY + 48)

  footer(doc)
  doc.save(`proforma-${proforma.proformaNumber}.pdf`)
}

export function exportRetentionReportPDF(rows, totalRetention) {
  const doc = baseDoc('Relatório de Retenção', `${rows.length} pagamento(s)`)

  autoTable(doc, {
    startY: 125,
    head: [['Cliente', 'Obra', 'Proforma', 'Data', 'Pagamento', '%', 'M.Obra Pgto', 'Taxa', 'Retenção']],
    body: rows.map((r) => [
      r.clientName,
      r.obraName,
      r.proformaNumber || '—',
      formatDate(r.paymentDate),
      formatKz(r.paymentAmount),
      formatPercent(r.paymentPercent),
      formatKz(r.maoDeObraPortion),
      formatPercent(r.retentionRate),
      formatKz(r.retentionAmount)
    ]),
    headStyles: { fillColor: [15, 20, 32], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5 },
    styles: { cellPadding: 4 }
  })

  const finalY = doc.lastAutoTable.finalY + 20
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Retenção Total: ${formatKz(totalRetention)}`, 40, finalY)

  footer(doc)
  doc.save('relatorio-retencao.pdf')
}

export function exportOutstandingReportPDF(rows) {
  const doc = baseDoc('Relatório de Valores em Aberto', `${rows.length} obra(s)`)

  autoTable(doc, {
    startY: 125,
    head: [['Cliente', 'Obra', 'Proforma', 'Total Obra', 'Total Pago', 'Restante', 'Pago %']],
    body: rows.map((r) => [
      r.clientName,
      r.obraName,
      r.proformaNumber || '—',
      formatKz(r.obraTotal),
      formatKz(r.totalPaid),
      formatKz(r.remaining),
      formatPercent(r.paidPercent)
    ]),
    headStyles: { fillColor: [15, 20, 32], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    styles: { cellPadding: 5 }
  })

  footer(doc)
  doc.save('relatorio-em-aberto.pdf')
}
