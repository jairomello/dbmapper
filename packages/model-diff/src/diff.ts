import type {
  ColumnModel,
  DatabaseModel,
  RelationshipModel,
  TableModel,
  TableRelationshipsModel,
} from '@dbmapper/domain'
import { normalizeRelationship, normalizeRelationships, relationshipKey } from '@dbmapper/sql-parser'

export interface TableRow {
  id: string
  kind: 'same' | 'oldOnly' | 'newOnly'
  oldName: string
  newName: string
  action: 'keep' | 'delete' | 'add' | 'rename'
  renameTo: string
  disabledBy?: string
}

export interface ColumnRow {
  id: string
  kind: 'same' | 'changed' | 'oldOnly' | 'newOnly'
  oldName: string
  newName: string
  oldType: string
  newType: string
  action: 'keep' | 'delete' | 'add' | 'rename'
  renameTo: string
  disabledBy?: string
}

export interface TablePlan {
  kind: 'matched' | 'renamed' | 'delete' | 'add'
  oldName: string
  newName: string
}

export interface ColumnGroup {
  tableKind: TablePlan['kind']
  oldTableName: string
  newTableName: string
  rows: ColumnRow[]
}

export interface RelationshipRow {
  kind: 'same' | 'oldOnly' | 'newOnly'
  oldRelationship: RelationshipModel | null
  newRelationship: RelationshipModel | null
  action: 'keep' | 'delete' | 'add'
}

export interface RelationshipGroup {
  tableName: string
  oldTableName: string
  rows: RelationshipRow[]
}

export interface UpdateWizardState {
  step: string
  oldTables: TableModel[]
  newTables: TableModel[]
  tableRows: TableRow[]
  columnGroups: ColumnGroup[]
  relationshipGroups: RelationshipGroup[]
}

export function cloneColumn(column: Partial<ColumnModel>, overrides: Partial<ColumnModel> = {}): ColumnModel {
  return {
    name: column.name || '',
    type: column.type || '',
    primary_key: column.primary_key ?? false,
    foreign_key: column.foreign_key ?? false,
    description: column.description || '',
    business_terms: [...(column.business_terms || [])],
    reviewed: column.reviewed ?? false,
    status: column.status || 'UNCHANGED',
    ...overrides,
  }
}

export function cloneTable(table: Partial<TableModel>, overrides: Partial<TableModel> = {}): TableModel {
  const relationships: TableRelationshipsModel = {
    parents: (table.relationships?.parents || []).map(normalizeRelationship),
    children: (table.relationships?.children || []).map(normalizeRelationship),
  }

  return {
    name: table.name || '',
    description: table.description || '',
    business_terms: [...(table.business_terms || [])],
    reviewed: table.reviewed ?? false,
    columns: (table.columns || []).map((col) => cloneColumn(col)),
    relationships,
    status: table.status || 'UNCHANGED',
    ...overrides,
  }
}

export function createUpdateWizardState(currentDatabase: Pick<DatabaseModel, 'tables'>, newTables: TableModel[]): UpdateWizardState {
  const oldTables = normalizeRelationships(
    (currentDatabase.tables || [])
      .filter((table) => table.status !== 'REMOVED')
      .map((table) => cloneTable(table)),
  )
  const importedTables = normalizeRelationships(newTables.map((table) => cloneTable(table)))
  const tableRows = buildTableRows(oldTables, importedTables)

  return {
    step: 'upload',
    oldTables,
    newTables: importedTables,
    tableRows,
    columnGroups: [],
    relationshipGroups: [],
  }
}

