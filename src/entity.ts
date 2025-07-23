import type { Buffer } from 'node:buffer'
import type { DBField, Identifiable } from '.'

export const __definition: Record<string, EntityDefinition> = {}

export function Entity(tableName: string, options?: { unique?: string[][] }) {
  return function <T extends new (...args: any[]) => AbstractEntity>(constructor: T) {
    const name = constructor.name
    __definition[name] ??= { fields: {}, tableName: '', uniques: [] }
    __definition[name].tableName = tableName
    __definition[name].uniques = options?.unique ?? []
  }
}

interface DBTypeMap {
  bool: boolean
  int: number
  float: number
  text: string
  blob: Uint8Array | Buffer
}

export function Column<
  T extends keyof DBTypeMap,
  Options extends Omit<DBField, 'type'>,
>(
  type: T,
  options?: Options,
) {
  return function <Target extends AbstractEntity, Key extends keyof Target>(
    target: Target,
    key: Key & (Target[Key] extends (Options['nullable'] extends true ? DBTypeMap[T] | null : DBTypeMap[T]) ? Key : never),
  ) {
    const name = target.constructor.name
    __definition[name] ??= { fields: {}, tableName: '', uniques: [] }
    __definition[name].fields ??= {}

    __definition[name].fields[String(options?.name ?? key)] = { default: options?.default, nullable: options?.nullable, type, unique: options?.unique }
  }
}

export interface EntityDefinition {
  default?: any
  fields: Record<string, DBField>
  tableName: string
  uniques: string[][]
}

export class AbstractEntity implements Identifiable {
  id = 0
}
