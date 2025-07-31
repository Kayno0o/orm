/* eslint-disable no-alert */

import type { DBField } from '.'
import { colors, randomString } from '@kaynooo/utils'
import { describeColumn, getTableColumns, getUniqueFields, runQuery } from '.'

export interface SQLOperation {
  description: string
  query: string
  params?: any[]
  critical?: boolean // for operations like DROP TABLE
}

export class DatabaseMigrator {
  private confirmMigrations: boolean
  private dryRun: boolean

  constructor() {
    this.confirmMigrations = import.meta.env.CONFIRM_DB_MIGRATIONS === 'true'
    this.dryRun = !this.confirmMigrations
  }

  private logDryRunOperation(operation: SQLOperation, tableName: string): void {
    if (!this.dryRun)
      return

    console.log(colors.yellow('🔍 Database migrations in DRY RUN mode - showing SQL without executing'))
    console.log(colors.gray('Set'), colors.bold.red('CONFIRM_DB_MIGRATIONS=true'), colors.gray('to enable actual migrations'))

    console.log(`\n${operation.critical ? colors.red('🚨 CRITICAL') : colors.blue('📝')} [DRY RUN] Database Operation for table ${colors.cyan(`'${tableName}'`)}:`)
    console.log(`${colors.gray('Description:')} ${operation.description}`)
    console.log(`${colors.gray('SQL:')} ${colors.yellow.rgb(0, 0, 0, 'bg')(operation.query)}`)
    if (operation.params?.length) {
      console.log(`${colors.gray('Parameters:')} ${colors.magenta(operation.params.join(', '))}`)
    }
  }

  private logDryRunBatch(operations: SQLOperation[], tableName: string): void {
    if (!this.dryRun || operations.length === 0)
      return

    console.log(colors.yellow('🔍 Database migrations in DRY RUN mode - showing SQL without executing'))
    console.log(colors.gray('Set'), colors.bold.red('CONFIRM_DB_MIGRATIONS=true'), colors.gray('to enable actual migrations'))

    console.log(`\n${colors.blue('📋')} [DRY RUN] Batch Database Operations for table ${colors.cyan(`'${tableName}'`)} ${colors.dim(`(${operations.length} operations)`)}:`)
    console.log()

    for (const [i, op] of operations.entries()) {
      const operationColor = op.critical ? colors.red : colors.white
      const numberColor = op.critical ? colors.red : colors.blue

      console.log(`${numberColor(`${i + 1}.`)} ${op.critical ? colors.red('🚨 CRITICAL: ') : ''}${operationColor(op.description)}`)
      console.log(`   ${colors.gray('SQL:')} ${colors.yellow.rgb(0, 0, 0, 'bg')(op.query)}`)
      if (op.params?.length) {
        console.log(`   ${colors.gray('Parameters:')} ${colors.magenta(op.params.join(', '))}`)
      }
    }
  }

  private async confirmOperation(operation: SQLOperation, tableName: string): Promise<boolean> {
    if (!this.confirmMigrations) {
      return true
    }

    console.log(`\n${operation.critical ? colors.red('🚨 CRITICAL') : colors.blue('📝')} Database Operation for table ${colors.cyan(`'${tableName}'`)}:`)
    console.log(`${colors.gray('Description:')} ${operation.description}`)
    console.log(`${colors.gray('SQL:')} ${colors.yellow.rgb(0, 0, 0, 'bg')(operation.query)}`)
    if (operation.params?.length) {
      console.log(`${colors.gray('Parameters:')} ${colors.magenta(operation.params.join(', '))}`)
    }

    const answer = prompt(`\n${colors.green('Execute this operation?')} ${colors.dim('(y/N):')} `)?.toLowerCase().trim()
    return answer === 'y' || answer === 'yes'
  }

