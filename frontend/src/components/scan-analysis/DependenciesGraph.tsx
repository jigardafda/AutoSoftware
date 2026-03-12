/**
 * Dependencies Graph/List Component
 * Displays module dependencies with import/export relationships
 */

import { useState } from 'react';
import { Link2, Package, ArrowRight, ChevronDown, ChevronRight, ExternalLink, FolderCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DependencyNode } from './types';

interface DependenciesGraphProps {
  dependencies: DependencyNode[];
  className?: string;
}

function DependencyItem({ dep }: { dep: DependencyNode }) {
  const [expanded, setExpanded] = useState(false);
  const hasRelations = dep.dependsOn.length > 0 || dep.usedBy.length > 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className={cn(
          'flex items-center gap-3 p-3 transition-colors',
          hasRelations && 'cursor-pointer hover:bg-muted/50'
        )}
        onClick={() => hasRelations && setExpanded(!expanded)}
      >
        {hasRelations ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-4" />
        )}

        {dep.type === 'external' ? (
          <Package className="h-4 w-4 text-purple-500 shrink-0" />
        ) : (
          <FolderCode className="h-4 w-4 text-blue-500 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{dep.name}</span>
            {dep.version && (
              <span className="text-xs text-muted-foreground">v{dep.version}</span>
            )}
          </div>
        </div>

        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            dep.type === 'external'
              ? 'bg-purple-500/15 text-purple-500 border-purple-500/20'
              : 'bg-blue-500/15 text-blue-500 border-blue-500/20'
          )}
        >
          {dep.type}
        </Badge>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{dep.usedBy.length} imports</span>
          <span>•</span>
          <span>{dep.dependsOn.length} exports</span>
        </div>
      </div>

      {expanded && hasRelations && (
        <div className="border-t bg-muted/30 p-3 space-y-3">
          {dep.dependsOn.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                <ArrowRight className="h-3 w-3" />
                Depends on ({dep.dependsOn.length})
              </span>
              <div className="flex flex-wrap gap-1">
                {dep.dependsOn.map((d, i) => (
                  <code key={i} className="text-xs bg-background px-2 py-0.5 rounded border">
                    {d}
                  </code>
                ))}
              </div>
            </div>
          )}

          {dep.usedBy.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                <ExternalLink className="h-3 w-3" />
                Used by ({dep.usedBy.length})
              </span>
              <div className="flex flex-wrap gap-1">
                {dep.usedBy.map((u, i) => (
                  <code key={i} className="text-xs bg-background px-2 py-0.5 rounded border">
                    {u}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DependenciesGraph({ dependencies, className }: DependenciesGraphProps) {
  const [filter, setFilter] = useState<'all' | 'internal' | 'external'>('all');

  if (!dependencies || dependencies.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Dependency Map
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No dependency information available
          </p>
        </CardContent>
      </Card>
    );
  }

  const filteredDeps = dependencies.filter((d) => {
    if (filter === 'all') return true;
    return d.type === filter;
  });

  const internalCount = dependencies.filter((d) => d.type === 'internal').length;
  const externalCount = dependencies.filter((d) => d.type === 'external').length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Dependency Map
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {dependencies.length} modules • {internalCount} internal • {externalCount} external
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {(['all', 'internal', 'external'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md transition-colors',
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredDeps.map((dep, i) => (
          <DependencyItem key={i} dep={dep} />
        ))}
      </CardContent>
    </Card>
  );
}
