import type { ColumnModel, DatabaseModel, RelationshipModel, TableModel } from '@dbmapper/domain'

export function column(name: string, type: string, overrides: Partial<ColumnModel> = {}): ColumnModel {
  return {
    name,
    type,
    primary_key: false,
    foreign_key: false,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
    ...overrides,
  }
}

export function relationship(
  table: string,
  localColumns: string[],
  referencedColumns: string[],
  constraintName = '',
): RelationshipModel {
  return {
    table,
    local_columns: localColumns,
    referenced_columns: referencedColumns,
    constraint_name: constraintName,
    description: '',
    reviewed: false,
  }
}

export function table(
  name: string,
  columns: ColumnModel[],
  parents: RelationshipModel[] = [],
  overrides: Partial<TableModel> = {},
): TableModel {
  return {
    name,
    description: '',
    business_terms: [],
    reviewed: false,
    status: 'UNCHANGED',
    relationships: { parents, children: [] },
    columns,
    ...overrides,
  }
}

export function model(name: string, tables: TableModel[]): DatabaseModel {
  return {
    name,
    description: '',
    business_terms: [],
    reviewed: false,
    tables,
  }
}
