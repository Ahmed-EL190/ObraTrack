import * as XLSX from 'xlsx'

export function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, {
          type: 'array',
          cellDates: true
        })

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

  if (!sheet) {
    return {
      headers: [],
      rows: []
    }
  }

  const json = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ''
  })

  const rawHeaders = json[0] || []

  // إنشاء أسماء Headers فريدة حتى لو كان Excel يحتوي
  // على أعمدة بنفس الاسم أو أعمدة بدون اسم.
  const usedHeaders = new Map()

  const headers = rawHeaders.map((header, index) => {
    const originalHeader = String(header ?? '').trim()

    // لو الـ Header فاضي
    const baseName =
      originalHeader || `Coluna ${index + 1}`

    const count = usedHeaders.get(baseName) || 0

    usedHeaders.set(baseName, count + 1)

    // أول مرة يظهر الاسم
    if (count === 0) {
      return baseName
    }

    // لو الاسم متكرر
    return `${baseName} (${count + 1})`
  })

  const rows = json
    .slice(1)
    .filter((row) =>
      row.some(
        (cell) =>
          cell !== '' &&
          cell !== null &&
          cell !== undefined
      )
    )

  return {
    headers,
    rows
  }
}

/**
 * Applies a { targetField: headerName } mapping to raw rows.
 */
export function mapRows(headers, rows, mapping) {
  const indexByHeader = Object.fromEntries(
    headers.map((header, index) => [
      header,
      index
    ])
  )

  return rows.map((row) => {
    const obj = {}

    Object.entries(mapping).forEach(
      ([field, header]) => {
        if (!header) return

        const index = indexByHeader[header]

        obj[field] =
          index !== undefined
            ? row[index]
            : ''
      }
    )

    return obj
  })
}

export const IMPORT_TARGET_FIELDS = [
  {
    key: 'clientName',
    label: 'Cliente'
  },
  {
    key: 'nif',
    label: 'NIF'
  },
  {
    key: 'obraName',
    label: 'Obra'
  },
  {
    key: 'location',
    label: 'Local'
  },
  {
    key: 'proformaNumber',
    label: 'Número da Proforma'
  },
  {
    key: 'date',
    label: 'Data'
  },
  {
    key: 'description',
    label: 'Descrição'
  },
  {
    key: 'unit',
    label: 'Unidade'
  },
  {
    key: 'quantity',
    label: 'Quantidade'
  },
  {
    key: 'rate',
    label: 'Preço Unitário'
  },
  {
    key: 'amount',
    label: 'Montante'
  },
  {
    key: 'totalMaterial',
    label: 'Total Material'
  },
  {
    key: 'totalMaoDeObra',
    label: 'Total Mão de Obra'
  },
  {
    key: 'iva',
    label: 'IVA'
  },
  {
    key: 'totalGeral',
    label: 'Total Geral'
  },
  {
    key: 'paymentDate',
    label: 'Data de Pagamento'
  },
  {
    key: 'paymentAmount',
    label: 'Valor do Pagamento'
  },
  {
    key: 'paymentReference',
    label: 'Referência do Pagamento'
  },
  {
    key: 'notes',
    label: 'Notas'
  }
]

/**
 * Detect duplicate records.
 *
 * Matches using:
 * proformaNumber + clientName + obraName + date + amount
 *
 * Also returns existingId so the import screen
 * can update an existing record instead of
 * creating a duplicate.
 */
export function detectDuplicates(
  newRows,
  existingRows
) {
  const key = (row) =>
    [
      row.proformaNumber,
      row.clientName,
      row.obraName,
      row.date || row.paymentDate,
      row.amount || row.paymentAmount
    ]
      .map((value) =>
        String(value || '')
          .trim()
          .toLowerCase()
      )
      .join('|')

  const existingIdByKey = new Map(
    existingRows.map((row) => [
      key(row),
      row.id
    ])
  )

  return newRows.map((row) => {
    const existingId =
      existingIdByKey.get(key(row)) || null

    return {
      ...row,
      isDuplicate: Boolean(existingId),
      existingId
    }
  })
}

// -------------------------------------------------
// Export
// -------------------------------------------------

export function exportRowsToExcel(
  rows,
  filename,
  sheetName = 'Dados'
) {
  const ws = XLSX.utils.json_to_sheet(rows)

  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    wb,
    ws,
    sheetName
  )

  XLSX.writeFile(wb, filename)
}

export function exportMultiSheetExcel(
  sheets,
  filename
) {
  const wb = XLSX.utils.book_new()

  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows)

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      name.slice(0, 31)
    )
  })

  XLSX.writeFile(wb, filename)
}