import type { RelationshipModel } from '@dbmapper/domain'

export function unknownTypeWarning(table: string, column: string, type: string): string {
  return `Tipo desconhecido "${type}" na coluna "${table}"."${column}"; emitido sem conversão.`
}

export function orphanForeignKeyWarning(table: string, relationship: RelationshipModel): string {
  const columns = relationship.local_columns.join(', ')
  return `Chave estrangeira de "${table}" (${columns}) referencia a tabela ausente "${relationship.table}"; instrução ignorada.`
}

export function unnamedForeignKeyWarning(table: string, relationship: RelationshipModel): string {
  const columns = relationship.local_columns.join(', ')
  return `Chave estrangeira de "${table}" (${columns}) sem nome de constraint; remoção ignorada.`
}

export function typeChangeWarning(table: string, column: string, previousType: string, currentType: string): string {
  return `Tipo da coluna "${table}"."${column}" mudou de "${previousType}" para "${currentType}"; a alteração pode perder dados.`
}

export function removedTableWarning(table: string): string {
  return `Tabela "${table}" removida sem mapeamento de renomeação; os dados serão perdidos.`
}

export function removedColumnWarning(table: string, column: string): string {
  return `Coluna "${table}"."${column}" removida sem mapeamento de renomeação; os dados serão perdidos.`
}

export function invalidTableRenameWarning(from: string, to: string, reason: string): string {
  return `Renomeação de tabela "${from}" -> "${to}" ignorada: ${reason}.`
}

export function invalidColumnRenameWarning(from: string, to: string, reason: string): string {
  return `Renomeação de coluna "${from}" -> "${to}" ignorada: ${reason}.`
}
