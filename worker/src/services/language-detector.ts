import { readFile, readdir } from 'fs/promises';
import path from 'path';

/**
 * Supported programming languages for analysis.
 */
export type ProgrammingLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'scala'
  | 'cpp'
  | 'c'
  | 'unknown';

/**
 * Language detection result with confidence.
 */
export interface LanguageDetection {
  language: ProgrammingLanguage;
  fileCount: number;
  lineCount: number;
  percentage: number;
}

/**
 * Repository language profile.
 */
export interface LanguageProfile {
  primaryLanguage: ProgrammingLanguage;
  languages: LanguageDetection[];
  frameworkHints: string[];
  strictModeEnabled: boolean;
  configFiles: string[];
}

/**
 * Language-specific rules and severity adjustments.
 */
export interface LanguageRules {
  language: ProgrammingLanguage;
  namingConventions: {
    variables: 'camelCase' | 'snake_case' | 'PascalCase' | 'any';
    functions: 'camelCase' | 'snake_case' | 'PascalCase' | 'any';
    classes: 'PascalCase' | 'any';
    constants: 'SCREAMING_SNAKE_CASE' | 'camelCase' | 'any';
    files: 'camelCase' | 'kebab-case' | 'snake_case' | 'PascalCase' | 'any';
  };
  severityAdjustments: {
    [issueType: string]: number; // Multiplier: >1 = more severe, <1 = less severe
  };
  specificRules: LanguageSpecificRule[];
}

/**
 * A language-specific rule for analysis.
 */
export interface LanguageSpecificRule {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'major' | 'minor' | 'nitpick';
  pattern?: RegExp;
  detector?: (code: string, filePath: string) => boolean;
}

/**
 * Extension to language mapping.
 */
const EXTENSION_LANGUAGE_MAP: Record<string, ProgrammingLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyw': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
};

/**
 * Framework config files that hint at the language/framework.
 */
const FRAMEWORK_CONFIG_FILES: Record<string, { language: ProgrammingLanguage; framework: string }> = {
  'package.json': { language: 'javascript', framework: 'Node.js' },
  'tsconfig.json': { language: 'typescript', framework: 'TypeScript' },
  'pyproject.toml': { language: 'python', framework: 'Python' },
  'requirements.txt': { language: 'python', framework: 'Python' },
  'Pipfile': { language: 'python', framework: 'Pipenv' },
  'setup.py': { language: 'python', framework: 'Python' },
  'go.mod': { language: 'go', framework: 'Go Modules' },
  'Cargo.toml': { language: 'rust', framework: 'Cargo' },
  'pom.xml': { language: 'java', framework: 'Maven' },
  'build.gradle': { language: 'java', framework: 'Gradle' },
  'build.gradle.kts': { language: 'kotlin', framework: 'Gradle Kotlin' },
  'Gemfile': { language: 'ruby', framework: 'Bundler' },
  'composer.json': { language: 'php', framework: 'Composer' },
  'Package.swift': { language: 'swift', framework: 'Swift Package Manager' },
  'build.sbt': { language: 'scala', framework: 'sbt' },
  'CMakeLists.txt': { language: 'cpp', framework: 'CMake' },
  'Makefile': { language: 'c', framework: 'Make' },
};

const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__', '.next', 'coverage', '.cache', 'target', 'bin', 'obj'];

/**
 * Get language-specific rules for a programming language.
 */
