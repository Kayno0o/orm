import type { SQLQueryBindings } from '.'
import { colors, declareLogger } from '@kaynooo/utils'
import { getDB } from '.'

const log = declareLogger({ logLevel: Number(import.meta?.env?.LOG_LEVEL ?? process.env?.LOG_LEVEL ?? 3) })

function dbLog(type: string, query: string, params: SQLQueryBindings[]) {
  if (import.meta.env.DEBUG_DB === 'true') {
    log('info', colors.blue('[sqlite]'), type, query, '|', params.join(', '))
  }
}

function error(type: string, error: Error) {
  log('error', colors.blue('[sqlite]'), `${type}:error`, error.message)
}

export function queryOne<T>(query: string, params: SQLQueryBindings[] = []): T | null {
  query = query.trim()
  dbLog('one', query, params)

  try {
    return getDB().prepare<T, any>(query).get(params)
  }
  catch (e: any) {
    error('one', e)
    return null
  }
}

export function queryAll<T>(query: string, params: SQLQueryBindings[] = []): T[] {
  query = query.trim()
  dbLog('all', query, params)

  try {
    return getDB().prepare<T, any>(query).all(params)
  }
  catch (e: any) {
    error('all', e)
    return [] as T[]
  }
}

export function runQuery(query: string, params: SQLQueryBindings[] = []): void {
  query = query.trim()
  dbLog('run', query, params)

  try {
    getDB().run(query, params)
  }
  catch (e: any) {
    error('run', e)
  }
}
