import type {
  ColumnModel,
  RelationshipModel,
  TableModel,
} from '@dbmapper/domain'

const IDENTIFIER = '(?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|\\w+)'

export function splitSqlDefinitions(content: string): string[] {
  const definitions: string[] = []
  let currentLine = ''
  let parenDepth = 0
  let quoteChar = ''

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = content[i + 1]

    if (quoteChar) {
      currentLine += char
      if (char === quoteChar && nextChar !== quoteChar) quoteChar = ''
      if (char === quoteChar && nextChar === quoteChar) {
        currentLine += nextChar
        i++
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quoteChar = char
      currentLine += char
      continue
    }

    if (char === '(') parenDepth++
    if (char === ')') parenDepth--

    if (char === ',' && parenDepth === 0) {
      definitions.push(currentLine.trim())
      currentLine = ''
    } else {
      currentLine += char
    }
  }

  if (currentLine.trim()) definitions.push(currentLine.trim())
  return definitions
}

export function cleanIdentifier(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/^[`"[]|[`"\]]$/g, '')
}

export function cleanTableIdentifier(value: string | null | undefined): string {
  return (
    String(value || '')
      .split('.')
      .map((part) => cleanIdentifier(part))
      .filter(Boolean)
      .pop() || ''
  )
}

export function parseColumnList(value: string): string[] {
  return splitSqlDefinitions(value)
    .map((name) => cleanIdentifier(name))
    .filter(Boolean)
}

export function parseColumnListFromConstraint(line: string): string[] {
  const match = line.match(/\(([^)]+)\)/)
  return match ? parseColumnList(match[1]) : []
}

export function extractConstraintName(line: string): string {
  const match = line.match(/^\s*CONSTRAINT\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)/i)
  return match ? cleanIdentifier(match[1]) : ''
}

interface ReferenceTarget {
  table: string
  columns: string[]
}

export function parseReferenceTarget(line: string): ReferenceTarget | null {
  const pattern = new RegExp(`\\bREFERENCES\\s+(${IDENTIFIER}(?:\\s*\\.\\s*${IDENTIFIER})?)\\s*\\(([^)]+)\\)`, 'i')
  const match = line.match(pattern)
  if (!match) return null

  return {
    table: cleanTableIdentifier(match[1].replace(/\s*\.\s*/g, '.')),
    columns: parseColumnList(match[2]),
  }
}

export interface ForeignKeyDefinition {
  table: string
  local_columns: string[]
  referenced_columns: string[]
  constraint_name: string
}

export function parseForeignKeyConstraint(line: string, constraintName = ''): ForeignKeyDefinition | null {
  const localMatch = line.match(/\bFOREIGN\s+KEY\s*\(([^)]+)\)/i)
  const target = parseReferenceTarget(line)
  if (!localMatch || !target) return null

  return {
    table: target.table,
    local_columns: parseColumnList(localMatch[1]),
    referenced_columns: target.columns,
    constraint_name: constraintName,
  }
}

export function parseInlineForeignKey(line: string, columnName: string): ForeignKeyDefinition | null {
  const target = parseReferenceTarget(line)
  if (!target) return null

  return {
    table: target.table,
    local_columns: [columnName],
    referenced_columns: target.columns,
    constraint_name: '',
  }
}

export function parseAlterTableForeignKeys(sql: string, tables: TableModel[]): void {
  const tableMap = new Map((tables || []).map((table) => [table.name, table]))
  const alterRegex = new RegExp(
    `\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${IDENTIFIER}(?:\\s*\\.\\s*${IDENTIFIER})?)\\s+ADD\\s+(?:CONSTRAINT\\s+(${IDENTIFIER})\\s+)?FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s+REFERENCES\\s+(${IDENTIFIER}(?:\\s*\\.\\s*${IDENTIFIER})?)\\s*\\(([^)]+)\\)`,
    'gi',
  )

  let match = alterRegex.exec(sql)
  while (match !== null) {
    const tableName = cleanTableIdentifier(match[1].replace(/\s*\.\s*/g, '.'))
    const table = tableMap.get(tableName)
    if (table) {
      addParentRelationship(table, {
        table: cleanTableIdentifier(match[4].replace(/\s*\.\s*/g, '.')),
        local_columns: parseColumnList(match[3]),
        referenced_columns: parseColumnList(match[5]),
        constraint_name: cleanIdentifier(match[2] || ''),
      })
    }
    match = alterRegex.exec(sql)
  }
}

export function markColumnAsPrimaryKey(table: TableModel, columnName: string): void {
  const column = (table.columns || []).find((col) => col.name === columnName)
  if (column) column.primary_key = true
}

export function markColumnAsForeignKey(table: TableModel, columnName: string): void {
  const column = (table.columns || []).find((col) => col.name === columnName)
  if (column) column.foreign_key = true
}

export function normalizeRelationship(relationship: Partial<RelationshipModel>): RelationshipModel {
  return {
    table: relationship.table || '',
    local_columns: [...(relationship.local_columns || [])],
    referenced_columns: [...(relationship.referenced_columns || [])],
    constraint_name: relationship.constraint_name || '',
    description: relationship.description || '',
    reviewed: relationship.reviewed ?? false,
  }
}

export function addParentRelationship(table: TableModel, relationship: Partial<RelationshipModel>): void {
  table.relationships = table.relationships || { parents: [], children: [] }
  relationship.local_columns?.forEach((columnName) => {
    markColumnAsForeignKey(table, columnName)
  })
  table.relationships.parents.push(normalizeRelationship(relationship))
}

