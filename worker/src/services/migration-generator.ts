import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir, stat, access } from 'fs/promises';
import path from 'path';
import { simpleGit } from 'simple-git';

const execAsync = promisify(exec);

/**
 * Types of Prisma schema changes
 */
export type SchemaChangeType =
  | 'model_added'
  | 'model_removed'
  | 'field_added'
  | 'field_removed'
  | 'field_modified'
  | 'relation_added'
  | 'relation_removed'
  | 'enum_added'
  | 'enum_removed'
  | 'enum_value_added'
  | 'enum_value_removed'
  | 'index_added'
  | 'index_removed';

/**
 * A detected schema change
 */
export interface SchemaChange {
  type: SchemaChangeType;
  model?: string;
  field?: string;
  enumName?: string;
  details: string;
  potentialDataLoss: boolean;
  severity: 'safe' | 'caution' | 'dangerous';
}

/**
 * Result of schema change detection
 */
export interface SchemaChangeResult {
  hasChanges: boolean;
  changes: SchemaChange[];
  hasPotentialDataLoss: boolean;
  migrationRequired: boolean;
  summary: string;
}

/**
 * Result of migration generation
 */
export interface MigrationResult {
  success: boolean;
  migrationName?: string;
  migrationPath?: string;
  sqlContent?: string;
  error?: string;
  warnings: string[];
  dataLossWarnings: string[];
}

/**
 * Check if a Prisma schema file exists in the repository
 */
export async function findPrismaSchema(repoPath: string): Promise<string | null> {
  // Common Prisma schema locations
  const possiblePaths = [
    'prisma/schema.prisma',
    'schema.prisma',
    'db/schema.prisma',
    'database/schema.prisma',
  ];

  for (const schemaPath of possiblePaths) {
    const fullPath = path.join(repoPath, schemaPath);
    try {
      await access(fullPath);
      return schemaPath;
    } catch {
      // Path doesn't exist, continue
    }
  }

  return null;
}

/**
 * Detect if there are uncommitted Prisma schema changes
 */
