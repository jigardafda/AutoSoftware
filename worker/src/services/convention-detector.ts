import { readFile, readdir } from 'fs/promises';
import path from 'path';

export interface DetectedConventions {
  indentStyle: 'tabs' | 'spaces' | 'mixed' | 'unknown';
  indentSize: number;
  quoteStyle: 'single' | 'double' | 'mixed' | 'unknown';
  semicolons: boolean | 'mixed' | 'unknown';
  namingConvention: {
    variables: 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed';
    functions: 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed';
    classes: 'PascalCase' | 'other';
    files: 'camelCase' | 'kebab-case' | 'snake_case' | 'PascalCase' | 'mixed';
  };
  frameworkPatterns: string[];
  existingUtilities: string[];
  testingFramework: string | null;
  lineEnding: 'lf' | 'crlf' | 'mixed';
}

const SAMPLE_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
const MAX_SAMPLE_FILES = 20;

export async function detectConventions(repoPath: string): Promise<DetectedConventions> {
  const conventions: DetectedConventions = {
    indentStyle: 'unknown',
    indentSize: 2,
    quoteStyle: 'unknown',
    semicolons: 'unknown',
    namingConvention: {
      variables: 'mixed',
      functions: 'mixed',
      classes: 'PascalCase',
      files: 'mixed',
    },
    frameworkPatterns: [],
    existingUtilities: [],
    testingFramework: null,
    lineEnding: 'lf',
  };

  try {
    // Check for config files first
    await detectFromConfigFiles(repoPath, conventions);

    // Sample source files
    const sampleFiles = await getSampleFiles(repoPath);

    if (sampleFiles.length > 0) {
      await analyzeSourceFiles(sampleFiles, conventions);
    }

    // Detect frameworks from package.json
    await detectFrameworks(repoPath, conventions);

    // Find existing utilities
    await findExistingUtilities(repoPath, conventions);

  } catch (err) {
    console.error('Error detecting conventions:', err);
  }

  return conventions;
}

async function detectFromConfigFiles(repoPath: string, conventions: DetectedConventions): Promise<void> {
  // Check .editorconfig
  try {
    const editorConfig = await readFile(path.join(repoPath, '.editorconfig'), 'utf-8');
    if (editorConfig.includes('indent_style = tab')) conventions.indentStyle = 'tabs';
    if (editorConfig.includes('indent_style = space')) conventions.indentStyle = 'spaces';
    const sizeMatch = editorConfig.match(/indent_size\s*=\s*(\d+)/);
    if (sizeMatch) conventions.indentSize = parseInt(sizeMatch[1]);
  } catch {
    // .editorconfig not found or unreadable
  }

  // Check .prettierrc
  try {
    const prettierConfig = await readFile(path.join(repoPath, '.prettierrc'), 'utf-8');
    const config = JSON.parse(prettierConfig);
    if (config.useTabs) conventions.indentStyle = 'tabs';
    else conventions.indentStyle = 'spaces';
    if (config.tabWidth) conventions.indentSize = config.tabWidth;
    if (config.singleQuote) conventions.quoteStyle = 'single';
    else conventions.quoteStyle = 'double';
    conventions.semicolons = config.semi !== false;
  } catch {
    // .prettierrc not found or unreadable
  }

  // Check ESLint
  try {
    const eslintFiles = ['.eslintrc.js', '.eslintrc.json', '.eslintrc'];
    for (const file of eslintFiles) {
      try {
        const content = await readFile(path.join(repoPath, file), 'utf-8');
        if (content.includes('quotes') && content.includes('single')) {
          conventions.quoteStyle = 'single';
        }
        break;
      } catch {
        // ESLint file not found
      }
    }
  } catch {
    // ESLint detection failed
  }
}

async function getSampleFiles(repoPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walkDir(dir: string, depth = 0): Promise<void> {
    if (depth > 5 || files.length >= MAX_SAMPLE_FILES) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= MAX_SAMPLE_FILES) break;

        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, .git, etc.
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__'].includes(entry.name)) {
            await walkDir(fullPath, depth + 1);
          }
        } else if (SAMPLE_FILE_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory unreadable
    }
  }

  await walkDir(repoPath);
  return files;
}

