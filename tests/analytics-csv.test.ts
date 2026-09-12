import assert from "node:assert/strict"
import test from "node:test"

import {
  ANALYTICS_CSV_LIMITS,
  AnalyticsCsvError,
  profileAnalyticsCsv,
  type AnalyticsCsvErrorCode,
} from "../lib/analytics-csv"

const bytes = (value: string) => new TextEncoder().encode(value)

function rejects(value: Uint8Array | string, code: AnalyticsCsvErrorCode, row?: number, column?: number) {
  assert.throws(
    () => profileAnalyticsCsv(typeof value === "string" ? bytes(value) : value),
    (error: unknown) => {
      assert.ok(error instanceof AnalyticsCsvError)
      assert.equal(error.code, code)
      if (row !== undefined) assert.equal(error.row, row)
      if (column !== undefined) assert.equal(error.column, column)
      return true
    },
  )
}

test("profiles valid UTF-8 CSV deterministically without exposing cell values", () => {
  const input = bytes('Campaign,Spend,Notes\r\nSpring,10.5,"first, launch"\r\nWinter,20,\r\nSpring,,"two ""quotes"""')
  const first = profileAnalyticsCsv(input)
  const second = profileAnalyticsCsv(input)

  assert.deepEqual(first, second)
  assert.deepEqual(first.metadata, {
    byteCount: { evidenceId: "dataset:byte-count", value: input.byteLength },
    rowCount: { evidenceId: "dataset:row-count", value: 3 },
    columnCount: { evidenceId: "dataset:column-count", value: 3 },
    cellCount: { evidenceId: "dataset:cell-count", value: 9 },
  })
  assert.deepEqual(first.columns[0], {
    evidenceId: "column:001",
    index: 0,
    name: "Campaign",
    metrics: {
      blankCount: { evidenceId: "column:001:blank-count", value: 0 },
      nonBlankCount: { evidenceId: "column:001:non-blank-count", value: 3 },
      uniqueCount: { evidenceId: "column:001:unique-count", value: 2 },
      numericCount: { evidenceId: "column:001:numeric-count", value: 0 },
      numericMinimum: { evidenceId: "column:001:numeric-minimum", value: null },
      numericMaximum: { evidenceId: "column:001:numeric-maximum", value: null },
      numericMean: { evidenceId: "column:001:numeric-mean", value: null },
      minimumLength: { evidenceId: "column:001:minimum-length", value: 6 },
      maximumLength: { evidenceId: "column:001:maximum-length", value: 6 },
    },
  })
  assert.equal(first.columns[1].metrics.numericMean.value, 15.25)
  assert.equal(JSON.stringify(first).includes("Spring"), false)
  assert.equal(JSON.stringify(first).includes("first, launch"), false)
})

test("accepts a UTF-8 BOM and embedded newlines in quoted cells", () => {
  const result = profileAnalyticsCsv(bytes('\ufeffCategory,Comment\nA,"line one\nline two"'))
  assert.equal(result.metadata.rowCount.value, 1)
  assert.equal(result.columns[1].metrics.maximumLength.value, 17)
})

test("accepts signed finite numbers while profiling them as numeric", () => {
  const result = profileAnalyticsCsv(bytes("change\n-12.5\n+3\n-1e2\n+0.25"))

  assert.equal(result.columns[0].metrics.numericCount.value, 4)
  assert.equal(result.columns[0].metrics.numericMinimum.value, -100)
  assert.equal(result.columns[0].metrics.numericMaximum.value, 3)
})

test("rejects empty, oversized, invalid UTF-8, NUL, and control-byte inputs", () => {
  rejects(new Uint8Array(), "EMPTY_FILE")
  rejects(new Uint8Array(ANALYTICS_CSV_LIMITS.maxBytes + 1), "FILE_TOO_LARGE")
  rejects(Uint8Array.from([0x61, 0x2c, 0x62, 0x0a, 0xc3, 0x28]), "INVALID_UTF8")
  rejects(Uint8Array.from([0x61, 0, 0x62]), "BINARY_CONTENT")
  rejects(Uint8Array.from([0x61, 0x1f, 0x62]), "BINARY_CONTENT")
})

test("rejects blank, duplicate, and sensitive headers", () => {
  rejects("a, \n1,2", "BLANK_HEADER", 1, 2)
  rejects("Campaign,campaign\nA,B", "DUPLICATE_HEADER", 1, 2)
  rejects("campaign,Email Address\nA,a@example.test", "SENSITIVE_HEADER", 1, 2)
  rejects("campaign,api-key\nA,secret", "SENSITIVE_HEADER", 1, 2)
  rejects("campaign,full name\nA,Person", "SENSITIVE_HEADER", 1, 2)
})

test("rejects ragged, malformed, formula-like, and overlong cells with locations", () => {
  rejects("a,b\n1", "RAGGED_ROW", 2)
  rejects('a\n"unclosed', "MALFORMED_CSV", 2, 1)
  rejects('a\n"ok"x', "MALFORMED_CSV", 2, 1)
  for (const prefix of ["=", "+", "-", "@", "  ="]) {
    rejects(`a\n${prefix}danger`, "FORMULA_CELL", 2, 1)
  }
  for (const expression of ["+1+2", "-1+2", "+SUM(A1:A2)", "-cmd|' /C calc'!A0"]) {
    rejects(`a\n${expression}`, "FORMULA_CELL", 2, 1)
  }
  rejects('a\n"\n=danger"', "FORMULA_CELL", 2, 1)
  rejects(`a\n${"x".repeat(257)}`, "CELL_TOO_LONG", 2, 1)
})

test("enforces column, row, and cell-count limits at their boundaries", () => {
  const fiftyHeaders = Array.from({ length: 50 }, (_, index) => `c${index}`).join(",")
  const fiftyValues = Array.from({ length: 50 }, () => "1").join(",")
  assert.equal(profileAnalyticsCsv(bytes(`${fiftyHeaders}\n${fiftyValues}`)).metadata.columnCount.value, 50)
  rejects(`${fiftyHeaders},overflow\n${fiftyValues},1`, "TOO_MANY_COLUMNS")

  const tenThousandRows = `value\n${Array.from({ length: 10_000 }, () => "1").join("\n")}`
  assert.equal(profileAnalyticsCsv(bytes(tenThousandRows)).metadata.rowCount.value, 10_000)
  rejects(`${tenThousandRows}\n1`, "TOO_MANY_ROWS")

  const fiftyColumnRow = `${fiftyHeaders}\n${fiftyValues}`
  const tenThousandByFifty = `${fiftyHeaders}\n${Array.from({ length: 10_000 }, () => fiftyValues).join("\n")}`
  assert.equal(profileAnalyticsCsv(bytes(tenThousandByFifty)).metadata.cellCount.value, 500_000)
  assert.equal(profileAnalyticsCsv(bytes(fiftyColumnRow)).metadata.cellCount.value, 50)
})

test("rejects more than 500,000 cells independently of row and column limits", () => {
  // The row/column caps imply the same maximum today. This assertion pins that safety invariant.
  assert.equal(ANALYTICS_CSV_LIMITS.maxRows * ANALYTICS_CSV_LIMITS.maxColumns, ANALYTICS_CSV_LIMITS.maxCells)
})