export function buildTableRows(oldTables: TableModel[], newTables: TableModel[]): TableRow[] {
  const matchedNewNames = new Set<string>()
  const rows: TableRow[] = []

  oldTables.forEach((oldTable) => {
    const newTable = newTables.find((table) => table.name === oldTable.name)
    if (newTable) {
      matchedNewNames.add(newTable.name)
      rows.push({
        id: `table:${oldTable.name}`,
        kind: 'same',
        oldName: oldTable.name,
        newName: newTable.name,
        action: 'keep',
        renameTo: '',
      })
    } else {
      rows.push({
        id: `table-old:${oldTable.name}`,
        kind: 'oldOnly',
        oldName: oldTable.name,
        newName: '',
        action: 'delete',
        renameTo: '',
      })
    }
  })

  newTables.forEach((newTable) => {
    if (!matchedNewNames.has(newTable.name)) {
      rows.push({
        id: `table-new:${newTable.name}`,
        kind: 'newOnly',
        oldName: '',
        newName: newTable.name,
        action: 'add',
        renameTo: '',
        disabledBy: '',
      })
    }
  })

  return rows
}

export function getUsedTableRenameTargets(tableRows: TableRow[]): Set<string> {
  return new Set(
    tableRows
      .filter((row) => row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo)
      .map((row) => row.renameTo),
  )
}

export function buildTablePlans(state: UpdateWizardState): TablePlan[] {
  const usedRenameTargets = getUsedTableRenameTargets(state.tableRows)
  const plans: TablePlan[] = []

  state.tableRows.forEach((row) => {
    if (row.kind === 'same') {
      plans.push({
        kind: 'matched',
        oldName: row.oldName,
        newName: row.newName,
      })
      return
    }

    if (row.kind === 'oldOnly') {
      if (row.action === 'rename' && row.renameTo) {
        plans.push({
          kind: 'renamed',
          oldName: row.oldName,
          newName: row.renameTo,
        })
      } else {
        plans.push({
          kind: 'delete',
          oldName: row.oldName,
          newName: '',
        })
      }
      return
    }

    if (row.kind === 'newOnly' && !usedRenameTargets.has(row.newName)) {
      plans.push({
        kind: 'add',
        oldName: '',
        newName: row.newName,
      })
    }
  })

  return plans
}

export function buildColumnGroups(state: UpdateWizardState): ColumnGroup[] {
  return buildTablePlans(state).map((plan) => {
    const oldTable = state.oldTables.find((table) => table.name === plan.oldName)
    const newTable = state.newTables.find((table) => table.name === plan.newName)
    const rows = buildColumnRows(oldTable, newTable, plan)

    return {
      tableKind: plan.kind,
      oldTableName: plan.oldName,
      newTableName: plan.newName,
      rows,
    }
  })
}

export function buildColumnRows(
  oldTable: TableModel | undefined,
  newTable: TableModel | undefined,
  tablePlan: TablePlan,
): ColumnRow[] {
  if (tablePlan.kind === 'add') {
    return (newTable?.columns || []).map((col) => ({
      id: `col-new:${newTable?.name}:${col.name}`,
      kind: 'newOnly',
      oldName: '',
      newName: col.name,
      oldType: '',
      newType: col.type,
      action: 'add',
      renameTo: '',
      disabledBy: '',
    }))
  }

  if (tablePlan.kind === 'delete') {
    return (oldTable?.columns || []).map((col) => ({
      id: `col-old:${oldTable?.name}:${col.name}`,
      kind: 'oldOnly',
      oldName: col.name,
      newName: '',
      oldType: col.type,
      newType: '',
      action: 'delete',
      renameTo: '',
    }))
  }

  const matchedNewNames = new Set<string>()
  const rows: ColumnRow[] = []
  const oldColumns = oldTable?.columns || []
  const newColumns = newTable?.columns || []

  oldColumns.forEach((oldCol) => {
    const newCol = newColumns.find((col) => col.name === oldCol.name)
    if (newCol) {
      matchedNewNames.add(newCol.name)
      rows.push({
        id: `col:${oldTable?.name}:${oldCol.name}`,
        kind: oldCol.type === newCol.type ? 'same' : 'changed',
        oldName: oldCol.name,
        newName: newCol.name,
        oldType: oldCol.type,
        newType: newCol.type,
        action: 'keep',
        renameTo: '',
      })
    } else {
      rows.push({
        id: `col-old:${oldTable?.name}:${oldCol.name}`,
        kind: 'oldOnly',
        oldName: oldCol.name,
        newName: '',
        oldType: oldCol.type,
        newType: '',
        action: 'delete',
        renameTo: '',
      })
    }
  })

  newColumns.forEach((newCol) => {
    if (!matchedNewNames.has(newCol.name)) {
      rows.push({
        id: `col-new:${newTable?.name}:${newCol.name}`,
        kind: 'newOnly',
        oldName: '',
        newName: newCol.name,
        oldType: '',
        newType: newCol.type,
        action: 'add',
        renameTo: '',
        disabledBy: '',
      })
    }
  })

  return rows
}