export function getLanguageRules(language: ProgrammingLanguage): LanguageRules {
  switch (language) {
    case 'typescript':
      return {
        language: 'typescript',
        namingConventions: {
          variables: 'camelCase',
          functions: 'camelCase',
          classes: 'PascalCase',
          constants: 'SCREAMING_SNAKE_CASE',
          files: 'camelCase', // or kebab-case
        },
        severityAdjustments: {
          'any_type_usage': 1.3, // More severe in TypeScript
          'missing_type_annotation': 1.2,
          'implicit_any': 1.2,
          'unused_variable': 0.9, // Slightly less severe (compiler catches)
          'null_check': 1.1,
        },
        specificRules: [
          {
            id: 'ts-strict-null-checks',
            name: 'Strict Null Checks',
            description: 'Potential null/undefined access without strict null checks',
            severity: 'major',
            pattern: /\w+\.\w+/,
          },
          {
            id: 'ts-any-type',
            name: 'Any Type Usage',
            description: 'Using "any" type defeats TypeScript\'s type safety',
            severity: 'minor',
            pattern: /:\s*any\b/,
          },
          {
            id: 'ts-non-null-assertion',
            name: 'Non-null Assertion',
            description: 'Non-null assertion (!) can hide potential runtime errors',
            severity: 'minor',
            pattern: /\w+!/,
          },
        ],
      };

    case 'javascript':
      return {
        language: 'javascript',
        namingConventions: {
          variables: 'camelCase',
          functions: 'camelCase',
          classes: 'PascalCase',
          constants: 'SCREAMING_SNAKE_CASE',
          files: 'camelCase',
        },
        severityAdjustments: {
          'missing_type_annotation': 0.5, // Not relevant for JS
          'unused_variable': 1.0,
          'null_check': 1.2, // More important without TypeScript
          'equality_check': 1.3, // == vs === is critical
        },
        specificRules: [
          {
            id: 'js-loose-equality',
            name: 'Loose Equality',
            description: 'Using == instead of === can lead to unexpected type coercion',
            severity: 'minor',
            pattern: /[^=!]==[^=]/,
          },
          {
            id: 'js-var-usage',
            name: 'Var Usage',
            description: 'Using "var" instead of "let" or "const"',
            severity: 'minor',
            pattern: /\bvar\s+\w+/,
          },
        ],
      };

    case 'python':
      return {
        language: 'python',
        namingConventions: {
          variables: 'snake_case',
          functions: 'snake_case',
          classes: 'PascalCase',
          constants: 'SCREAMING_SNAKE_CASE',
          files: 'snake_case',
        },
        severityAdjustments: {
          'missing_type_annotation': 0.7, // Optional in Python
          'unused_import': 1.1,
          'mutable_default_argument': 1.5, // Critical Python gotcha
          'bare_except': 1.4,
          'naming_convention': 1.2, // PEP 8 is important
        },
        specificRules: [
          {
            id: 'py-mutable-default',
            name: 'Mutable Default Argument',
            description: 'Mutable default arguments are shared across calls',
            severity: 'critical',
            pattern: /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\}|\bdict\(\)|\blist\(\))/,
          },
          {
            id: 'py-bare-except',
            name: 'Bare Except',
            description: 'Bare except catches all exceptions including KeyboardInterrupt',
            severity: 'major',
            pattern: /except\s*:/,
          },
          {
            id: 'py-string-format',
            name: 'Old String Format',
            description: 'Using % formatting instead of f-strings or .format()',
            severity: 'nitpick',
            pattern: /["']\s*%\s*[sd]/,
          },
        ],
      };

    case 'go':
      return {
        language: 'go',
        namingConventions: {
          variables: 'camelCase',
          functions: 'camelCase', // Public are PascalCase
          classes: 'PascalCase', // Go doesn't have classes, but structs
          constants: 'camelCase', // Go uses camelCase for constants
          files: 'snake_case',
        },
        severityAdjustments: {
          'error_not_handled': 1.5, // Critical in Go
          'unused_variable': 0, // Compiler error, not a finding
          'naming_convention': 1.3,
          'defer_in_loop': 1.4,
        },
        specificRules: [
          {
            id: 'go-error-ignored',
            name: 'Error Not Handled',
            description: 'Error return value is ignored',
            severity: 'critical',
            pattern: /\w+,\s*_\s*:?=\s*\w+\(/,
          },
          {
            id: 'go-defer-in-loop',
            name: 'Defer in Loop',
            description: 'Defer inside a loop can cause resource exhaustion',
            severity: 'major',
            pattern: /for\s*.*\{[^}]*defer\s/,
          },
          {
            id: 'go-naked-return',
            name: 'Naked Return',
            description: 'Naked returns can be confusing in long functions',
            severity: 'nitpick',
            pattern: /return\s*$/m,
          },
        ],
      };

    case 'rust':
      return {
        language: 'rust',
        namingConventions: {
          variables: 'snake_case',
          functions: 'snake_case',
          classes: 'PascalCase', // Structs/Enums
          constants: 'SCREAMING_SNAKE_CASE',
          files: 'snake_case',
        },
        severityAdjustments: {
          'unwrap_usage': 1.3, // Can panic
          'unsafe_block': 1.5,
          'unused_variable': 0.5, // Compiler warning
          'clone_usage': 0.8, // Sometimes necessary
        },
        specificRules: [
          {
            id: 'rs-unwrap',
            name: 'Unwrap Usage',
            description: 'Using unwrap() can cause panics on None/Err',
            severity: 'major',
            pattern: /\.unwrap\(\)/,
          },
          {
            id: 'rs-unsafe',
            name: 'Unsafe Block',
            description: 'Unsafe code requires careful review',
            severity: 'major',
            pattern: /unsafe\s*\{/,
          },
          {
            id: 'rs-expect',
            name: 'Expect Without Message',
            description: 'Using expect() with a descriptive message is better than unwrap()',
            severity: 'nitpick',
            pattern: /\.expect\(""\)/,
          },
        ],
      };

    case 'java':
      return {
        language: 'java',
        namingConventions: {
          variables: 'camelCase',
          functions: 'camelCase',
          classes: 'PascalCase',
          constants: 'SCREAMING_SNAKE_CASE',
          files: 'PascalCase', // Java files match class names
        },
        severityAdjustments: {
          'null_check': 1.2,
          'exception_swallowed': 1.4,
          'raw_type': 1.2,
          'unused_import': 0.8,
        },
        specificRules: [
          {
            id: 'java-null-check',
            name: 'Missing Null Check',
            description: 'Potential NullPointerException',
            severity: 'major',
          },
          {
            id: 'java-catch-exception',
            name: 'Catching Generic Exception',
            description: 'Catching Exception instead of specific exception types',
            severity: 'minor',
            pattern: /catch\s*\(\s*Exception\s/,
          },
          {
            id: 'java-raw-type',
            name: 'Raw Type Usage',
            description: 'Using raw types instead of parameterized types',
            severity: 'minor',
            pattern: /\bList\s+\w+\s*=/,
          },
        ],
      };

    default:
      return {
        language: 'unknown',
        namingConventions: {
          variables: 'any',
          functions: 'any',
          classes: 'any',
          constants: 'any',
          files: 'any',
        },
        severityAdjustments: {},
        specificRules: [],
      };
  }
}

/**
 * Count lines in a file.
 */
async function countLines(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * Check if TypeScript strict mode is enabled.
 */
async function checkStrictMode(repoPath: string): Promise<boolean> {
  try {
    const tsconfigPath = path.join(repoPath, 'tsconfig.json');
    const content = await readFile(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(content);
    return tsconfig?.compilerOptions?.strict === true;
  } catch {
    return false;
  }
}

/**
 * Detect the programming languages used in a repository.
 */
export async function detectLanguages(repoPath: string): Promise<LanguageProfile> {
  const languageCounts: Record<ProgrammingLanguage, { files: number; lines: number }> = {
    typescript: { files: 0, lines: 0 },
    javascript: { files: 0, lines: 0 },
    python: { files: 0, lines: 0 },
    go: { files: 0, lines: 0 },
    rust: { files: 0, lines: 0 },
    java: { files: 0, lines: 0 },
    csharp: { files: 0, lines: 0 },
    ruby: { files: 0, lines: 0 },
    php: { files: 0, lines: 0 },
    swift: { files: 0, lines: 0 },
    kotlin: { files: 0, lines: 0 },
    scala: { files: 0, lines: 0 },
    cpp: { files: 0, lines: 0 },
    c: { files: 0, lines: 0 },
    unknown: { files: 0, lines: 0 },
  };

  const frameworkHints: string[] = [];
  const configFiles: string[] = [];
  let strictModeEnabled = false;

  async function walkDir(dir: string, depth = 0): Promise<void> {
    if (depth > 8) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!EXCLUDED_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
            await walkDir(fullPath, depth + 1);
          }
        } else {
          // Check for framework config files
          if (FRAMEWORK_CONFIG_FILES[entry.name]) {
            const { framework } = FRAMEWORK_CONFIG_FILES[entry.name];
            if (!frameworkHints.includes(framework)) {
              frameworkHints.push(framework);
            }
            configFiles.push(entry.name);
          }

          // Count language files
          const ext = path.extname(entry.name).toLowerCase();
          const language = EXTENSION_LANGUAGE_MAP[ext];
          if (language) {
            languageCounts[language].files++;
            languageCounts[language].lines += await countLines(fullPath);
          }
        }
      }
    } catch {
      // Directory unreadable
    }
  }

  await walkDir(repoPath);

  // Check for TypeScript strict mode
  if (languageCounts.typescript.files > 0) {
    strictModeEnabled = await checkStrictMode(repoPath);
    if (strictModeEnabled) {
      frameworkHints.push('TypeScript Strict Mode');
    }
  }

  // Calculate totals and percentages
  const totalLines = Object.values(languageCounts).reduce((sum, c) => sum + c.lines, 0);

  // Convert to LanguageDetection array
  const languages: LanguageDetection[] = Object.entries(languageCounts)
    .filter(([_, counts]) => counts.files > 0)
    .map(([lang, counts]) => ({
      language: lang as ProgrammingLanguage,
      fileCount: counts.files,
      lineCount: counts.lines,
      percentage: totalLines > 0 ? (counts.lines / totalLines) * 100 : 0,
    }))
    .sort((a, b) => b.lineCount - a.lineCount);

  // Determine primary language
  const primaryLanguage = languages.length > 0 ? languages[0].language : 'unknown';

  return {
    primaryLanguage,
    languages,
    frameworkHints,
    strictModeEnabled,
    configFiles,
  };
}

