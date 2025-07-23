import type { DBField, EntityInput, Identifiable, QueryOptions } from '.'
import { randomString } from '@kaynooo/utils'
import { __definition, buildSelectQuery, buildUnique, buildUpdateQuery, describeColumn, getDB, getTableColumns, getUniqueFields, queryAll, queryOne, runQuery } from '.'

export class AbstractRepository<T extends Identifiable> {
  fields: Record<string, DBField> = {}
  tableName: string
  uniques: string[][] = []
  private EntityConstructor: new (...data: any[]) => T

  constructor(EntityConstructor: new (...data: any[]) => T) {
    this.EntityConstructor = EntityConstructor
    const name = EntityConstructor.name
    this.tableName = __definition[name]!.tableName
    this.fields = __definition[name]!.fields
    this.uniques = __definition[name]!.uniques
  }

  create(entity: EntityInput<T>): T {
    runQuery(...buildUpdateQuery<T>(this.tableName, this.trimEntityFields(entity)))
    const lastId = getDB().query<{ id: number }, any>('SELECT last_insert_rowid() as id').get()!
    return this.find(lastId.id)!
  }

  update(id: number, entity: Partial<EntityInput<T>>) {
    runQuery(...buildUpdateQuery<T>(this.tableName, this.trimEntityFields(entity), { where: { id } as any }))
    return this.find(id)!
  }

  delete(id: number): void {
    runQuery(`DELETE FROM ${this.tableName} WHERE id = ?`, [id])
  }

  find(id: number): T | null {
    const result = queryOne<any>(...buildSelectQuery<T>(this.tableName, { where: { id } as any }))
    return result ? this.instantiateEntity(result) : null
  }

  findAll(): T[] {
    const results = queryAll<any>(...buildSelectQuery<T>(this.tableName))
    return results.map(result => this.instantiateEntity(result))
  }

  findAllBy(options: QueryOptions<T>): T[] {
    const results = queryAll<any>(...buildSelectQuery<T>(this.tableName, options))
    return results.map(result => this.instantiateEntity(result))
  }

  findOneBy(options: QueryOptions<T>): T | null {
    const result = queryOne<any>(...buildSelectQuery<T>(this.tableName, options))
    return result ? this.instantiateEntity(result) : null
  }

  private instantiateEntity(data: any): T {
    const instance = Object.create(this.EntityConstructor.prototype)

    const tempInstance = new this.EntityConstructor({} as any)
    for (const key of Object.getOwnPropertyNames(tempInstance)) {
      if ((tempInstance as any)[key] !== undefined)
        instance[key] = (tempInstance as any)[key]
    }

    Object.assign(instance, data)
    return instance
  }