  private async confirmBatchOperations(operations: SQLOperation[], tableName: string): Promise<boolean> {
    if (!this.confirmMigrations || operations.length === 0) {
      return true
    }

    console.log(`\n${colors.blue('📋')} Batch Database Operations for table ${colors.cyan(`'${tableName}'`)} ${colors.dim(`(${operations.length} operations)`)}:`)
    console.log()

    for (const [i, op] of operations.entries()) {
      const operationColor = op.critical ? colors.red : colors.white
      const numberColor = op.critical ? colors.red : colors.blue

      console.log(`${numberColor(`${i + 1}.`)} ${op.critical ? colors.red('🚨 CRITICAL: ') : ''}${operationColor(op.description)}`)
      console.log(`   ${colors.gray('SQL:')} ${colors.yellow.rgb(0, 0, 0, 'bg')(op.query)}`)
      if (op.params?.length) {
        console.log(`   ${colors.gray('Parameters:')} ${colors.magenta(op.params.join(', '))}`)
      }
    }

    console.log()
    console.log(colors.bold('Options:'))
    console.log(`${colors.green('y')} - Execute all operations`)
    console.log(`${colors.yellow('s')} - Execute operations one by one`)
    console.log(`${colors.red('n')} - Skip all operations`)

    const answer = prompt(`\n${colors.green('Choose an option')} ${colors.dim('(y/s/N):')} `)?.toLowerCase().trim()

    if (answer === 'y' || answer === 'yes') {
      return true
    }

    if (answer === 's' || answer === 'step') {
      // Execute operations one by one with confirmation
      for (const operation of operations) {
        const confirmed = await this.confirmOperation(operation, tableName)
        if (!confirmed) {
          console.log(colors.red('❌ Operation cancelled by user'))
          return false
        }
        try {
          runQuery(operation.query, operation.params)
          console.log(colors.green('✅ Operation completed successfully'))
        }
        catch (error) {
          console.error(colors.red('❌ Operation failed:'), error)
          const continueAnswer = prompt(`${colors.yellow('Continue with remaining operations?')} ${colors.dim('(y/N):')} `)?.toLowerCase().trim()
          if (continueAnswer !== 'y' && continueAnswer !== 'yes') {
            return false
          }
        }
      }
      return false // Already executed, don't execute again
    }

    return false
  }

  private async promptDefaultValue(columnName: string, field: DBField): Promise<any> {
    console.log(`\n${colors.yellow('⚠️')} Column '${colors.cyan(columnName)}' is NOT NULL but table has existing data`)
    console.log(`${colors.gray('Type:')} ${field.type}`)

    const defaultValue = prompt(`${colors.green('Enter default value for existing rows:')} `)

    if (!defaultValue) {
      console.log(colors.red('❌ Default value required for NOT NULL column'))
      process.exit(1)
    }

    return defaultValue
  }

  private async promptColumnMapping(tableName: string, existingColumns: any[], newFields: Record<string, DBField>): Promise<Record<string, string> | null> {
    const oldColumns = existingColumns.filter(col => col.name !== 'id').map(col => col.name)
    const newColumns = Object.keys(newFields)

    console.log(`\n${colors.yellow('🔄')} Column mapping required for table ${colors.cyan(`'${tableName}'`)}`)
    console.log(`${colors.gray('Old columns:')} ${colors.blue(oldColumns.join(', '))}`)
    console.log(`${colors.gray('New columns:')} ${colors.green(newColumns.join(', '))}`)
    console.log()

    const mapping: Record<string, string> = {}

    for (const newColumn of newColumns) {
      console.log(colors.bold(`Map old column to new column '${colors.green(newColumn)}':`))
      for (const [i, oldColumn] of oldColumns.entries()) {
        console.log(`${colors.blue(`${i + 1}.`)} ${oldColumn}`)
      }
      console.log(`${colors.dim('s')} - Skip (no mapping, data will be lost)`)

      const answer = prompt(`${colors.green('Enter number or s:')} `)?.toLowerCase().trim() || ''

      if (answer === 's' || answer === 'skip') {
        console.log(colors.yellow(`⚠️  No mapping for '${newColumn}' - data will be lost`))
        continue
      }

      const index = Number.parseInt(answer) - 1
      if (index >= 0 && index < oldColumns.length) {
        const oldColumn = oldColumns[index]
        mapping[newColumn] = oldColumn
        console.log(colors.green(`✓ Mapped '${oldColumn}' → '${newColumn}'`))
      }
      else {
        console.log(colors.red(`Invalid selection for '${newColumn}' - skipping`))
      }
    }

    if (Object.keys(mapping).length === 0) {
      console.log(colors.yellow('⚠️  No column mappings created'))
      const proceed = prompt(`${colors.red('Proceed without copying any data?')} ${colors.dim('(y/N):')} `)?.toLowerCase().trim()
      return proceed === 'y' || proceed === 'yes' ? {} : null
    }

    console.log(colors.green('📋 Column mapping summary:'))
    for (const [newCol, oldCol] of Object.entries(mapping)) {
      console.log(`  ${colors.blue(oldCol)} → ${colors.green(newCol)}`)
    }

    const confirm = prompt(`\n${colors.green('Confirm mapping?')} ${colors.dim('(Y/n):')} `)?.toLowerCase().trim()
    return confirm === '' || confirm === 'y' || confirm === 'yes' ? mapping : null
  }