export function getUsedColumnRenameTargets(group: ColumnGroup): Set<string> {
  return new Set(
    group.rows
      .filter((row) => row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo)
      .map((row) => row.renameTo),
  )
}

export function applyUpdateWizardState(database: DatabaseModel, state: UpdateWizardState): DatabaseModel {
  const resultTables: TableModel[] = []
  const columnGroupsByNewName = new Map(
    state.columnGroups.map((group) => [group.newTableName || group.oldTableName, group]),
  )

  buildTablePlans(state).forEach((plan) => {
    const oldTable = state.oldTables.find((table) => table.name === plan.oldName)
    const newTable = state.newTables.find((table) => table.name === plan.newName)

    if (plan.kind === 'delete') return

    if (plan.kind === 'add') {
      if (!newTable) return
      resultTables.push(
        cloneTable(newTable, {
          description: '',
          business_terms: [],
          reviewed: false,
          status: 'NEW',
          relationships: {
            parents: (newTable.relationships?.parents || []).map(normalizeRelationship),
            children: (newTable.relationships?.children || []).map(normalizeRelationship),
          },
          columns: newTable.columns.map((col) =>
            cloneColumn(col, {
              description: '',
              business_terms: [],
              reviewed: false,
              status: 'NEW',
            }),
          ),
        }),
      )
      return
    }

    const group = columnGroupsByNewName.get(plan.newName)
    const usedRenameTargets = group ? getUsedColumnRenameTargets(group) : new Set<string>()
    const newColumns: ColumnModel[] = []

    if (!oldTable || !newTable || !group) return

    newTable.columns.forEach((newCol) => {
      const sameRow = group.rows.find(
        (row) => row.newName === newCol.name && (row.kind === 'same' || row.kind === 'changed'),
      )
      const renamedRow = group.rows.find(
        (row) => row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo === newCol.name,
      )
      const oldColName = renamedRow ? renamedRow.oldName : sameRow ? sameRow.oldName : ''
      const oldCol = oldColName ? oldTable.columns.find((col) => col.name === oldColName) : null

      if (oldCol) {
        newColumns.push(
          cloneColumn(oldCol, {
            name: newCol.name,
            type: newCol.type,
            primary_key: newCol.primary_key ?? false,
            foreign_key: newCol.foreign_key ?? false,
            status:
              (sameRow && sameRow.kind === 'changed') || oldCol.type !== newCol.type
                ? 'CHANGED'
                : 'UNCHANGED',
          }),
        )
      } else if (!usedRenameTargets.has(newCol.name)) {
        newColumns.push(
          cloneColumn(newCol, {
            description: '',
            business_terms: [],
            reviewed: false,
            status: 'NEW',
          }),
        )
      }
    })

    resultTables.push(
      cloneTable(oldTable, {
        name: newTable.name,
        columns: newColumns,
        relationships: {
          parents: (newTable.relationships?.parents || []).map(normalizeRelationship),
          children: (newTable.relationships?.children || []).map(normalizeRelationship),
        },
        status: plan.kind === 'renamed' ? 'RENAMED' : 'UNCHANGED',
      }),
    )
  })

  database.tables = normalizeRelationships(resultTables)
  database.reviewed = resultTables.length > 0 && resultTables.every((table) => table.reviewed)
  return database
}