/**
 * Apply language-specific severity adjustments to a finding.
 */
export function adjustSeverityForLanguage(
  baseSeverity: number,
  issueType: string,
  languageRules: LanguageRules
): number {
  const adjustment = languageRules.severityAdjustments[issueType];
  if (adjustment !== undefined) {
    return Math.min(10, Math.max(1, baseSeverity * adjustment));
  }
  return baseSeverity;
}

/**
 * Format language profile for inclusion in AI prompt.
 */
export function formatLanguageProfilePrompt(profile: LanguageProfile): string {
  const lines: string[] = [
    '## Repository Language Profile',
    '',
    `Primary Language: ${profile.primaryLanguage}`,
  ];

  if (profile.languages.length > 1) {
    lines.push('');
    lines.push('Language Distribution:');
    for (const lang of profile.languages.slice(0, 5)) {
      lines.push(`- ${lang.language}: ${lang.percentage.toFixed(1)}% (${lang.fileCount} files, ${lang.lineCount} lines)`);
    }
  }

  if (profile.frameworkHints.length > 0) {
    lines.push('');
    lines.push(`Frameworks/Tools: ${profile.frameworkHints.join(', ')}`);
  }

  if (profile.strictModeEnabled) {
    lines.push('');
    lines.push('TypeScript Strict Mode: Enabled');
  }

  // Add language-specific rules hint
  const rules = getLanguageRules(profile.primaryLanguage);
  if (rules.specificRules.length > 0) {
    lines.push('');
    lines.push('Language-Specific Focus Areas:');
    for (const rule of rules.specificRules) {
      lines.push(`- ${rule.name}: ${rule.description} [${rule.severity}]`);
    }
  }

  // Add naming conventions
  lines.push('');
  lines.push('Expected Naming Conventions:');
  lines.push(`- Variables: ${rules.namingConventions.variables}`);
  lines.push(`- Functions: ${rules.namingConventions.functions}`);
  lines.push(`- Classes: ${rules.namingConventions.classes}`);
  lines.push(`- Constants: ${rules.namingConventions.constants}`);
  lines.push(`- Files: ${rules.namingConventions.files}`);

  return lines.join('\n');
}

/**
 * Check code against language-specific rules.
 */
export async function checkLanguageSpecificRules(
  filePath: string,
  content: string,
  language: ProgrammingLanguage
): Promise<{ violations: { rule: LanguageSpecificRule; line?: number; snippet?: string }[] }> {
  const rules = getLanguageRules(language);
  const violations: { rule: LanguageSpecificRule; line?: number; snippet?: string }[] = [];

  for (const rule of rules.specificRules) {
    if (rule.pattern) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          violations.push({
            rule,
            line: i + 1,
            snippet: lines[i].trim(),
          });
        }
      }
    } else if (rule.detector) {
      if (rule.detector(content, filePath)) {
        violations.push({ rule });
      }
    }
  }

  return { violations };
}