export function relationshipKey(relationship: RelationshipModel): string {
  return [
    relationship.table,
    (relationship.local_columns || []).join(','),
    (relationship.referenced_columns || []).join(','),
  ].join('|')
}

export function dedupeRelationships(relationships: RelationshipModel[]): RelationshipModel[] {
  const seen = new Set<string>()
  return (relationships || []).filter((relationship) => {
    const key = relationshipKey(relationship)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function normalizeRelationships(tables: TableModel[]): TableModel[] {
  const tableMap = new Map((tables || []).map((table) => [table.name, table]))

  ;(tables || []).forEach((table) => {
    table.relationships = table.relationships || { parents: [], children: [] }
    table.relationships.parents = dedupeRelationships(
      (table.relationships.parents || []).map(normalizeRelationship),
    )
    table.relationships.children = []
    ;(table.columns || []).forEach((column) => {
      column.primary_key = column.primary_key ?? false
      column.foreign_key = column.foreign_key ?? false
    })
    table.relationships.parents.forEach((relationship) => {
      relationship.local_columns.forEach((columnName) => {
        markColumnAsForeignKey(table, columnName)
      })
    })
  })

  ;(tables || []).forEach((childTable) => {
    ;(childTable.relationships.parents || []).forEach((parentRelationship) => {
      const parentTable = tableMap.get(parentRelationship.table)
      if (!parentTable) return

      parentTable.relationships.children.push(
        normalizeRelationship({
          table: childTable.name,
          local_columns: parentRelationship.referenced_columns,
          referenced_columns: parentRelationship.local_columns,
          constraint_name: parentRelationship.constraint_name,
        }),
      )
    })
  })

  ;(tables || []).forEach((table) => {
    table.relationships.parents = dedupeRelationships(table.relationships.parents)
    table.relationships.children = dedupeRelationships(table.relationships.children)
  })

  return tables
}

export function parseDatabaseName(sql: string): string | null {
  let capturedDbName: string | null = null
  let cleanSql = sql.replace(/--.*$/gm, '')
  cleanSql = cleanSql.replace(/\/\*[\s\S]*?\*\//g, '')

  const dbRegex =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:DATABASE|SCHEMA)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\w]+\.)?["`]?([\w]+)["`]?/gi
  let dbMatch = dbRegex.exec(cleanSql)
  while (dbMatch !== null) {
    capturedDbName = dbMatch[1]
    dbMatch = dbRegex.exec(cleanSql)
  }

  return capturedDbName
}

export function parseSQLToTables(sql: string): TableModel[] {
  const newTables: TableModel[] = []

  let cleanSql = sql.replace(/--.*$/gm, '')
  cleanSql = cleanSql.replace(/\/\*[\s\S]*?\*\//g, '')

  const tableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`\w]+\.)?["`]?([\w]+)["`]?\s*\(([\s\S]*?)\)(?:\s*;|\s+ENGINE|\s+$)/gi

  let match = tableRegex.exec(cleanSql)
  while (match !== null) {
    const tableName = match[1]
    const columnsContent = match[2]

    const tableObj: TableModel = {
      name: tableName,
      description: '',
      business_terms: [],
      reviewed: false,
      columns: [],
      status: 'NEW',
      relationships: { parents: [], children: [] },
    }

    const columnLines = splitSqlDefinitions(columnsContent)
    const pendingPrimaryColumns: string[] = []

    columnLines.forEach((line) => {
      const upperLine = line.toUpperCase().trim()
      const constraintName = extractConstraintName(line)

      if (upperLine.startsWith('PRIMARY KEY') || (upperLine.startsWith('CONSTRAINT') && upperLine.includes(' PRIMARY KEY'))) {
        pendingPrimaryColumns.push(...parseColumnListFromConstraint(line))
        return
      }

      if (upperLine.startsWith('FOREIGN KEY') || (upperLine.startsWith('CONSTRAINT') && upperLine.includes(' FOREIGN KEY'))) {
        const relationship = parseForeignKeyConstraint(line, constraintName)
        if (relationship) addParentRelationship(tableObj, relationship)
        return
      }

      if (
        upperLine.startsWith('CONSTRAINT') ||
        upperLine.startsWith('UNIQUE') ||
        upperLine.startsWith('CHECK') ||
        upperLine.startsWith('KEY ')
      ) {
        return
      }

      const colMatch = line.match(/["`]?([\w]+)["`]?\s+([^\s,()]+(?:\([^)]*\))?)/i)
      if (colMatch) {
        const column: ColumnModel = {
          name: colMatch[1],
          type: colMatch[2].toLowerCase(),
          primary_key: /\bPRIMARY\s+KEY\b/i.test(line),
          foreign_key: /\bREFERENCES\b/i.test(line),
          description: '',
          business_terms: [],
          reviewed: false,
          status: 'NEW',
        }
        tableObj.columns.push(column)

        const inlineRelationship = parseInlineForeignKey(line, column.name)
        if (inlineRelationship) addParentRelationship(tableObj, inlineRelationship)
      }
    })

    pendingPrimaryColumns.forEach((columnName) => {
      markColumnAsPrimaryKey(tableObj, columnName)
    })

    if (tableObj.columns.length > 0) {
      newTables.push(tableObj)
    }

    match = tableRegex.exec(cleanSql)
  }

  if (newTables.length === 0) {
    throw new Error("Nenhuma tabela encontrada. Verifique se o arquivo contém comandos 'CREATE TABLE' válidos.")
  }

  parseAlterTableForeignKeys(cleanSql, newTables)
  normalizeRelationships(newTables)
  return newTables
}