  init() {
    const columns = getTableColumns(this.tableName)

    if (columns.length) {
      const queries: string[] = []
      let requiresRecreation = false

      // check for missing columns
      const missingColumns = Object.keys(this.fields).filter(key => !columns.find(column => column.name === key))
      for (const missingColumn of missingColumns) {
        const columnDefinition = describeColumn(String(missingColumn), this.fields[missingColumn]!)
        if (columnDefinition.includes('UNIQUE')) {
          requiresRecreation = true
        }
        else {
          queries.push(`ALTER TABLE ${this.tableName} ADD COLUMN ${columnDefinition}`)
        }
      }

      // check for extra columns
      const extraColumns = columns.filter(column => !Object.keys(this.fields).includes(column.name))
      for (const extraColumn of extraColumns) {
        if (extraColumn.name === 'id')
          continue
        requiresRecreation = true
      }

      // check nullable differences only on existing columns
      for (const column of columns) {
        const field = this.fields[column.name]
        if (field && Boolean(column.notnull) === field.nullable) {
          requiresRecreation = true
          break
        }
      }

      const dbUniqueFields = getUniqueFields(this.tableName)

      const uniqueFields = Object.entries(this.fields).filter(([,value]) => value.unique).map(([key]) => key)

      for (const uniqueField of uniqueFields) {
        if (!dbUniqueFields.includes(uniqueField)) {
          requiresRecreation = true
          break
        }

        const index = dbUniqueFields.findIndex(dbUnique => dbUnique === uniqueField)
        if (index !== -1)
          dbUniqueFields.splice(index, 1)
      }

      for (const uniqueGroupArray of this.uniques) {
        const uniqueGroup = buildUnique(uniqueGroupArray)

        if (!dbUniqueFields.includes(uniqueGroup)) {
          requiresRecreation = true
          break
        }

        const index = dbUniqueFields.findIndex(dbUnique => dbUnique === uniqueGroup)
        if (index !== -1)
          dbUniqueFields.splice(index, 1)
      }

      if (dbUniqueFields.length)
        requiresRecreation = true

      if (requiresRecreation) {
        const tmpTableName = `tmp_${this.tableName}_${randomString(3, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')}`
        // 1: create the new table
        const lines: string[] = [`CREATE TABLE ${tmpTableName} (id INTEGER PRIMARY KEY AUTOINCREMENT`]
        for (const [fieldName, field] of Object.entries<DBField>(this.fields)) {
          lines.push(describeColumn(fieldName, field))
        }

        // handle foreign key references if any
        for (const [fieldName, field] of Object.entries<DBField>(this.fields)) {
          if (field.reference) {
            const ref = typeof field.reference === 'string'
              ? { key: 'id', table: field.reference }
              : field.reference
            lines.push(`FOREIGN KEY (${fieldName}) REFERENCES ${ref.table}(${ref.key})`)
          }
        }

        // handle unique constraints
        if (this.uniques) {
          for (const uniqueGroup of this.uniques) {
            const uniqueFields = Array.isArray(uniqueGroup) ? uniqueGroup.join(', ') : uniqueGroup
            lines.push(`UNIQUE(${uniqueFields})`)
          }
        }

        runQuery(`${lines.join(',')});`)

        // 2: copy data to the new table, adapting if columns changed
        const copyColumns = columns.map(column => column.name).filter(column => column !== 'id').join(', ')
        runQuery(`INSERT INTO ${tmpTableName} (${copyColumns}) SELECT ${copyColumns} FROM ${this.tableName};`)

        // 3: drop old table and rename the new one
        runQuery(`DROP TABLE ${this.tableName};`)
        runQuery(`ALTER TABLE ${tmpTableName} RENAME TO ${this.tableName};`)

        return
      }

      if (queries.length)
        runQuery(queries.join(';'))

      return
    }

    // if the table does not exist, create it with the full schema definition
    const lines: string[] = [`CREATE TABLE IF NOT EXISTS ${this.tableName} (id INTEGER PRIMARY KEY AUTOINCREMENT`]
    for (const [fieldName, field] of Object.entries<DBField>(this.fields)) {
      lines.push(describeColumn(fieldName, field))
    }

    for (const [fieldName, field] of Object.entries<DBField>(this.fields)) {
      if (field.reference) {
        const ref = typeof field.reference === 'string'
          ? { key: 'id', table: field.reference }
          : field.reference
        lines.push(`FOREIGN KEY (${fieldName}) REFERENCES ${ref.table}(${ref.key})`)
      }
    }

    if (this.uniques) {
      for (const uniqueGroup of this.uniques) {
        const uniqueFields = Array.isArray(uniqueGroup) ? uniqueGroup.join(', ') : uniqueGroup
        lines.push(`UNIQUE(${uniqueFields})`)
      }
    }

    runQuery(`${lines.join(',')});`)
  }

  /** remove extra fields that are not in DB */
  trimEntityFields(entity: Partial<EntityInput<T>>): Partial<EntityInput<T>> {
    const result = JSON.parse(JSON.stringify(entity))
    const columnNames = Object.keys(this.fields)
    for (const key in result) {
      if (!columnNames.includes(key))
        delete result[key]
    }
    return result
  }
}
