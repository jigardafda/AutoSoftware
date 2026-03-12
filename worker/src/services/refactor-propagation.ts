import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Types of symbols that can be refactored
 */
export type SymbolType = 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'constant' | 'method';

/**
 * Information about a symbol being renamed/refactored
 */
export interface RefactorSymbol {
  name: string;
  newName?: string;
  type: SymbolType;
  definitionFile: string;
  definitionLine?: number;
}

/**
 * A file that needs to be updated as part of the refactor
 */
export interface AffectedFile {
  path: string;
  usageCount: number;
  usageLines: number[];
  isDefinition: boolean;
  changeType: 'modify' | 'rename' | 'delete';
}

/**
 * Result of refactor propagation analysis
 */
export interface RefactorPropagationResult {
  symbol: RefactorSymbol;
  affectedFiles: AffectedFile[];
  totalUsages: number;
  isMultiFile: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
  contextPrompt: string;
}

/**
 * File extensions to search for symbol usages
 */
const SEARCHABLE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi',
  '.go',
  '.rs',
  '.java', '.kt', '.scala',
  '.rb',
  '.php',
  '.cs',
  '.swift',
  '.vue', '.svelte',
];

/**
 * Directories to exclude from search
 */
const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '__pycache__',
  'vendor',
  'target',
  '.cargo',
  'coverage',
  '.nyc_output',
];

/**
 * Detect if a task description contains a rename/refactor operation
 */
export function detectRefactorIntent(description: string): RefactorSymbol | null {
  // Common patterns for rename requests
  const renamePatterns = [
    // "Rename X to Y"
    /rename\s+(?:the\s+)?(?:function|class|variable|method|type|interface|enum|constant)?\s*[`"']?(\w+)[`"']?\s+to\s+[`"']?(\w+)[`"']?/i,
    // "Change X to Y"
    /change\s+(?:the\s+)?(?:function|class|variable|method|name\s+of)?\s*[`"']?(\w+)[`"']?\s+to\s+[`"']?(\w+)[`"']?/i,
    // "Refactor X as Y" or "Refactor X to Y"
    /refactor\s+[`"']?(\w+)[`"']?\s+(?:as|to)\s+[`"']?(\w+)[`"']?/i,
    // "X should be renamed to Y"
    /[`"']?(\w+)[`"']?\s+should\s+be\s+renamed\s+to\s+[`"']?(\w+)[`"']?/i,
  ];

  for (const pattern of renamePatterns) {
    const match = description.match(pattern);
    if (match) {
      return {
        name: match[1],
        newName: match[2],
        type: detectSymbolType(description, match[1]),
        definitionFile: '', // Will be populated by findSymbolDefinition
      };
    }
  }

  return null;
}

/**
 * Detect the type of symbol from context
 */
function detectSymbolType(description: string, symbolName: string): SymbolType {
  const lowerDesc = description.toLowerCase();

  if (lowerDesc.includes('function') || lowerDesc.includes('method')) return 'function';
  if (lowerDesc.includes('class')) return 'class';
  if (lowerDesc.includes('variable') || lowerDesc.includes('var') || lowerDesc.includes('let') || lowerDesc.includes('const')) return 'variable';
  if (lowerDesc.includes('type')) return 'type';
  if (lowerDesc.includes('interface')) return 'interface';
  if (lowerDesc.includes('enum')) return 'enum';
  if (lowerDesc.includes('constant')) return 'constant';

  // Heuristics based on naming conventions
  if (/^[A-Z][a-z]/.test(symbolName)) return 'class'; // PascalCase likely class
  if (/^[A-Z_]+$/.test(symbolName)) return 'constant'; // ALL_CAPS likely constant
  if (/^I[A-Z]/.test(symbolName)) return 'interface'; // IFoo likely interface

  return 'function'; // Default to function
}

/**
 * Find all usages of a symbol in a codebase using grep
 */
