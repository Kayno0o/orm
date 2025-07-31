import type { DBField, EntityInput, Identifiable, QueryOptions } from '.'
import { __definition, buildSelectQuery, buildUpdateQuery, getDB, queryAll, queryOne, runQuery } from '.'
import { DatabaseMigrator } from './migration'

export class AbstractRepository<T extends Identifiable> {
  fields: Record<string, DBField> = {}
  tableName: string
  uniques: string[][] = []
  private EntityConstructor: new (...data: any[]) => T
  private migrator: DatabaseMigrator

  constructor(EntityConstructor: new (...data: any[]) => T) {
    this.EntityConstructor = EntityConstructor
    const name = EntityConstructor.name
    this.tableName = __definition[name]!.tableName
    this.fields = __definition[name]!.fields
    this.uniques = __definition[name]!.uniques
    this.migrator = new DatabaseMigrator()
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

  persist(entity: EntityInput<T>): T {
    if ((entity as any).id)
      return this.update((entity as any).id, entity)
    return this.create(entity)
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

  async init() {
    await this.migrator.migrateTable(this.tableName, this.fields, this.uniques)
  }

  /** remove extra fields that are not in DB */
  trimEntityFields(entity: Partial<EntityInput<T>>): Partial<EntityInput<T>> {
    const columnNames = Object.keys(this.fields)
    return Object.fromEntries(Object.entries(entity).filter(([key]) => columnNames.includes(key))) as Partial<EntityInput<T>>
  }
}
