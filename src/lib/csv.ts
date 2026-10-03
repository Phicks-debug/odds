import type { Row } from "@/lib/types"

/** Reads a LinkedIn export file. Some of them put a notes paragraph above the header row. */
export function parseCsv(text: string): Row[] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const source = text.replace(/^﻿/, "")
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ",") {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") {
        i++
      }
      row.push(cell)
      cell = ""
      if (row.some((c) => c !== "")) {
        out.push(row)
      }
      row = []
    } else {
      cell += ch
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    out.push(row)
  }
  const headerAt = out.findIndex((r) => r.length > 1)
  const header = out[headerAt] ?? []

  return out
    .slice(headerAt + 1)
    .filter((r) => r.length >= 2)
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])))
}
