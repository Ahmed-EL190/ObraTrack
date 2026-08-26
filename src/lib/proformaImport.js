import * as XLSX from 'xlsx'

// ---------------------------------------------------------------------------
// Importador de Proforma (.xlsx) — modelo "Khaled Sham".
//
// O ficheiro real tem duas particularidades importantes que este parser trata:
//
// 1. O "Total Mão de Obra" normalmente NÃO corresponde a nenhuma linha de item
//    da tabela — é um valor fixo escrito directamente no resumo (ex: 690.000 Kz),
//    enquanto os itens listados são todos "Material". Por isso devolvemos
//    totalMaoDeObra como um valor à parte (summary), para ser usado no modo
//    manual do formulário, e não tentamos "adivinhá-lo" a partir dos itens.
//
// 2. A tabela mistura linhas de item reais (Item No tipo "1.1", "2.1", com
//    Qty/Rate/Amount) com linhas de cabeçalho de secção ("Seção 1 : ...",
//    "1.Trabalho De Pintura") e linhas de subtotal ("TOTAL TRANSFERIDO PARA O
//    RESUMO ....."). Só as primeiras entram na lista de itens.
// ---------------------------------------------------------------------------

function cellText(v) {
  return String(v ?? '').trim()
}

function normalizeLabel(v) {
  return cellText(v).toLowerCase()
}

/** Remove acentos ("ó" -> "o", "ã" -> "a", etc.) — usado só para RECONHECER rótulos
 *  (ex.: "Pró-Forma" vs "Pro-Forma"), nunca para alterar o valor extraído. */
function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Converte "25/08/2026" -> "2026-08-25" (formato esperado pelo <input type="date">). */
function ddmmyyyyToISO(str) {
  const m = cellText(str).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (!m) return ''
  let [, d, mo, y] = m
  if (y.length === 2) y = `20${y}`
  return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function extractAfterLabel(text, labels) {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:.]?\\s*(.+)`, 'i')
    const m = text.match(re)
    if (m) return m[1].trim()
  }
  return ''
}

/** Encontra a folha que contém a tabela de itens (cabeçalho "Item No" + "Description"). */
function findMainSheetRows(workbook) {
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' })
    const hasItemHeader = rows.some((row) =>
      row.some((c) => {
        const l = normalizeLabel(c)
        return l.includes('item no') || l.includes('item nº')
      })
    )
    if (hasItemHeader) return rows
  }
  // fallback: folha com mais linhas
  let best = []
  workbook.SheetNames.forEach((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' })
    if (rows.length > best.length) best = rows
  })
  return best
}

const SUMMARY_MARKERS = /total material|total m[aã]o de obra|^iva\b|total geral|^total$|grande resumo/i

export function parseProformaExcel(workbook) {
  const rows = findMainSheetRows(workbook)

  const result = {
    proformaNumber: '',
    date: '',
    clientName: '',
    nif: '',
    obraName: '',
    location: '',
    paymentTerms: '',
    ivaRate: null,
    totalMaterial: null,
    totalMaoDeObra: null,
    totalGeral: null,
    items: []
  }

  let headerRowIndex = -1

  // --- Cabeçalho: percorre todas as células à procura dos campos conhecidos ---
  rows.forEach((row, i) => {
    row.forEach((cell, j) => {
      const text = cellText(cell)
      if (!text) return
      const lower = text.toLowerCase()

      if (lower.startsWith('cliente')) {
        result.clientName = cellText(row[j + 1]) || extractAfterLabel(text, ['cliente'])
      } else if (lower.startsWith('obra')) {
        result.obraName = cellText(row[j + 1]) || extractAfterLabel(text, ['obra'])
      } else if (lower.startsWith('local')) {
        result.location = cellText(row[j + 1]) || extractAfterLabel(text, ['local'])
      } else if (lower.includes('nif')) {
        result.nif = extractAfterLabel(text, ['nif'])
      } else if (
        !stripAccents(lower).includes('validade') &&
        /pro[\s-]?forma/.test(stripAccents(lower))
      ) {
        // O rótulo varia de ficheiro para ficheiro: "Pro-Forma Nº: X", "Nº Pró-Forma: X",
        // com ou sem acento, "Nº"/"No"/"N°". Em vez de tentar prever cada combinação de
        // ordem das palavras, extraímos tudo o que vem depois dos ":" quando existem —
        // é o formato mais fiável neste modelo — com fallback para o padrão antigo.
        const afterColon = text.includes(':') ? text.split(':').pop().trim() : ''
        result.proformaNumber =
          afterColon ||
          extractAfterLabel(stripAccents(text), [
            'pro[\\s-]?forma\\s*n[ºo°]?\\.?',
            'n[ºo°]?\\.?\\s*pro[\\s-]?forma'
          ])
      } else if ((lower.startsWith('date') || lower.startsWith('data')) && !lower.includes('validade')) {
        // O modelo real usa "DATA" (português), não "Date" (inglês) — as duas são aceites.
        result.date = ddmmyyyyToISO(extractAfterLabel(text, ['date', 'data']))
      } else if (lower.includes('formas de pagamento')) {
        result.paymentTerms = text.replace(/formas de pagamento/i, '').replace(/^[\s:]+/, '').trim()
      } else if (lower.includes('item no') || lower.includes('item nº')) {
        headerRowIndex = i
      }
    })
  })

  // --- Tabela de itens ---
  let currentSection = ''
  if (headerRowIndex >= 0) {
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const [itemNo, description, unit, qty, rate, amount] = rows[i]
      const rawItemNo = cellText(itemNo)
      const rawDesc = cellText(description)
      const combined = `${rawItemNo} ${rawDesc}`.trim()

      if (!rawItemNo && !rawDesc) continue // linha em branco

      if (SUMMARY_MARKERS.test(combined)) break // chegámos ao bloco de totais — tabela de itens acabou

      if (/^total\b/i.test(rawItemNo)) continue // "TOTAL TRANSFERIDO PARA O RESUMO ....."

      const looksLikeItem =
        /^\d+(\.\d+)*$/.test(rawItemNo) && (Number(qty) > 0 || Number(rate) > 0 || Number(amount) > 0)

      if (!looksLikeItem) {
        // Linha de cabeçalho de secção/subsecção (ex: "Seção 1 : ...", "1.Trabalho De Pintura")
        if (rawDesc) currentSection = rawDesc
        continue
      }

      result.items.push({
        section: currentSection,
        itemNo: rawItemNo,
        description: rawDesc,
        unit: cellText(unit),
        quantity: Number(qty) || 0,
        rate: Number(rate) || 0
      })
    }
  }

  // --- Resumo: Total Material / Total Mão de Obra / IVA / Total Geral ---
  rows.forEach((row) => {
    row.forEach((cell) => {
      const text = cellText(cell)
      if (!text) return
      const lower = text.toLowerCase()
      const valueCell = [...row].reverse().find((c) => typeof c === 'number')

      if (lower.includes('total material')) {
        if (typeof valueCell === 'number') result.totalMaterial = valueCell
      } else if (lower.includes('mao de obra') || lower.includes('mão de obra')) {
        if (typeof valueCell === 'number') result.totalMaoDeObra = valueCell
      } else if (lower.includes('iva')) {
        const pctMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/)
        if (pctMatch) result.ivaRate = Number(pctMatch[1].replace(',', '.'))
      } else if (lower.trim() === 'total' || lower.includes('total geral')) {
        if (typeof valueCell === 'number') result.totalGeral = valueCell
      }
    })
  })

  return result
}