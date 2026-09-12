export const ANALYTICS_CSV_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxRows: 10_000,
  maxColumns: 50,
  maxCellCharacters: 256,
  maxCells: 500_000,
})

export type AnalyticsCsvErrorCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "INVALID_UTF8"
  | "BINARY_CONTENT"
  | "MALFORMED_CSV"
  | "TOO_MANY_ROWS"
  | "TOO_MANY_COLUMNS"
  | "CELL_TOO_LONG"
  | "TOO_MANY_CELLS"
  | "BLANK_HEADER"
  | "DUPLICATE_HEADER"
  | "SENSITIVE_HEADER"
  | "RAGGED_ROW"
  | "FORMULA_CELL"

export class AnalyticsCsvError extends Error {
  readonly code: AnalyticsCsvErrorCode
  readonly row?: number
  readonly column?: number

  constructor(
    code: AnalyticsCsvErrorCode,
    message: string,
    location: { row?: number; column?: number } = {},
  ) {
    super(message)
    this.name = "AnalyticsCsvError"
    this.code = code
    this.row = location.row
    this.column = location.column
  }
}

export interface AnalyticsMetric<T> {
  evidenceId: string
  value: T
}

export interface AnalyticsColumnProfile {
  evidenceId: string
  index: number
  name: string
  metrics: {
    blankCount: AnalyticsMetric<number>
    nonBlankCount: AnalyticsMetric<number>
    uniqueCount: AnalyticsMetric<number>
    numericCount: AnalyticsMetric<number>
    numericMinimum: AnalyticsMetric<number | null>
    numericMaximum: AnalyticsMetric<number | null>
    numericMean: AnalyticsMetric<number | null>
    minimumLength: AnalyticsMetric<number | null>
    maximumLength: AnalyticsMetric<number | null>
  }
}

export interface AnalyticsCsvProfile {
  format: "csv"
  encoding: "utf-8"
  metadata: {
    byteCount: AnalyticsMetric<number>
    rowCount: AnalyticsMetric<number>
    columnCount: AnalyticsMetric<number>
    cellCount: AnalyticsMetric<number>
  }
  columns: AnalyticsColumnProfile[]
}

const SENSITIVE_HEADER_PATTERNS: ReadonlyArray<RegExp> = [
  /(?:^|_)(?:e_?mail)(?:$|_)/,
  /(?:^|_)(?:phone|mobile|telephone|fax)(?:$|_)/,
  /(?:^|_)(?:ssn|social_security(?:_number)?)(?:$|_)/,
  /(?:^|_)(?:password|passwd|passcode|secret|api_?key|access_?token|auth_?token)(?:$|_)/,
  /(?:^|_)(?:credit_?card|card_?number|cvv|cvc|bank_?account|routing_?number)(?:$|_)/,
  /(?:^|_)(?:date_?of_?birth|dob|birth_?date)(?:$|_)/,
  /(?:^|_)(?:street_?address|home_?address|postal_?address|ip_?address)(?:$|_)/,
  /^(?:first_?name|last_?name|full_?name|customer_?name|contact_?name)$/,
]

function fail(
  code: AnalyticsCsvErrorCode,
  message: string,
  row?: number,
  column?: number,
): never {
  throw new AnalyticsCsvError(code, message, { row, column })
}

function characterCount(value: string): number {
  return Array.from(value).length
}

function assertCellLength(value: string, row: number, column: number): void {
  if (characterCount(value) > ANALYTICS_CSV_LIMITS.maxCellCharacters) {
    fail("CELL_TOO_LONG", "CSV cell exceeds the 256 character limit", row, column)
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let afterQuote = false
  let rowNumber = 1

  const pushField = () => {
    assertCellLength(field, rowNumber, row.length + 1)
    row.push(field)
    field = ""
    afterQuote = false
    if (row.length > ANALYTICS_CSV_LIMITS.maxColumns) {
      fail("TOO_MANY_COLUMNS", "CSV exceeds the 50 column limit", rowNumber, row.length)
    }
  }

  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
    rowNumber += 1
    if (rows.length > ANALYTICS_CSV_LIMITS.maxRows + 1) {
      fail("TOO_MANY_ROWS", "CSV exceeds the 10,000 data row limit", rowNumber)
    }
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
          afterQuote = true
        }
      } else {
        field += char
      }
      continue
    }

    if (afterQuote && char !== "," && char !== "\r" && char !== "\n") {
      fail("MALFORMED_CSV", "Unexpected character after closing quote", rowNumber, row.length + 1)
    }
    if (char === '"') {
      if (field.length > 0) {
        fail("MALFORMED_CSV", "Unexpected quote in unquoted CSV cell", rowNumber, row.length + 1)
      }
      quoted = true
    } else if (char === ",") {
      pushField()
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      pushRow()
    } else {
      field += char
    }
  }

  if (quoted) fail("MALFORMED_CSV", "Unclosed quoted CSV cell", rowNumber, row.length + 1)
  if (field.length > 0 || row.length > 0 || afterQuote) pushRow()
  return rows
}

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function isFormulaLike(value: string): boolean {
  const trimmed = value.trim()
  if ((trimmed.startsWith("+") || trimmed.startsWith("-")) && finiteNumber(trimmed) !== null) {
    return false
  }
  return /^[=+\-@]/.test(trimmed)
}