export function buildTableNameMap(state: UpdateWizardState): Map<string, string> {
  const map = new Map<string, string>()
  buildTablePlans(state).forEach((plan) => {
    if (plan.kind !== 'delete' && plan.oldName) {
      map.set(plan.oldName, plan.newName)
    }
  })
  return map
}

export function buildColumnNameMaps(state: UpdateWizardState): Map<string, Map<string, string>> {
  const maps = new Map<string, Map<string, string>>()

  ;(state.columnGroups || []).forEach((group) => {
    if (!group.oldTableName || !group.newTableName) return

    const columnMap = new Map<string, string>()
    group.rows.forEach((row) => {
      if ((row.kind === 'same' || row.kind === 'changed') && row.oldName && row.newName) {
        columnMap.set(row.oldName, row.newName)
      }
      if (row.kind === 'oldOnly' && row.action === 'rename' && row.renameTo) {
        columnMap.set(row.oldName, row.renameTo)
      }
    })
    maps.set(group.oldTableName, columnMap)
  })

  return maps
}

export function mapColumnNames(columnNames: string[], columnMap: Map<string, string> | undefined): string[] {
  return (columnNames || []).map((columnName) =>
    columnMap?.has(columnName) ? columnMap.get(columnName)! : columnName,
  )
}

export function mapOldRelationship(
  relationship: RelationshipModel,
  currentOldTableName: string,
  tableNameMap: Map<string, string>,
  columnNameMaps: Map<string, Map<string, string>>,
): RelationshipModel {
  const targetOldTableName = relationship.table
  const currentColumnMap = columnNameMaps.get(currentOldTableName)
  const targetColumnMap = columnNameMaps.get(targetOldTableName)

  return normalizeRelationship({
    table: tableNameMap.get(targetOldTableName) || targetOldTableName,
    local_columns: mapColumnNames(relationship.local_columns, currentColumnMap),
    referenced_columns: mapColumnNames(relationship.referenced_columns, targetColumnMap),
    constraint_name: relationship.constraint_name,
  })
}

export function buildRelationshipGroups(state: UpdateWizardState): RelationshipGroup[] {
  const tableNameMap = buildTableNameMap(state)
  const columnNameMaps = buildColumnNameMaps(state)

  return buildTablePlans(state)
    .filter((plan) => plan.kind !== 'delete')
    .map((plan) => {
      const oldTable = state.oldTables.find((table) => table.name === plan.oldName)
      const newTable = state.newTables.find((table) => table.name === plan.newName)
      const oldRelationships = oldTable
        ? (oldTable.relationships?.parents || []).map((relationship) =>
            mapOldRelationship(relationship, oldTable.name, tableNameMap, columnNameMaps),
          )
        : []
      const newRelationships = newTable
        ? (newTable.relationships?.parents || []).map(normalizeRelationship)
        : []
      const matchedNewKeys = new Set<string>()
      const rows: RelationshipRow[] = []

      oldRelationships.forEach((oldRelationship) => {
        const key = relationshipKey(oldRelationship)
        const newRelationship = newRelationships.find((candidate) => relationshipKey(candidate) === key)
        if (newRelationship) {
          matchedNewKeys.add(key)
          rows.push({
            kind: 'same',
            oldRelationship,
            newRelationship,
            action: 'keep',
          })
        } else {
          rows.push({
            kind: 'oldOnly',
            oldRelationship,
            newRelationship: null,
            action: 'delete',
          })
        }
      })

      newRelationships.forEach((newRelationship) => {
        const key = relationshipKey(newRelationship)
        if (!matchedNewKeys.has(key)) {
          rows.push({
            kind: 'newOnly',
            oldRelationship: null,
            newRelationship,
            action: 'add',
          })
        }
      })

      return {
        tableName: plan.newName,
        oldTableName: plan.oldName,
        rows,
      }
    })
    .filter((group) => group.rows.length > 0)
}
