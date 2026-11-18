import type {
  ColumnModel,
  DatabaseModel,
  RelationshipModel,
  TableModel,
} from '@dbmapper/domain'
import { normalizeRelationships } from '@dbmapper/sql-parser'
import { buildProjectContext } from '../persistence/context'
import type { ProjectAggregate, ProjectRecord, RelationshipRecord } from '../persistence/ports'

function cloneRelationship(relationship: RelationshipModel): RelationshipModel {
  return {
    table: relationship.table,
    local_columns: [...relationship.local_columns],
    referenced_columns: [...relationship.referenced_columns],
    constraint_name: relationship.constraint_name,
    description: relationship.description,
    reviewed: relationship.reviewed,
  }
}

export function normalizeDatabaseModel(database: DatabaseModel): DatabaseModel {
  const tables: TableModel[] = database.tables.map((table) => ({
    name: table.name,
    description: table.description,
    business_terms: [...table.business_terms],
    reviewed: table.reviewed,
    status: table.status,
    columns: table.columns.map((column) => ({ ...column, business_terms: [...column.business_terms] })),
    relationships: {
      parents: (table.relationships?.parents ?? []).map(cloneRelationship),
      children: [],
    },
  }))

  normalizeRelationships(tables)

  return {
    name: database.name,
    description: database.description,
    business_terms: [...database.business_terms],
    reviewed: database.reviewed,
    tables,
  }
}

function relationshipToModel(relationship: RelationshipRecord): RelationshipModel {
  return {
    table: relationship.targetTable,
    local_columns: [...relationship.localColumns],
    referenced_columns: [...relationship.referencedColumns],
    constraint_name: relationship.constraintName,
    description: relationship.description,
    reviewed: relationship.reviewed,
  }
}

export function databaseFromAggregate(aggregate: ProjectAggregate): DatabaseModel {
  const context = buildProjectContext(aggregate)

  const tables: TableModel[] = aggregate.tables.map((table) => {
    const columns: ColumnModel[] = (context.columnsByTableId.get(table.id) ?? []).map((column) => ({
      name: column.name,
      type: column.type,
      primary_key: column.primaryKey,
      foreign_key: column.foreignKey,
      description: column.description,
      business_terms: [...column.businessTerms],
      reviewed: column.reviewed,
      status: column.status,
    }))

    const parents = (context.relationshipsByTableId.get(table.id) ?? []).map(relationshipToModel)

    return {
      name: table.name,
      description: table.description,
      business_terms: [...table.businessTerms],
      reviewed: table.reviewed,
      status: table.status,
      columns,
      relationships: { parents, children: [] },
    }
  })

  normalizeRelationships(tables)

  return {
    name: aggregate.project.name,
    description: aggregate.project.description,
    business_terms: [...aggregate.project.businessTerms],
    reviewed: aggregate.project.reviewed,
    tables,
  }
}

export interface ProjectView {
  id: string
  name: string
  description: string
  businessTerms: string[]
  reviewed: boolean
  createdAt: string
  updatedAt: string
  table_ids: Record<string, string>
  database: DatabaseModel
}

export function projectView(aggregate: ProjectAggregate): ProjectView {
  const project: ProjectRecord = aggregate.project
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    businessTerms: [...project.businessTerms],
    reviewed: project.reviewed,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    table_ids: Object.fromEntries(aggregate.tables.map((table) => [table.name, table.id])),
    database: databaseFromAggregate(aggregate),
  }
}
