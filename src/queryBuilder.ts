import type { PartialRecord } from '@kaynooo/utils'
import type { EntityInput, Identifiable, SQLQueryBindings } from '.'
import { queryAll, queryOne } from '.'

export interface QueryOptions<T extends Identifiable> {
  notNull?: PartialRecord<keyof T, boolean>
  order?: PartialRecord<keyof T, 'asc' | 'desc'>
  where?: { [K in keyof T]?: T[K] | T[K][] }
}

export function buildWhere<T extends Identifiable>(options: QueryOptions<T>): [string, SQLQueryBindings[]] {
  const where: string[] = []
  const params: SQLQueryBindings[] = []

  if (options.where) {
    for (const [key, value] of Object.entries(options.where)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          where.push('1 = 0')
          continue
        }

        if (value.length === 1) {
          where.push(`${key} = ?`)
          params.push(value[0] as SQLQueryBindings)
          continue
        }

        const placeholders = value.map(() => '?').join(', ')
        where.push(`${key} IN (${placeholders})`)
        params.push(...(value as SQLQueryBindings[]))
        continue
      }

      where.push(`${key} = ?`)
      params.push(value as SQLQueryBindings)
    }
  }

  if (options.notNull) {
    where.push(...Object.entries(options.notNull).map(([key, value]) => value ? `${key} IS NOT NULL` : `${key} IS NULL`))
  }

  if (where.length)
    return [` WHERE ${where.join(' AND ')} `, params]

  return ['', []]
}

export function buildOrder<T extends Identifiable>(options: QueryOptions<T>): string {
  if (options.order)
    return ` ORDER BY ${Object.entries(options.order).map(entry => entry.join(' ')).join(', ')} `

  return ''
}

export function buildSelectQuery<T extends Identifiable>(tableName: string, options?: QueryOptions<T>): [string, SQLQueryBindings[]] {
  let query = `SELECT * FROM ${tableName}`
  const params: SQLQueryBindings[] = []

  if (options) {
    const [whereQuery, whereParams] = buildWhere<T>(options)
    params.push(...whereParams)
    query += whereQuery

    query += buildOrder(options)
  }

  return [query, params]
}

export function buildUpdateQuery<T extends Identifiable>(tableName: string, entity: Partial<EntityInput<T>>, options?: QueryOptions<T>): [string, SQLQueryBindings[]] {
  const params: SQLQueryBindings[] = []

  const entries = Object.entries(entity).filter(([key]) => key !== 'id' && !key.startsWith('_'))
  if (!entries.length)
    return ['', []]

  let query: string
  params.push(...entries.map(([, value]) => value) as SQLQueryBindings[])

  if (options) {
    query = `UPDATE ${tableName} SET ${entries.map(([key]) => `${key} = ?`).join(', ')}`

    const [whereQuery, whereParams] = buildWhere<T>(options)
    params.push(...whereParams)
    query += whereQuery
  }
  else {
    query = `INSERT INTO ${tableName} (${entries.map(([key]) => key).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`
  }

  return [query, params]
}

export class QueryBuilder<T> {
  private _group: string[] = []
  private _having: string[] = []
  private _join: string[] = []
  private _leftJoin: string[] = []
  private _limit?: number
  private _offset?: number
  private _order: string[] = []
  private _params: SQLQueryBindings[] = []
  private _select: string[] = []
  private _where: string[] = []
  alias?: string
  tableName: string

  constructor(tableName: string, alias?: string) {
    this.tableName = tableName
    this.alias = alias
  }

  build(): [string, SQLQueryBindings[]] {
    let query = `SELECT ${this._select.length ? this._select.join(', ') : '*'} FROM ${this.tableName}`
    if (this.alias)
      query += ` AS ${this.alias}`

    if (this._join.length)
      query += ` ${this._join.join(' ')}`

    if (this._leftJoin.length)
      query += ` ${this._leftJoin.join(' ')}`

    if (this._where.length)
      query += ` WHERE ${this._where.join(' AND ')}`

    if (this._group.length)
      query += ` GROUP BY ${this._group.join(', ')}`

    if (this._having.length)
      query += ` HAVING ${this._having.join(' AND ')}`

    if (this._order.length)
      query += ` ORDER BY ${this._order.join(', ')}`

    if (this._limit)
      query += ` LIMIT ${this._limit}`

    if (this._offset)
      query += ` OFFSET ${this._offset}`

    return [query, this._params]
  }

  findAll(): T[] {
    return queryAll<T>(...this.build())
  }

  findOne(): T | null {
    return queryOne<T>(...this.build())
  }

  groupBy(...fields: string[]): this {
    this._group.push(...fields)
    return this
  }

  having(condition: string, ...params: SQLQueryBindings[]): this {
    this._having.push(condition)
    this._params.push(...params)
    return this
  }
  join(table: string, condition: string): this

  join(table: string, alias: string, condition?: string): this
  join(table: string, alias: string, condition?: string): this {
    if (condition)
      this._join.push(`JOIN ${table} AS ${alias} ON ${condition}`)
    else
      this._join.push(`JOIN ${table} ON ${alias}`)
    return this
  }
  leftJoin(table: string, condition: string): this

  leftJoin(table: string, alias: string, condition?: string): this

  leftJoin(table: string, alias: string, condition?: string): this {
    if (condition)
      this._leftJoin.push(`LEFT JOIN ${table} AS ${alias} ON ${condition}`)
    else
      this._leftJoin.push(`LEFT JOIN ${table} ON ${alias}`)
    return this
  }

  limit(limit: number): this {
    this._limit = limit
    return this
  }

  offset(offset: number): this {
    this._offset = offset
    return this
  }

  order(field: string, direction: 'asc' | 'desc'): this {
    this._order.push(`${field} ${direction}`)
    return this
  }

  select(...fields: string[]): this {
    this._select.push(...fields)
    return this
  }

  where(condition: string, ...params: SQLQueryBindings[]): this {
    this._where.push(condition)
    this._params.push(...params)
    return this
  }
}
