import { describe, expect, test } from 'bun:test'
import {
  DIALECT_TYPE_MAPS,
  normalizeTypeForComparison,
  quoteIdentifier,
  resolveColumnType,
} from './dialects'

const casos: Array<[string, string, string]> = [
  ['int', 'INTEGER', 'INTEGER'],
  ['integer', 'INTEGER', 'INTEGER'],
  ['serial', 'SERIAL', 'INT'],
  ['varchar(255)', 'VARCHAR(255)', 'VARCHAR(255)'],
  ['varchar', 'VARCHAR', 'VARCHAR'],
  ['char(2)', 'CHAR(2)', 'CHAR(2)'],
  ['text', 'TEXT', 'TEXT'],
  ['decimal(10,2)', 'DECIMAL(10,2)', 'DECIMAL(10,2)'],
  ['numeric(8, 3)', 'DECIMAL(8,3)', 'DECIMAL(8,3)'],
  ['date', 'DATE', 'DATE'],
  ['timestamp', 'TIMESTAMP', 'TIMESTAMP'],
  ['boolean', 'BOOLEAN', 'BOOLEAN'],
]

describe('mapa de tipos por dialeto', () => {
  for (const [entrada, postgres, mysql] of casos) {
    test(`mapeia ${entrada}`, () => {
      expect(resolveColumnType(entrada, 'postgres')).toEqual({ sqlType: postgres, known: true })
      expect(resolveColumnType(entrada, 'mysql')).toEqual({ sqlType: mysql, known: true })
    })
  }

  test('serial vira AUTO_INCREMENT no MySQL quando é PK', () => {
    expect(resolveColumnType('serial', 'mysql', true)).toEqual({ sqlType: 'INT AUTO_INCREMENT', known: true })
  })

  test('serial sem PK no MySQL vira INT', () => {
    expect(resolveColumnType('serial', 'mysql', false)).toEqual({ sqlType: 'INT', known: true })
  })

  test('tipo desconhecido é preservado e sinalizado', () => {
    expect(resolveColumnType('geometry(Point, 4326)', 'postgres')).toEqual({
      sqlType: 'geometry(Point, 4326)',
      known: false,
    })
  })

  test('tipo vazio é preservado e sinalizado', () => {
    expect(resolveColumnType('', 'postgres')).toEqual({ sqlType: '', known: false })
  })

  test('os dois dialetos compartilham os nomes-base do mapa', () => {
    expect(Object.keys(DIALECT_TYPE_MAPS.postgres).sort()).toEqual(Object.keys(DIALECT_TYPE_MAPS.mysql).sort())
  })
})

describe('comparação de tipos', () => {
  test('ignora caixa, espaços e apelidos', () => {
    expect(normalizeTypeForComparison(' INTEGER ')).toBe(normalizeTypeForComparison('int'))
    expect(normalizeTypeForComparison('numeric(8, 3)')).toBe(normalizeTypeForComparison('decimal(8,3)'))
  })

  test('mantém diferença de tamanho e tipo', () => {
    expect(normalizeTypeForComparison('varchar(100)')).not.toBe(normalizeTypeForComparison('varchar(255)'))
    expect(normalizeTypeForComparison('int')).not.toBe(normalizeTypeForComparison('text'))
  })
})

describe('quoting de identificadores', () => {
  test('postgres usa aspas duplas', () => {
    expect(quoteIdentifier('cliente', 'postgres')).toBe('"cliente"')
    expect(quoteIdentifier('no"me', 'postgres')).toBe('"no""me"')
  })

  test('mysql usa crases', () => {
    expect(quoteIdentifier('cliente', 'mysql')).toBe('`cliente`')
    expect(quoteIdentifier('no`me', 'mysql')).toBe('`no``me`')
  })
})
