/**
 * Architecture Pattern Card
 * Displays the detected architecture pattern with confidence score
 */

import { Building2, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ArchitecturePattern {
  type: string;
  confidence: number;
  evidence: string[];
}

interface ArchitectureCardProps {
  pattern: ArchitecturePattern | null;
  className?: string;
}

const patternLabels: Record<string, { label: string; description: string; color: string }> = {
  mvc: {
    label: 'MVC',
    description: 'Model-View-Controller pattern',
    color: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
  },
  microservices: {
    label: 'Microservices',
    description: 'Distributed microservices architecture',
    color: 'bg-purple-500/15 text-purple-500 border-purple-500/20',
  },
  monolith: {
    label: 'Monolith',
    description: 'Single unified codebase',
    color: 'bg-gray-500/15 text-gray-500 border-gray-500/20',
  },
  serverless: {
    label: 'Serverless',
    description: 'Function-as-a-Service architecture',
    color: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/20',
  },
  modular_monolith: {
    label: 'Modular Monolith',
    description: 'Monolith with clear module boundaries',
    color: 'bg-green-500/15 text-green-500 border-green-500/20',
  },
  hexagonal: {
    label: 'Hexagonal',
    description: 'Ports and adapters architecture',
    color: 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  },
  clean_architecture: {
    label: 'Clean Architecture',
    description: 'Dependency rule based layers',
    color: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/20',
  },
  event_driven: {
    label: 'Event Driven',
    description: 'Event-based communication pattern',
    color: 'bg-pink-500/15 text-pink-500 border-pink-500/20',
  },
  unknown: {
    label: 'Unknown',
    description: 'Architecture pattern not detected',
    color: 'bg-muted text-muted-foreground',
  },
};

export function ArchitectureCard({ pattern, className }: ArchitectureCardProps) {
  if (!pattern) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Architecture Pattern
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No architecture pattern detected</p>
        </CardContent>
      </Card>
    );
  }

  const config = patternLabels[pattern.type] || patternLabels.unknown;
  const confidencePercent = pattern.confidence * 10;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Architecture Pattern
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={config.color}>
            {config.label}
          </Badge>
          <span className="text-sm text-muted-foreground">{config.description}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-medium">{pattern.confidence}/10</span>
          </div>
          <Progress value={confidencePercent} className="h-2" />
        </div>

        {pattern.evidence && pattern.evidence.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Evidence</span>
            <ul className="space-y-1">
              {pattern.evidence.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="h-3 w-3 mt-0.5 text-green-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
