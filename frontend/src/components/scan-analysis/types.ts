/**
 * Types for scan analysis data
 */

export interface ArchitecturePattern {
  type: 'mvc' | 'microservices' | 'monolith' | 'serverless' | 'modular_monolith' | 'hexagonal' | 'clean_architecture' | 'event_driven' | 'unknown';
  confidence: number;
  evidence: string[];
}

export interface DependencyNode {
  name: string;
  version?: string;
  type: 'internal' | 'external';
  dependsOn: string[];
  usedBy: string[];
}

export interface DeadCodePath {
  filePath: string;
  codeSnippet: string;
  reason: string;
  confidenceScore: number;
}

export interface CodeDuplication {
  locations: { filePath: string; startLine: number; endLine: number }[];
  codeSnippet: string;
  similarity: number;
  confidenceScore: number;
}

export interface PerformanceIssue {
  type: 'n_plus_one' | 'memory_leak' | 'inefficient_algorithm' | 'large_bundle' | 'blocking_operation' | 'other';
  filePath: string;
  description: string;
  codeSnippet?: string;
  confidenceScore: number;
  severityLevel: 'critical' | 'major' | 'minor' | 'nitpick';
}

export interface CodeAnalysisResult {
  id: string;
  scanResultId: string;
  architecturePattern: string | null;
  dependencies: DependencyNode[];
  deadCodePaths: DeadCodePath[];
  duplications: CodeDuplication[];
  performanceIssues: PerformanceIssue[];
  falsePositiveAnalysis: any[];
  languageRuleViolations: any[];
  createdAt: string;
}
