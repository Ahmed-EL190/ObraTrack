import * as XLSX from 'xlsx'

export function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        resolve(wb)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function sheetToRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return { headers: [], rows: [] }
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headers = (json[0] || []).map((h) => String(h).trim())
  const rows = json.slice(1).filter((r) => r.some((cell) => cell !== '' && cell !== null && cell !== undefined))
  return { headers, rows }
}

/** Applies a { targetField: headerName } mapping to raw rows, returning objects. */
export function mapRows(headers, rows, mapping) {
  const indexByHeader = Object.fromEntries(headers.map((h, i) => [h, i]))
  return rows.map((r) => {
    const obj = {}
    Object.entries(mapping).forEach(([field, header]) => {
      if (!header) return
      const idx = indexByHeader[header]
      obj[field] = idx !== undefined ? r[idx] : ''
    })
    return obj
  })
}

export const IMPORT_TARGET_FIELDS = [
  { key: 'clientName', label: 'Cliente' },
  { key: 'nif', label: 'NIF' },
  { key: 'obraName', label: 'Obra' },
  { key: 'location', label: 'Local' },
  { key: 'proformaNumber', label: 'Número da Proforma' },
  { key: 'date', label: 'Data' },
  { key: 'description', label: 'Descrição' },
  { key: 'unit', label: 'Unidade' },
  { key: 'quantity', label: 'Quantidade' },
  { key: 'rate', label: 'Preço Unitário' },
  { key: 'amount', label: 'Montante' },
  { key: 'totalMaterial', label: 'Total Material' },
  { key: 'totalMaoDeObra', label: 'Total Mão de Obra' },
  { key: 'iva', label: 'IVA' },
  { key: 'totalGeral', label: 'Total Geral' },
  { key: 'paymentDate', label: 'Data de Pagamento' },
  { key: 'paymentAmount', label: 'Valor do Pagamento' },
  { key: 'paymentReference', label: 'Referência do Pagamento' },
  { key: 'notes', label: 'Notas' }
]

/** Simple duplicate detector: matches on proformaNumber + clientName + obraName + date + amount. */
export function detectDuplicates(newRows, existingRows) {
  const key = (r) =>
    [r.proformaNumber, r.clientName, r.obraName, r.date || r.paymentDate, r.amount || r.paymentAmount]
      .map((v) => String(v || '').trim().toLowerCase())
      .join('|')

  const existingKeys = new Set(existingRows.map(key))
  return newRows.map((r) => ({ ...r, isDuplicate: existingKeys.has(key(r)) }))
}

// ---- Export -------------------------------------------------

export function exportRowsToExcel(rows, filename, sheetName = 'Dados') {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

export function exportMultiSheetExcel(sheets, filename) {
  const wb = XLSX.utils.book_new()
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  })
  XLSX.writeFile(wb, filename)
}
