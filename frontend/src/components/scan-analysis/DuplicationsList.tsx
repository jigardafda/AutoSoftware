/**
 * Code Duplications List Component
 * Displays detected code duplications across files
 */

import { useState } from 'react';
import { Copy, FileCode, ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { CodeDuplication } from './types';

interface DuplicationsListProps {
  duplications: CodeDuplication[];
  className?: string;
}

function DuplicationItem({ item, index }: { item: CodeDuplication; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const similarityPercent = item.similarity * 100;

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

        <Copy className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">Duplication #{index + 1}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                similarityPercent >= 90
                  ? 'bg-red-500/15 text-red-500 border-red-500/20'
                  : similarityPercent >= 70
                  ? 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {similarityPercent.toFixed(0)}% similar
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Found in {item.locations.length} location{item.locations.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="text-xs text-muted-foreground">
          {item.confidenceScore}/10 confidence
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 p-3 space-y-3">
          <div>
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
              <MapPin className="h-3 w-3" />
              Locations
            </span>
            <div className="space-y-1.5">
              {item.locations.map((loc, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs bg-background p-2 rounded border"
                >
                  <FileCode className="h-3 w-3 text-muted-foreground shrink-0" />
                  <code className="flex-1 truncate">{loc.filePath}</code>
                  <span className="text-muted-foreground shrink-0">
                    Lines {loc.startLine}-{loc.endLine}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {item.codeSnippet && (
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-1 block">
                Duplicated Code
              </span>
              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-[200px]">
                <code>{item.codeSnippet}</code>
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Similarity:</span>
              <Progress value={similarityPercent} className="h-1.5 w-[80px]" />
              <span className="font-medium">{similarityPercent.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Confidence:</span>
              <span className="font-medium">{item.confidenceScore}/10</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DuplicationsList({ duplications, className }: DuplicationsListProps) {
  if (!duplications || duplications.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Copy className="h-4 w-4" />
            Code Duplications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="h-10 w-10 rounded-full bg-green-500/15 flex items-center justify-center mb-2">
              <Copy className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground">No code duplications detected</p>
            <p className="text-xs text-muted-foreground/70 mt-1">DRY principles followed!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalLocations = duplications.reduce((sum, d) => sum + d.locations.length, 0);
  const avgSimilarity =
    duplications.reduce((sum, d) => sum + d.similarity, 0) / duplications.length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Copy className="h-4 w-4 text-yellow-500" />
          Code Duplications
          <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/20">
            {duplications.length}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          {totalLocations} affected locations • {(avgSimilarity * 100).toFixed(0)}% avg similarity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {duplications
          .sort((a, b) => b.similarity - a.similarity)
          .map((item, i) => (
            <DuplicationItem key={i} item={item} index={i} />
          ))}
      </CardContent>
    </Card>
  );
}