export async function findSymbolUsages(
  repoPath: string,
  symbol: RefactorSymbol
): Promise<AffectedFile[]> {
  const affectedFiles: Map<string, AffectedFile> = new Map();

  try {
    // Build grep pattern - word boundary matching
    const grepPattern = `\\b${escapeRegex(symbol.name)}\\b`;

    // Build exclusion args
    const excludeArgs = EXCLUDED_DIRS.map(dir => `--exclude-dir=${dir}`).join(' ');
    const includeArgs = SEARCHABLE_EXTENSIONS.map(ext => `--include=*${ext}`).join(' ');

    // Run grep to find all occurrences
    const { stdout } = await execAsync(
      `grep -rn ${excludeArgs} ${includeArgs} -E "${grepPattern}" "${repoPath}" 2>/dev/null || true`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large codebases
    );

    if (!stdout.trim()) {
      return [];
    }

    // Parse grep output: file:line:content
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/^(.+?):(\d+):/);
      if (!match) continue;

      const filePath = match[1];
      const lineNumber = parseInt(match[2], 10);

      // Get relative path
      const relativePath = path.relative(repoPath, filePath);

      // Skip if in excluded directory (double-check)
      if (EXCLUDED_DIRS.some(dir => relativePath.startsWith(dir + '/'))) {
        continue;
      }

      if (affectedFiles.has(relativePath)) {
        const file = affectedFiles.get(relativePath)!;
        file.usageCount++;
        file.usageLines.push(lineNumber);
      } else {
        affectedFiles.set(relativePath, {
          path: relativePath,
          usageCount: 1,
          usageLines: [lineNumber],
          isDefinition: false,
          changeType: 'modify',
        });
      }
    }

    // Try to identify the definition file
    if (symbol.definitionFile) {
      const defFile = affectedFiles.get(symbol.definitionFile);
      if (defFile) {
        defFile.isDefinition = true;
      }
    } else {
      // Heuristic: definition is likely in file with most usages or matching name
      await identifyDefinitionFile(repoPath, symbol, affectedFiles);
    }

  } catch (error) {
    console.error('Error finding symbol usages:', error);
  }

  return Array.from(affectedFiles.values()).sort((a, b) => {
    // Definition first, then by usage count
    if (a.isDefinition && !b.isDefinition) return -1;
    if (!a.isDefinition && b.isDefinition) return 1;
    return b.usageCount - a.usageCount;
  });
}

/**
 * Try to identify which file contains the symbol definition
 */