async function analyzeSourceFiles(files: string[], conventions: DetectedConventions): Promise<void> {
  let tabCount = 0;
  let spaceCount = 0;
  let singleQuoteCount = 0;
  let doubleQuoteCount = 0;
  let semicolonCount = 0;
  let noSemicolonCount = 0;
  let lfCount = 0;
  let crlfCount = 0;

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        // Indent analysis
        if (line.startsWith('\t')) tabCount++;
        else if (line.startsWith('  ')) spaceCount++;

        // Quote analysis (simple heuristic)
        singleQuoteCount += (line.match(/'/g) || []).length;
        doubleQuoteCount += (line.match(/"/g) || []).length;

        // Semicolon analysis (for JS/TS)
        if (file.match(/\.(js|ts|jsx|tsx)$/)) {
          if (line.trimEnd().endsWith(';')) semicolonCount++;
          else if (line.trim().length > 0 && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
            noSemicolonCount++;
          }
        }

        // Line ending
        if (line.endsWith('\r')) crlfCount++;
        else lfCount++;
      }
    } catch {
      // File unreadable
    }
  }

  // Determine conventions based on counts
  if (tabCount > spaceCount * 2) conventions.indentStyle = 'tabs';
  else if (spaceCount > tabCount * 2) conventions.indentStyle = 'spaces';
  else if (tabCount > 0 && spaceCount > 0) conventions.indentStyle = 'mixed';

  if (singleQuoteCount > doubleQuoteCount * 2) conventions.quoteStyle = 'single';
  else if (doubleQuoteCount > singleQuoteCount * 2) conventions.quoteStyle = 'double';
  else conventions.quoteStyle = 'mixed';

  if (semicolonCount > noSemicolonCount * 2) conventions.semicolons = true;
  else if (noSemicolonCount > semicolonCount * 2) conventions.semicolons = false;
  else conventions.semicolons = 'mixed';

  if (crlfCount > lfCount) conventions.lineEnding = 'crlf';
  else if (lfCount > 0 && crlfCount > 0 && crlfCount > lfCount / 10) conventions.lineEnding = 'mixed';
}

async function detectFrameworks(repoPath: string, conventions: DetectedConventions): Promise<void> {
  try {
    const packageJson = JSON.parse(await readFile(path.join(repoPath, 'package.json'), 'utf-8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // Detect frameworks
    if (deps.react) conventions.frameworkPatterns.push('React');
    if (deps.vue) conventions.frameworkPatterns.push('Vue');
    if (deps.angular || deps['@angular/core']) conventions.frameworkPatterns.push('Angular');
    if (deps.next) conventions.frameworkPatterns.push('Next.js');
    if (deps.express) conventions.frameworkPatterns.push('Express');
    if (deps.fastify) conventions.frameworkPatterns.push('Fastify');
    if (deps.nestjs || deps['@nestjs/core']) conventions.frameworkPatterns.push('NestJS');
    if (deps.prisma || deps['@prisma/client']) conventions.frameworkPatterns.push('Prisma');

    // Detect testing framework
    if (deps.jest) conventions.testingFramework = 'Jest';
    else if (deps.vitest) conventions.testingFramework = 'Vitest';
    else if (deps.mocha) conventions.testingFramework = 'Mocha';
    else if (deps.ava) conventions.testingFramework = 'AVA';

  } catch {
    // package.json not found or unreadable
  }
}

async function findExistingUtilities(repoPath: string, conventions: DetectedConventions): Promise<void> {
  const utilPaths = ['src/utils', 'src/lib', 'src/helpers', 'lib', 'utils', 'helpers'];

  for (const utilPath of utilPaths) {
    try {
      const fullPath = path.join(repoPath, utilPath);
      const entries = await readdir(fullPath);

      for (const entry of entries) {
        if (entry.endsWith('.ts') || entry.endsWith('.js')) {
          conventions.existingUtilities.push(`${utilPath}/${entry}`);
        }
      }
    } catch {
      // Utility path not found
    }
  }
}

export function formatConventionsPrompt(conventions: DetectedConventions): string {
  const lines: string[] = [
    '## Code Style Conventions',
    '',
  ];

  if (conventions.indentStyle !== 'unknown') {
    lines.push(`- Indentation: ${conventions.indentStyle}${conventions.indentStyle === 'spaces' ? ` (${conventions.indentSize} spaces)` : ''}`);
  }

  if (conventions.quoteStyle !== 'unknown') {
    lines.push(`- Quotes: ${conventions.quoteStyle}`);
  }

  if (conventions.semicolons !== 'unknown') {
    lines.push(`- Semicolons: ${conventions.semicolons === true ? 'always' : conventions.semicolons === false ? 'never' : 'mixed'}`);
  }

  if (conventions.frameworkPatterns.length > 0) {
    lines.push(`- Frameworks: ${conventions.frameworkPatterns.join(', ')}`);
  }

  if (conventions.testingFramework) {
    lines.push(`- Testing: ${conventions.testingFramework}`);
  }

  if (conventions.existingUtilities.length > 0) {
    lines.push('');
    lines.push('### Existing Utilities (prefer reusing over creating new):');
    for (const util of conventions.existingUtilities.slice(0, 10)) {
      lines.push(`- ${util}`);
    }
  }

  lines.push('');
  lines.push('IMPORTANT: Follow these conventions in all generated code.');

  return lines.join('\n');
}
