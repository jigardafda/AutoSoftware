/**
 * Dead Code List Component
 * Displays detected unused/dead code paths
 */

import { useState } from 'react';
import { Trash2, FileCode, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { DeadCodePath } from './types';

interface DeadCodeListProps {
  deadCode: DeadCodePath[];
  className?: string;
}

function DeadCodeItem({ item }: { item: DeadCodePath }) {
  const [expanded, setExpanded] = useState(false);
  const fileName = item.filePath.split('/').pop() || item.filePath;
  const dirPath = item.filePath.slice(0, -fileName.length - 1);
  const confidencePercent = item.confidenceScore * 10;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        )}

        <FileCode className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{fileName}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                item.confidenceScore >= 8
                  ? 'bg-red-500/15 text-red-500 border-red-500/20'
                  : item.confidenceScore >= 5
                  ? 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {item.confidenceScore}/10 confidence
            </Badge>
          </div>
          {dirPath && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{dirPath}</p>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 p-3 space-y-3">
          <div>
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
              <AlertCircle className="h-3 w-3" />
              Reason
            </span>
            <p className="text-sm text-foreground">{item.reason}</p>
          </div>

          {item.codeSnippet && (
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-1 block">
                Code Snippet
              </span>
              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto">
                <code>{item.codeSnippet}</code>
              </pre>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Confidence:</span>
            <Progress value={confidencePercent} className="h-1.5 flex-1 max-w-[100px]" />
            <span className="text-xs font-medium">{item.confidenceScore}/10</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function DeadCodeList({ deadCode, className }: DeadCodeListProps) {
  if (!deadCode || deadCode.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Dead Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="h-10 w-10 rounded-full bg-green-500/15 flex items-center justify-center mb-2">
              <Trash2 className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground">No dead code detected</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Your codebase looks clean!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const highConfidence = deadCode.filter((d) => d.confidenceScore >= 8).length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-red-500" />
          Dead Code
          <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/20">
            {deadCode.length}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          {highConfidence} high-confidence detection{highConfidence !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {deadCode
          .sort((a, b) => b.confidenceScore - a.confidenceScore)
          .map((item, i) => (
            <DeadCodeItem key={i} item={item} />
          ))}
      </CardContent>
    </Card>
  );
}