function finiteNumber(value: string): number | null {
  if (value.trim() === "") return null
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function metric<T>(evidenceId: string, value: T): AnalyticsMetric<T> {
  return { evidenceId, value }
}

export function profileAnalyticsCsv(input: Uint8Array): AnalyticsCsvProfile {
  if (input.byteLength === 0) fail("EMPTY_FILE", "CSV file is empty")
  if (input.byteLength > ANALYTICS_CSV_LIMITS.maxBytes) {
    fail("FILE_TOO_LARGE", "CSV exceeds the 2 MiB size limit")
  }
  for (const byte of input) {
    if (byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) {
      fail("BINARY_CONTENT", "CSV contains binary or disallowed control bytes")
    }
  }

  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input)
  } catch {
    fail("INVALID_UTF8", "CSV must be valid UTF-8")
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows = parseCsv(text)
  if (rows.length === 0) fail("EMPTY_FILE", "CSV file has no header row")
  const headers = rows[0]
  const seenHeaders = new Set<string>()
  headers.forEach((header, index) => {
    const normalized = normalizedHeader(header)
    if (!normalized) fail("BLANK_HEADER", "CSV headers must not be blank", 1, index + 1)
    if (seenHeaders.has(normalized)) {
      fail("DUPLICATE_HEADER", "CSV headers must be unique", 1, index + 1)
    }
    if (SENSITIVE_HEADER_PATTERNS.some((pattern) => pattern.test(normalized))) {
      fail("SENSITIVE_HEADER", "CSV contains a prohibited sensitive-data header", 1, index + 1)
    }
    seenHeaders.add(normalized)
  })

  const dataRows = rows.slice(1)
  const cellCount = dataRows.length * headers.length
  if (cellCount > ANALYTICS_CSV_LIMITS.maxCells) {
    fail("TOO_MANY_CELLS", "CSV exceeds the 500,000 data cell limit")
  }
  dataRows.forEach((values, rowIndex) => {
    if (values.length !== headers.length) {
      fail("RAGGED_ROW", "Every CSV row must have the same number of columns", rowIndex + 2)
    }
    values.forEach((value, columnIndex) => {
      if (isFormulaLike(value)) {
        fail("FORMULA_CELL", "CSV contains a formula-like cell", rowIndex + 2, columnIndex + 1)
      }
    })
  })

  const columns = headers.map((name, columnIndex): AnalyticsColumnProfile => {
    const values = dataRows.map((row) => row[columnIndex])
    const nonBlank = values.filter((value) => value.trim() !== "")
    const numbers = nonBlank.map(finiteNumber).filter((value): value is number => value !== null)
    const lengths = nonBlank.map(characterCount)
    const prefix = `column:${String(columnIndex + 1).padStart(3, "0")}`
    const numericMean = numbers.length
      ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
      : null

    return {
      evidenceId: prefix,
      index: columnIndex,
      name: name.trim(),
      metrics: {
        blankCount: metric(`${prefix}:blank-count`, values.length - nonBlank.length),
        nonBlankCount: metric(`${prefix}:non-blank-count`, nonBlank.length),
        uniqueCount: metric(`${prefix}:unique-count`, new Set(nonBlank).size),
        numericCount: metric(`${prefix}:numeric-count`, numbers.length),
        numericMinimum: metric(`${prefix}:numeric-minimum`, numbers.length ? Math.min(...numbers) : null),
        numericMaximum: metric(`${prefix}:numeric-maximum`, numbers.length ? Math.max(...numbers) : null),
        numericMean: metric(`${prefix}:numeric-mean`, numericMean),
        minimumLength: metric(`${prefix}:minimum-length`, lengths.length ? Math.min(...lengths) : null),
        maximumLength: metric(`${prefix}:maximum-length`, lengths.length ? Math.max(...lengths) : null),
      },
    }
  })

  return {
    format: "csv",
    encoding: "utf-8",
    metadata: {
      byteCount: metric("dataset:byte-count", input.byteLength),
      rowCount: metric("dataset:row-count", dataRows.length),
      columnCount: metric("dataset:column-count", headers.length),
      cellCount: metric("dataset:cell-count", cellCount),
    },
    columns,
  }
}