  async safeRunQuery(
    query: string,
    params: any[] = [],
    description: string,
    tableName: string,
    critical = false,
  ): Promise<boolean> {
    const operation: SQLOperation = {
      description,
      query,
      params,
      critical,
    }

    // Show SQL in dry run mode
    if (this.dryRun) {
      this.logDryRunOperation(operation, tableName)
      return true // Pretend success in dry run
    }

    const confirmed = await this.confirmOperation(operation, tableName)
    if (!confirmed) {
      console.log(colors.red('❌ Operation cancelled by user'))
      return false
    }

    try {
      runQuery(query, params)
      console.log(colors.green('✅ Operation completed successfully'))
      return true
    }
    catch (error) {
      console.error(colors.red('❌ Operation failed:'), error)
      return false
    }
  }

  async migrateTable(tableName: string, fields: Record<string, DBField>, uniques: string[][]): Promise<void> {
    const columns = getTableColumns(tableName)

    if (columns.length) {
      const operations: SQLOperation[] = []
      let requiresRecreation = false

      // Check for missing columns
      const missingColumns = Object.keys(fields).filter(key => !columns.find(column => column.name === key))
      for (const missingColumn of missingColumns) {
        const columnDefinition = describeColumn(String(missingColumn), fields[missingColumn]!)
        if (columnDefinition.includes('UNIQUE')) {
          requiresRecreation = true
        }
        else {
          operations.push({
            description: `Add column '${missingColumn}' with definition: ${columnDefinition}`,
            query: `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`,
            params: [],
          })
        }
      }

      // Check for extra columns
      const extraColumns = columns.filter(column => !Object.keys(fields).includes(column.name))
      for (const extraColumn of extraColumns) {
        if (extraColumn.name === 'id')
          continue
        requiresRecreation = true
      }

      // Check nullable differences only on existing columns
      for (const column of columns) {
        const field = fields[column.name]
        if (field && Boolean(column.notnull) === field.nullable) {
          requiresRecreation = true
          break
        }
      }

      // Check unique constraints
      const dbUniqueFields = getUniqueFields(tableName)
      const uniqueFields = Object.entries(fields).filter(([,value]) => value.unique).map(([key]) => key)

      for (const uniqueField of uniqueFields) {
        if (!dbUniqueFields.includes(uniqueField)) {
          requiresRecreation = true
          break
        }
      }

      if (requiresRecreation) {
        if (this.dryRun) {
          await this.showRecreationPlan(tableName, fields, uniques, columns)
          process.exit(1)
        }

        await this.recreateTable(tableName, fields, uniques, columns)
        return
      }

      if (operations.length) {
        if (this.dryRun) {
          this.logDryRunBatch(operations, tableName)
          console.log(colors.gray(`[DRY RUN] Would update table '${tableName}' with ${operations.length} operations`))
          return
        }

        const confirmed = await this.confirmBatchOperations(operations, tableName)
        if (confirmed) {
          try {
            for (const operation of operations) {
              runQuery(operation.query, operation.params)
            }
            console.log(colors.green(`✅ Table '${tableName}' successfully updated`))
          }
          catch (error) {
            console.error(colors.red(`❌ Failed to update table '${tableName}':`), error)
          }
        }
      }

      return
    }

    // Table doesn't exist - create it
    if (this.dryRun) {
      await this.showCreateTablePlan(tableName, fields, uniques)
      process.exit(1)
    }

    await this.createTable(tableName, fields, uniques)
  }