async function identifyDefinitionFile(
  repoPath: string,
  symbol: RefactorSymbol,
  affectedFiles: Map<string, AffectedFile>
): Promise<void> {
  // Patterns that indicate definition (language-agnostic heuristics)
  const definitionPatterns = [
    // JavaScript/TypeScript
    new RegExp(`(?:export\\s+)?(?:const|let|var|function|class|interface|type|enum)\\s+${escapeRegex(symbol.name)}\\b`),
    // Python
    new RegExp(`(?:def|class)\\s+${escapeRegex(symbol.name)}\\s*[:(]`),
    // Go
    new RegExp(`(?:func|type|var|const)\\s+${escapeRegex(symbol.name)}\\b`),
    // Java/Kotlin/C#
    new RegExp(`(?:public|private|protected|internal)?\\s*(?:static)?\\s*(?:class|interface|enum)\\s+${escapeRegex(symbol.name)}\\b`),
  ];

  for (const [relativePath, file] of affectedFiles) {
    try {
      const content = await readFile(path.join(repoPath, relativePath), 'utf-8');

      for (const pattern of definitionPatterns) {
        if (pattern.test(content)) {
          file.isDefinition = true;
          symbol.definitionFile = relativePath;
          return; // Found definition, stop searching
        }
      }
    } catch {
      // File unreadable, skip
    }
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Analyze refactor propagation and generate context for the agent
 */
export async function analyzeRefactorPropagation(
  repoPath: string,
  symbol: RefactorSymbol
): Promise<RefactorPropagationResult> {
  const affectedFiles = await findSymbolUsages(repoPath, symbol);
  const totalUsages = affectedFiles.reduce((sum, f) => sum + f.usageCount, 0);
  const isMultiFile = affectedFiles.length >= 10;

  // Estimate complexity
  let complexity: 'low' | 'medium' | 'high' = 'low';
  if (affectedFiles.length > 20 || totalUsages > 100) {
    complexity = 'high';
  } else if (affectedFiles.length > 5 || totalUsages > 30) {
    complexity = 'medium';
  }

  // Generate context prompt for the agent
  const contextPrompt = generateRefactorContextPrompt(symbol, affectedFiles, totalUsages);

  return {
    symbol,
    affectedFiles,
    totalUsages,
    isMultiFile,
    estimatedComplexity: complexity,
    contextPrompt,
  };
}

/**
 * Generate a context prompt for the agent with refactor information
 */
function generateRefactorContextPrompt(
  symbol: RefactorSymbol,
  affectedFiles: AffectedFile[],
  totalUsages: number
): string {
  const lines: string[] = [
    '## Refactoring Context',
    '',
    `### Symbol to Refactor`,
    `- **Name**: \`${symbol.name}\``,
    symbol.newName ? `- **New Name**: \`${symbol.newName}\`` : '',
    `- **Type**: ${symbol.type}`,
    symbol.definitionFile ? `- **Definition**: ${symbol.definitionFile}` : '',
    '',
    `### Impact Analysis`,
    `- **Total files affected**: ${affectedFiles.length}`,
    `- **Total usages**: ${totalUsages}`,
    '',
    `### Files to Update (${affectedFiles.length} files)`,
    '',
  ];

  // List definition file first
  const definitionFile = affectedFiles.find(f => f.isDefinition);
  if (definitionFile) {
    lines.push(`**Definition file (update first):**`);
    lines.push(`- \`${definitionFile.path}\` (${definitionFile.usageCount} usages, lines: ${definitionFile.usageLines.slice(0, 5).join(', ')}${definitionFile.usageLines.length > 5 ? '...' : ''})`);
    lines.push('');
  }

  // List other files
  const otherFiles = affectedFiles.filter(f => !f.isDefinition);
  if (otherFiles.length > 0) {
    lines.push('**Files with usages:**');

    // Show up to 30 files, then summarize
    const filesToShow = otherFiles.slice(0, 30);
    for (const file of filesToShow) {
      const linePreview = file.usageLines.slice(0, 3).join(', ');
      const moreLines = file.usageLines.length > 3 ? ` (+${file.usageLines.length - 3} more)` : '';
      lines.push(`- \`${file.path}\` (${file.usageCount} usages, lines: ${linePreview}${moreLines})`);
    }

    if (otherFiles.length > 30) {
      lines.push(`- ... and ${otherFiles.length - 30} more files`);
    }
  }

  lines.push('');
  lines.push('### Refactoring Instructions');
  lines.push('');
  lines.push('1. **Update the definition first** - Modify the symbol at its source');
  lines.push('2. **Update imports/exports** - Ensure all import statements are updated');
  lines.push('3. **Update all usages** - Replace all occurrences in the listed files');
  lines.push('4. **Run tests** - Verify nothing is broken after the changes');
  lines.push('');
  lines.push('**IMPORTANT**: Make all changes atomically. If any file fails to update, the entire refactor should be considered incomplete.');

  return lines.filter(l => l !== '').join('\n');
}

/**
 * Group files into logical batches for coordinated changes
 */
export function groupFilesIntoBatches(
  affectedFiles: AffectedFile[],
  maxBatchSize: number = 10
): AffectedFile[][] {
  const batches: AffectedFile[][] = [];

  // First batch: definition file (if any)
  const definitionFiles = affectedFiles.filter(f => f.isDefinition);
  if (definitionFiles.length > 0) {
    batches.push(definitionFiles);
  }

  // Remaining files: group by directory for locality
  const remainingFiles = affectedFiles.filter(f => !f.isDefinition);
  const filesByDir: Map<string, AffectedFile[]> = new Map();

  for (const file of remainingFiles) {
    const dir = path.dirname(file.path);
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir)!.push(file);
  }

  // Create batches from directory groups
  let currentBatch: AffectedFile[] = [];

  for (const [_dir, files] of filesByDir) {
    for (const file of files) {
      currentBatch.push(file);

      if (currentBatch.length >= maxBatchSize) {
        batches.push(currentBatch);
        currentBatch = [];
      }
    }
  }

  // Push remaining files
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Generate a batch commit message
 */
export function generateBatchCommitMessage(
  symbol: RefactorSymbol,
  batch: AffectedFile[],
  batchIndex: number,
  totalBatches: number
): string {
  const action = symbol.newName ? `Rename ${symbol.name} to ${symbol.newName}` : `Refactor ${symbol.name}`;
  const scope = batch.length === 1
    ? path.dirname(batch[0].path)
    : `${batch.length} files`;

  if (totalBatches === 1) {
    return `refactor: ${action}`;
  }

  return `refactor: ${action} (batch ${batchIndex + 1}/${totalBatches}: ${scope})`;
}

/**
 * Check if a task should enable multi-file mode based on affected files
 */
export function shouldEnableMultiFileMode(affectedFiles: AffectedFile[]): boolean {
  return affectedFiles.length >= 10;
}

/**
 * Enhanced prompt additions for multi-file operations
 */
export function getMultiFileModePromptAdditions(
  fileCount: number,
  batches: AffectedFile[][]
): string {
  return `
## Multi-File Operation Mode

This task involves changes across ${fileCount} files. Follow these guidelines:

### Coordination Strategy
1. **Batch Processing**: Changes are organized into ${batches.length} logical batches
2. **Atomic Commits**: Each batch should result in a working state
3. **Rollback Safety**: If a batch fails, previous batches remain valid

### Best Practices
- Read all affected files before making changes to understand the full scope
- Start with the definition/source file, then update usages
- Group related files together for logical commits
- Run tests after each major batch if possible
- Use consistent formatting across all changed files

### Error Handling
- If you encounter an unexpected usage pattern, document it
- If a file cannot be modified (permissions, format), note it and continue
- Prefer partial completion over complete failure when safe to do so
`;
}
