export interface TablePromptTarget {
  type: 'table' | 'column'
  itemId: string
  name: string
  columnType?: string
  primaryKey?: boolean
  foreignKey?: boolean
}

export interface TablePromptPayload {
  table: {
    id: string
    name: string
    description: string
    businessTerms: string[]
  }
  targets: TablePromptTarget[]
  describedColumns: Array<{ name: string; type: string; description: string }>
  foreignKeys: Array<{ column: string; targetTable: string }>
}

export const SYSTEM_PROMPT = [
  'Você é um especialista em modelagem de dados e dicionários de dados.',
  'Sua tarefa é escrever descrições curtas, factuais e em português do Brasil para tabelas e colunas de um banco de dados relacional.',
  'Use apenas as informações fornecidas no payload: não invente colunas, tabelas, tipos ou regras de negócio.',
  'Descreva o propósito do item e, quando útil, como ele se relaciona com os itens vizinhos descritos.',
  'Responda exclusivamente com JSON válido, sem comentários e sem markdown, no formato exato:',
  '{"suggestions":[{"item":"<nome exato do item>","description":"<descrição em português do Brasil>"}]}',
  'Inclua uma entrada para cada item listado em "targets", usando exatamente o campo "name" como "item".',
].join('\n')

export function buildTablePrompt(payload: TablePromptPayload): string {
  return JSON.stringify(payload)
}