  private async showRecreationPlan(tableName: string, fields: Record<string, DBField>, uniques: string[][], existingColumns: any[]): Promise<void> {
    const tmpTableName = `tmp_${tableName}_${randomString(3, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')}`

    // Build new table creation SQL
    const lines: string[] = ['id INTEGER PRIMARY KEY AUTOINCREMENT']
    for (const [fieldName, field] of Object.entries<DBField>(fields)) {
      lines.push(describeColumn(fieldName, field))
    }

    // Handle foreign key references
    for (const [fieldName, field] of Object.entries<DBField>(fields)) {
      if (field.reference) {
        const ref = typeof field.reference === 'string'
          ? { key: 'id', table: field.reference }
          : field.reference
        lines.push(`FOREIGN KEY (${fieldName}) REFERENCES ${ref.table}(${ref.key})`)
      }
    }

    // Handle unique constraints
    if (uniques) {
      for (const uniqueGroup of uniques) {
        const uniqueFields = Array.isArray(uniqueGroup) ? uniqueGroup.join(', ') : uniqueGroup
        lines.push(`UNIQUE(${uniqueFields})`)
      }
    }

    const commonColumns = existingColumns
      .map(col => col.name)
      .filter(name => name !== 'id' && Object.keys(fields).includes(name))

    let copyQuery = '-- No compatible columns to copy'
    if (commonColumns.length > 0) {
      copyQuery = `INSERT INTO ${tmpTableName} (${commonColumns.join(', ')}) SELECT ${commonColumns.join(', ')} FROM ${tableName}`
    }

    const recreationOperations: SQLOperation[] = [
      {
        description: `Create temporary table '${tmpTableName}' with new schema`,
        query: `CREATE TABLE ${tmpTableName} (${lines.join(', ')})`,
        params: [],
      },
      {
        description: commonColumns.length > 0
          ? `Copy compatible columns: ${commonColumns.join(', ')}`
          : 'No compatible columns found - no data would be copied',
        query: copyQuery,
        params: [],
      },
      {
        description: `Drop old table '${tableName}'`,
        query: `DROP TABLE ${tableName}`,
        params: [],
        critical: true,
      },
      {
        description: `Rename temporary table to '${tableName}'`,
        query: `ALTER TABLE ${tmpTableName} RENAME TO ${tableName}`,
        params: [],
      },
    ]

    this.logDryRunBatch(recreationOperations, tableName)
    console.log(colors.gray(`[DRY RUN] Would recreate table '${tableName}' with schema changes`))
  }

  private async showCreateTablePlan(tableName: string, fields: Record<string, DBField>, uniques: string[][]): Promise<void> {
    const lines: string[] = ['id INTEGER PRIMARY KEY AUTOINCREMENT']
    for (const [fieldName, field] of Object.entries<DBField>(fields)) {
      lines.push(describeColumn(fieldName, field))
    }

    for (const [fieldName, field] of Object.entries<DBField>(fields)) {
      if (field.reference) {
        const ref = typeof field.reference === 'string'
          ? { key: 'id', table: field.reference }
          : field.reference
        lines.push(`FOREIGN KEY (${fieldName}) REFERENCES ${ref.table}(${ref.key})`)
      }
    }

    if (uniques) {
      for (const uniqueGroup of uniques) {
        const uniqueFields = Array.isArray(uniqueGroup) ? uniqueGroup.join(', ') : uniqueGroup
        lines.push(`UNIQUE(${uniqueFields})`)
      }
    }

    const operation: SQLOperation = {
      description: `Create new table '${tableName}' with full schema`,
      query: `CREATE TABLE IF NOT EXISTS ${tableName} (${lines.join(', ')})`,
      params: [],
    }

    this.logDryRunOperation(operation, tableName)
    console.log(colors.gray(`[DRY RUN] Would create new table '${tableName}'`))
  }

