import type { DdlDialect } from './types'

export const DIALECT_TYPE_MAPS: Record<DdlDialect, Readonly<Record<string, string>>> = {
  postgres: {
    integer: 'INTEGER',
    int: 'INTEGER',
    serial: 'SERIAL',
    varchar: 'VARCHAR',
    char: 'CHAR',
    text: 'TEXT',
    decimal: 'DECIMAL',
    numeric: 'DECIMAL',
    date: 'DATE',
    timestamp: 'TIMESTAMP',
    boolean: 'BOOLEAN',
  },
  mysql: {
    integer: 'INTEGER',
    int: 'INTEGER',
    serial: 'INT',
    varchar: 'VARCHAR',
    char: 'CHAR',
    text: 'TEXT',
    decimal: 'DECIMAL',
    numeric: 'DECIMAL',
    date: 'DATE',
    timestamp: 'TIMESTAMP',
    boolean: 'BOOLEAN',
  },
}

const PARAMETERIZED_BASES = new Set(['varchar', 'char', 'decimal', 'numeric'])

export interface ResolvedColumnType {
  sqlType: string
  known: boolean
}

export function resolveColumnType(rawType: string, dialect: DdlDialect, primaryKey = false): ResolvedColumnType {
  const original = String(rawType ?? '').trim()
  const match = original.match(/^([a-zA-Z][a-zA-Z0-9_ ]*?)\s*(?:\(([^)]*)\))?$/)
  if (!match) return { sqlType: original, known: false }

  const base = match[1].trim().toLowerCase()
  const mapped = DIALECT_TYPE_MAPS[dialect][base]
  if (!mapped) return { sqlType: original, known: false }

  if (base === 'serial') {
    if (dialect === 'mysql') return { sqlType: primaryKey ? 'INT AUTO_INCREMENT' : 'INT', known: true }
    return { sqlType: 'SERIAL', known: true }
  }

  const params = match[2]
    ? match[2]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(',')
    : ''

  if (params && PARAMETERIZED_BASES.has(base)) return { sqlType: `${mapped}(${params})`, known: true }
  return { sqlType: mapped, known: true }
}

export function normalizeTypeForComparison(rawType: string): string {
  const original = String(rawType ?? '').trim().toLowerCase()
  const match = original.match(/^([a-z][a-z0-9_ ]*?)\s*(?:\(([^)]*)\))?$/)
  if (!match) return original

  const base = match[1].trim()
  const alias = base === 'integer' ? 'int' : base === 'numeric' ? 'decimal' : base
  const params = match[2]
    ? `(${match[2]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(',')})`
    : ''

  return `${alias}${params}`
}

export function quoteIdentifier(identifier: string, dialect: DdlDialect): string {
  const value = String(identifier ?? '')
  if (dialect === 'mysql') return `\`${value.replace(/`/g, '``')}\``
  return `"${value.replace(/"/g, '""')}"`
}
