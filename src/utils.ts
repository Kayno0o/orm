import type { DBField, SqliteColumn, SqliteUnique } from '.'
import { isEmpty } from '@kaynooo/utils'
import { queryAll } from '.'

export function describeColumn(name: string, field: DBField): string {
  // handle string default value
  const text = field.type === 'text' ? `'${field.default}'` : String(field.default)
  const defaultQ = !isEmpty(field.default) ? ` DEFAULT ${text}` : undefined

  return `${name} ${field.type.toUpperCase()}${defaultQ ?? ''}${field.nullable ? '' : ' NOT NULL'}${field.unique ? ' UNIQUE' : ''}${field.primary ? ' PRIMARY KEY' : ''}`
}

export function isUnique(table: string, column: SqliteColumn): boolean {
  const uniques = queryAll<SqliteUnique>(`PRAGMA index_list(${table})`)
  return uniques.some(unique => unique.unique === column.cid)
}

export function describeSqliteColumn(table: string, column: SqliteColumn): string {
  const unique = isUnique(table, column)
  return `${column.name} ${column.type.toUpperCase()}${column.notnull ? ' NOT NULL' : ''}${unique ? ' UNIQUE' : ''}${column.pk ? ' PRIMARY KEY' : ''}`
}

export function getTableColumns(table: string): SqliteColumn[] {
  return queryAll<SqliteColumn>(`PRAGMA table_info(${table})`)
}

export function getTableUnique(table: string): SqliteUnique[] {
  return queryAll<SqliteUnique>(`PRAGMA index_list(${table})`).filter(unique => unique.unique)
}

export function buildUnique(uniques: string[]): string {
  return uniques.toSorted((a, b) => a.localeCompare(b)).join(':')
}

export function getUniqueFields(tableName: string): string[] {
  const uniqueFields = new Set<string>()

  // Step 1: Get all unique indexes for the table
  const indexes = getTableUnique(tableName).filter((index: any) => index.unique)

  // Step 2: For each unique index, extract the column names
  for (const index of indexes) {
    const columns = queryAll(`PRAGMA index_info(${index.name});`)
    uniqueFields.add(buildUnique(columns.map((col: any) => col.name)))
  }

  return Array.from(uniqueFields)
}