  private async recreateTable(tableName: string, fields: Record<string, DBField>, uniques: string[][], existingColumns: any[]): Promise<void> {
    const tmpTableName = `tmp_${tableName}_${randomString(3, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')}`

    // Build new table creation SQL
    const lines: string[] = ['id INTEGER PRIMARY KEY AUTOINCREMENT']
    for (const [fieldName, field] of Object.entries<DBField>(fields)) {
      lines.push(describeColumn(fieldName, field))
    }

    // Handle foreign key references
    for (const [fieldName, field] of Object.entries<DBField>(fields)) {
      if (field.reference) {
        const ref = typeof field.reference === 'string'
          ? { key: 'id', table: field.reference }
          : field.reference
        lines.push(`FOREIGN KEY (${fieldName}) REFERENCES ${ref.table}(${ref.key})`)
      }
    }

    // Handle unique constraints
    if (uniques) {
      for (const uniqueGroup of uniques) {
        const uniqueFields = Array.isArray(uniqueGroup) ? uniqueGroup.join(', ') : uniqueGroup
        lines.push(`UNIQUE(${uniqueFields})`)
      }
    }

    // Check for compatible columns for data migration
    const commonColumns = existingColumns
      .map(col => col.name)
      .filter(name => name !== 'id' && Object.keys(fields).includes(name))

    let copyQuery = '-- No compatible columns to copy'
    let copyDescription = 'No compatible columns found - no data will be copied'

    // Check if we have existing data
    const hasExistingData = existingColumns.length > 1 // more than just 'id'

    // Handle new NOT NULL columns that need defaults
    const newNotNullColumns: Record<string, any> = {}
    if (hasExistingData) {
      for (const [fieldName, field] of Object.entries(fields)) {
        const isNewColumn = !existingColumns.find(col => col.name === fieldName)
        if (isNewColumn && field.nullable === false) {
          newNotNullColumns[fieldName] = await this.promptDefaultValue(fieldName, field)
        }
      }
    }

    if (commonColumns.length === 0) {
      // Prompt user for column mapping
      const mapping = await this.promptColumnMapping(tableName, existingColumns, fields)

      if (mapping === null) {
        console.log(colors.red('❌ Migration cancelled by user'))
        return
      }

      if (Object.keys(mapping).length > 0 || Object.keys(newNotNullColumns).length > 0) {
        const allNewColumns = [...Object.keys(mapping), ...Object.keys(newNotNullColumns)]
        const allValues = [
          ...Object.values(mapping),
          ...Object.keys(newNotNullColumns).map(col => `'${newNotNullColumns[col]}'`),
        ]
        copyQuery = `INSERT INTO ${tmpTableName} (${allNewColumns.join(', ')}) SELECT ${allValues.join(', ')} FROM ${tableName}`

        const mappingDesc = Object.entries(mapping).map(([newCol, oldCol]) => `${oldCol}→${newCol}`).join(', ')
        const defaultsDesc = Object.entries(newNotNullColumns).map(([col, val]) => `${col}='${val}'`).join(', ')
        copyDescription = [mappingDesc, defaultsDesc].filter(Boolean).join(', ')
      }
      else {
        copyDescription = 'User chose to proceed without copying data'
      }
    }
    else {
      const allColumns = [...commonColumns, ...Object.keys(newNotNullColumns)]
      const allValues = [
        ...commonColumns,
        ...Object.keys(newNotNullColumns).map(col => `'${newNotNullColumns[col]}'`),
      ]
      copyQuery = `INSERT INTO ${tmpTableName} (${allColumns.join(', ')}) SELECT ${allValues.join(', ')} FROM ${tableName}`

      const compatibleDesc = `Copy compatible columns: ${commonColumns.join(', ')}`
      const defaultsDesc = Object.keys(newNotNullColumns).length > 0
        ? `Default values: ${Object.entries(newNotNullColumns).map(([col, val]) => `${col}='${val}'`).join(', ')}`
        : ''
      copyDescription = [compatibleDesc, defaultsDesc].filter(Boolean).join(', ')
    }

    const recreationOperations: SQLOperation[] = [
      {
        description: `Create temporary table '${tmpTableName}' with new schema`,
        query: `CREATE TABLE ${tmpTableName} (${lines.join(', ')})`,
        params: [],
      },
      {
        description: copyDescription,
        query: copyQuery,
        params: [],
      },
      {
        description: `Drop old table '${tableName}'`,
        query: `DROP TABLE ${tableName}`,
        params: [],
        critical: true,
      },
      {
        description: `Rename temporary table to '${tableName}'`,
        query: `ALTER TABLE ${tmpTableName} RENAME TO ${tableName}`,
        params: [],
      },
    ]

    const confirmed = await this.confirmBatchOperations(recreationOperations, tableName)
    if (confirmed) {
      try {
        for (const operation of recreationOperations) {
          if (operation.query.startsWith('--'))
            continue // Skip comment queries
          runQuery(operation.query, operation.params)
        }
        console.log(colors.green(`✅ Table '${tableName}' successfully recreated`))
      }
      catch (error) {
        console.error(colors.red(`❌ Failed to recreate table '${tableName}':`), error)
      }
    }
  }

  private async createTable(tableName: string, fields: Record<string, DBField>, uniques: string[][]): Promise<void> {
    const lines: string[] = ['id INTEGER PRIMARY KEY AUTOINCREMENT']
    for (const [fieldName, field] of Object.entries<DBField>(fields)) {
      lines.push(describeColumn(fieldName, field))
    }

    for (const [fieldName, field] of Object.entries<DBField>(fields)) {
      if (field.reference) {
        const ref = typeof field.reference === 'string'
          ? { key: 'id', table: field.reference }
          : field.reference
        lines.push(`FOREIGN KEY (${fieldName}) REFERENCES ${ref.table}(${ref.key})`)
      }
    }

    if (uniques) {
      for (const uniqueGroup of uniques) {
        const uniqueFields = Array.isArray(uniqueGroup) ? uniqueGroup.join(', ') : uniqueGroup
        lines.push(`UNIQUE(${uniqueFields})`)
      }
    }

    await this.safeRunQuery(`CREATE TABLE IF NOT EXISTS ${tableName} (${lines.join(', ')})`, [], `Create new table '${tableName}' with full schema`, tableName)
  }
}