export async function detectPrismaSchemaChanges(
  repoPath: string,
  baseBranch: string = 'main'
): Promise<SchemaChangeResult> {
  const schemaPath = await findPrismaSchema(repoPath);

  if (!schemaPath) {
    return {
      hasChanges: false,
      changes: [],
      hasPotentialDataLoss: false,
      migrationRequired: false,
      summary: 'No Prisma schema found in repository',
    };
  }

  const git = simpleGit(repoPath);

  try {
    // Get the diff for the schema file
    const diff = await git.diff([`origin/${baseBranch}`, '--', schemaPath]);

    if (!diff.trim()) {
      // Also check if file is new (untracked or staged)
      const status = await git.status();
      const schemaInChanges = status.files.some(
        f => f.path === schemaPath || f.path.endsWith('schema.prisma')
      );

      if (!schemaInChanges) {
        return {
          hasChanges: false,
          changes: [],
          hasPotentialDataLoss: false,
          migrationRequired: false,
          summary: 'No changes detected in Prisma schema',
        };
      }
    }

    // Parse the diff to detect specific changes
    const changes = parseSchemaDiff(diff);

    const hasPotentialDataLoss = changes.some(c => c.potentialDataLoss);
    const migrationRequired = changes.length > 0;

    return {
      hasChanges: true,
      changes,
      hasPotentialDataLoss,
      migrationRequired,
      summary: generateChangeSummary(changes),
    };

  } catch (error) {
    console.error('Error detecting schema changes:', error);
    return {
      hasChanges: false,
      changes: [],
      hasPotentialDataLoss: false,
      migrationRequired: false,
      summary: `Error detecting changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Parse a git diff of a Prisma schema to detect changes
 */
function parseSchemaDiff(diff: string): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const lines = diff.split('\n');

  let currentModel: string | null = null;
  let currentEnum: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current model/enum context
    const modelMatch = line.match(/^[\s+\-]?model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      currentEnum = null;

      if (line.startsWith('+')) {
        changes.push({
          type: 'model_added',
          model: currentModel,
          details: `New model: ${currentModel}`,
          potentialDataLoss: false,
          severity: 'safe',
        });
      } else if (line.startsWith('-')) {
        changes.push({
          type: 'model_removed',
          model: currentModel,
          details: `Removed model: ${currentModel}`,
          potentialDataLoss: true,
          severity: 'dangerous',
        });
      }
      continue;
    }

    const enumMatch = line.match(/^[\s+\-]?enum\s+(\w+)\s*\{/);
    if (enumMatch) {
      currentEnum = enumMatch[1];
      currentModel = null;

      if (line.startsWith('+')) {
        changes.push({
          type: 'enum_added',
          enumName: currentEnum,
          details: `New enum: ${currentEnum}`,
          potentialDataLoss: false,
          severity: 'safe',
        });
      } else if (line.startsWith('-')) {
        changes.push({
          type: 'enum_removed',
          enumName: currentEnum,
          details: `Removed enum: ${currentEnum}`,
          potentialDataLoss: true,
          severity: 'dangerous',
        });
      }
      continue;
    }

    // Detect field changes within a model
    if (currentModel && (line.startsWith('+') || line.startsWith('-'))) {
      const fieldMatch = line.match(/^[\+\-]\s+(\w+)\s+(\w+)(\??)\s*(.*)/);
      if (fieldMatch) {
        const [_, fieldName, fieldType, optional, rest] = fieldMatch;

        // Skip internal fields
        if (fieldName.startsWith('@@') || fieldName === '}') continue;

        if (line.startsWith('+')) {
          const isRequired = !optional;
          const hasDefault = rest.includes('@default');

          // Adding a required field without default is potentially dangerous
          const potentialDataLoss = isRequired && !hasDefault;

          changes.push({
            type: 'field_added',
            model: currentModel,
            field: fieldName,
            details: `New field: ${currentModel}.${fieldName} (${fieldType}${optional})`,
            potentialDataLoss,
            severity: potentialDataLoss ? 'caution' : 'safe',
          });
        } else if (line.startsWith('-')) {
          changes.push({
            type: 'field_removed',
            model: currentModel,
            field: fieldName,
            details: `Removed field: ${currentModel}.${fieldName}`,
            potentialDataLoss: true,
            severity: 'dangerous',
          });
        }
      }

      // Detect index changes
      const indexMatch = line.match(/^[\+\-]\s+@@index\(\[(.*?)\]\)/);
      if (indexMatch) {
        changes.push({
          type: line.startsWith('+') ? 'index_added' : 'index_removed',
          model: currentModel,
          details: `${line.startsWith('+') ? 'Added' : 'Removed'} index on ${currentModel}: [${indexMatch[1]}]`,
          potentialDataLoss: false,
          severity: 'safe',
        });
      }
    }

    // Detect enum value changes
    if (currentEnum && (line.startsWith('+') || line.startsWith('-'))) {
      const valueMatch = line.match(/^[\+\-]\s+(\w+)/);
      if (valueMatch && valueMatch[1] !== '}') {
        const valueName = valueMatch[1];

        if (line.startsWith('+')) {
          changes.push({
            type: 'enum_value_added',
            enumName: currentEnum,
            details: `Added enum value: ${currentEnum}.${valueName}`,
            potentialDataLoss: false,
            severity: 'safe',
          });
        } else {
          changes.push({
            type: 'enum_value_removed',
            enumName: currentEnum,
            details: `Removed enum value: ${currentEnum}.${valueName}`,
            potentialDataLoss: true,
            severity: 'dangerous',
          });
        }
      }
    }

    // Reset context when exiting a block
    if (line.trim() === '}') {
      currentModel = null;
      currentEnum = null;
    }
  }

  return changes;
}

/**
 * Generate a human-readable summary of schema changes
 */
function generateChangeSummary(changes: SchemaChange[]): string {
  if (changes.length === 0) {
    return 'No schema changes detected';
  }

  const summary: string[] = [`Detected ${changes.length} schema change(s):`];

  // Group by severity
  const dangerous = changes.filter(c => c.severity === 'dangerous');
  const caution = changes.filter(c => c.severity === 'caution');
  const safe = changes.filter(c => c.severity === 'safe');

  if (dangerous.length > 0) {
    summary.push('');
    summary.push(`**DANGEROUS (${dangerous.length})** - May cause data loss:`);
    dangerous.forEach(c => summary.push(`  - ${c.details}`));
  }

  if (caution.length > 0) {
    summary.push('');
    summary.push(`**CAUTION (${caution.length})** - Review carefully:`);
    caution.forEach(c => summary.push(`  - ${c.details}`));
  }

  if (safe.length > 0) {
    summary.push('');
    summary.push(`**SAFE (${safe.length})** - No data loss expected:`);
    safe.forEach(c => summary.push(`  - ${c.details}`));
  }

  return summary.join('\n');
}

/**
 * Generate a Prisma migration using `prisma migrate dev --create-only`
 */
export async function generateMigration(
  repoPath: string,
  migrationName: string
): Promise<MigrationResult> {
  const warnings: string[] = [];
  const dataLossWarnings: string[] = [];

  const schemaPath = await findPrismaSchema(repoPath);
  if (!schemaPath) {
    return {
      success: false,
      error: 'No Prisma schema found in repository',
      warnings: [],
      dataLossWarnings: [],
    };
  }

  try {
    // Ensure prisma is available
    await execAsync('npx prisma --version', { cwd: repoPath });
  } catch {
    warnings.push('Prisma CLI not found, attempting to install...');
    try {
      await execAsync('npm install prisma --save-dev', { cwd: repoPath });
    } catch (installError) {
      return {
        success: false,
        error: 'Failed to install Prisma CLI',
        warnings,
        dataLossWarnings: [],
      };
    }
  }

  // Sanitize migration name
  const safeMigrationName = migrationName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);

  try {
    // Run prisma migrate dev --create-only to generate migration without applying
    const { stdout, stderr } = await execAsync(
      `npx prisma migrate dev --create-only --name ${safeMigrationName} --schema ${schemaPath}`,
      {
        cwd: repoPath,
        timeout: 60000, // 60 second timeout
      }
    );

    // Parse output for warnings and migration path
    const output = stdout + '\n' + stderr;

    // Check for data loss warnings
    if (output.includes('Data loss')) {
      dataLossWarnings.push('Prisma detected potential data loss in this migration');
    }

    // Extract migration path from output
    const migrationPathMatch = output.match(/Created migration(?: at)?\s+([^\s]+)/i) ||
                               output.match(/prisma\/migrations\/(\d+_\w+)/);

    let migrationPath: string | undefined;
    let sqlContent: string | undefined;

    if (migrationPathMatch) {
      migrationPath = migrationPathMatch[1];

      // Try to read the generated SQL
      const fullMigrationPath = path.join(repoPath, migrationPath, 'migration.sql');
      try {
        sqlContent = await readFile(fullMigrationPath, 'utf-8');
      } catch {
        // Also try just the path directly if it's the full path
        try {
          sqlContent = await readFile(path.join(repoPath, 'prisma/migrations', migrationPath, 'migration.sql'), 'utf-8');
        } catch {
          warnings.push('Could not read generated migration SQL');
        }
      }
    }

    // Validate migration safety
    if (sqlContent) {
      const safetyCheck = validateMigrationSafety(sqlContent);
      dataLossWarnings.push(...safetyCheck.warnings);
    }

    return {
      success: true,
      migrationName: safeMigrationName,
      migrationPath,
      sqlContent,
      warnings,
      dataLossWarnings,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's because no changes are needed
    if (errorMessage.includes('No pending migrations') ||
        errorMessage.includes('database is up to date')) {
      return {
        success: true,
        warnings: ['Database schema is already up to date, no migration needed'],
        dataLossWarnings: [],
      };
    }

    return {
      success: false,
      error: `Failed to generate migration: ${errorMessage}`,
      warnings,
      dataLossWarnings,
    };
  }
}

/**
 * Validate migration SQL for potential data loss
 */
export function validateMigrationSafety(sql: string): { safe: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Dangerous patterns
  const dangerousPatterns = [
    { pattern: /DROP\s+TABLE/gi, message: 'DROP TABLE detected - will delete all data in the table' },
    { pattern: /DROP\s+COLUMN/gi, message: 'DROP COLUMN detected - will delete column data' },
    { pattern: /ALTER\s+TABLE.*?DROP/gi, message: 'Column drop detected' },
    { pattern: /TRUNCATE/gi, message: 'TRUNCATE detected - will delete all data' },
    { pattern: /DELETE\s+FROM/gi, message: 'DELETE statement detected' },
  ];

  // Caution patterns (not necessarily data loss but need review)
  const cautionPatterns = [
    { pattern: /ALTER\s+TABLE.*?ALTER\s+COLUMN.*?TYPE/gi, message: 'Column type change detected - verify data compatibility' },
    { pattern: /NOT\s+NULL/gi, message: 'NOT NULL constraint added - ensure all existing rows have values' },
    { pattern: /SET\s+DEFAULT/gi, message: 'Default value change - existing rows may be affected' },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(sql)) {
      warnings.push(`DANGEROUS: ${message}`);
    }
  }

  for (const { pattern, message } of cautionPatterns) {
    if (pattern.test(sql)) {
      warnings.push(`CAUTION: ${message}`);
    }
  }

  return {
    safe: warnings.filter(w => w.startsWith('DANGEROUS')).length === 0,
    warnings,
  };
}

/**
 * Get existing migrations in the repository
 */
export async function getExistingMigrations(repoPath: string): Promise<string[]> {
  const migrationsPath = path.join(repoPath, 'prisma/migrations');

  try {
    const entries = await readdir(migrationsPath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && /^\d{14}_/.test(e.name))
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Generate context prompt for migration-related tasks
 */
export function generateMigrationContextPrompt(
  schemaChanges: SchemaChangeResult,
  existingMigrations: string[]
): string {
  const lines: string[] = [
    '## Database Migration Context',
    '',
  ];

  if (schemaChanges.hasChanges) {
    lines.push('### Detected Schema Changes');
    lines.push(schemaChanges.summary);
    lines.push('');

    if (schemaChanges.hasPotentialDataLoss) {
      lines.push('### WARNING: Potential Data Loss');
      lines.push('');
      lines.push('This migration may cause data loss. Please:');
      lines.push('1. Review the changes carefully before applying');
      lines.push('2. Consider creating a backup migration strategy');
      lines.push('3. Test in a non-production environment first');
      lines.push('');
    }
  }

  if (existingMigrations.length > 0) {
    lines.push('### Existing Migrations');
    lines.push(`The repository has ${existingMigrations.length} existing migrations.`);
    lines.push('Latest migrations:');
    existingMigrations.slice(-5).forEach(m => {
      lines.push(`- ${m}`);
    });
    lines.push('');
  }

  lines.push('### Migration Guidelines');
  lines.push('');
  lines.push('1. **Generate migration**: Use `npx prisma migrate dev --create-only --name <name>`');
  lines.push('2. **Review SQL**: Always review the generated SQL before applying');
  lines.push('3. **Apply migration**: Use `npx prisma migrate dev` to apply');
  lines.push('4. **Update client**: Run `npx prisma generate` after schema changes');
  lines.push('');
  lines.push('**IMPORTANT**: Never run `prisma migrate reset` on production databases.');

  return lines.join('\n');
}

/**
 * Check if a task involves database/schema changes
 */
export function detectDatabaseTaskIntent(description: string): boolean {
  const databasePatterns = [
    /prisma/i,
    /schema/i,
    /migration/i,
    /database/i,
    /model\s+(add|create|update|delete|modify|change)/i,
    /field\s+(add|create|update|delete|modify|change)/i,
    /table\s+(add|create|update|delete|modify|change)/i,
    /column\s+(add|create|update|delete|modify|change)/i,
    /entity/i,
    /relation/i,
  ];

  return databasePatterns.some(pattern => pattern.test(description));
}
