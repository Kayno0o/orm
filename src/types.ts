export type ExcludeFunctions<T> = {
  // eslint-disable-next-line ts/no-unsafe-function-type
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T]

type IgnoredFields = 'id' | `get${string}` | `${string}Computed` | `_${string}`

export type EntityInput<T extends Identifiable> =
  Required<Pick<T, {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? never :
      K extends IgnoredFields ? never :
        undefined extends T[K] ? never :
          null extends T[K] ? never :
            K
  }[keyof T]>> &
  Partial<Pick<T, {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? never :
      K extends IgnoredFields ? never :
        undefined extends T[K] ? K :
          null extends T[K] ? K :
            never
  }[keyof T]>>

export interface SqliteColumn {
  cid: number
  name: string
  notnull: number
  pk: number
  type: string
}

export interface SqliteUnique {
  name: string
  origin: string
  partial: number
  seq: number
  unique: number
}

export interface DBField {
  default?: any
  nullable?: boolean
  primary?: boolean
  reference?: string | { key: string, table: string }
  type: 'bool' | 'int' | 'float' | 'text' | 'blob'
  unique?: boolean
  name?: string
}

export type QueryEntityType<T extends Identifiable> = Omit<Pick<T, ExcludeFunctions<T>>, '__definition'>

export interface Identifiable {
  id: number
}

/** @description from bun:sqlite built-in package */
export type SQLQueryBindings =
  | string
  | bigint
  | NodeJS.TypedArray
  | number
  | boolean
  | null
  | Record<
    string,
    string | bigint | NodeJS.TypedArray | number | boolean | null
  >
