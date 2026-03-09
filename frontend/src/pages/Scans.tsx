import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ScanSearch,
  Github,
  GitlabIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

function timeAgo(date: string) {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "github":
      return <Github className="h-4 w-4 text-muted-foreground" />;
    case "gitlab":
      return <GitlabIcon className="h-4 w-4 text-orange-400" />;
    case "bitbucket":
      return (
        <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.65 3C2.3 3 2 3.3 2 3.65v.12l2.73 16.5c.07.42.43.73.85.73h13.05c.31 0 .58-.24.63-.55L22 3.77v-.12c0-.35-.3-.65-.65-.65H2.65zM14.1 14.95H9.94L8.81 9.07h6.3l-1.01 5.88z" />
        </svg>
      );
    default:
      return null;
  }
}

export function Scans() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: scans = [], isLoading } = useQuery({
    queryKey: ["scans"],
    queryFn: api.scans.list,
  });

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Scan History</h2>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Scan History</h2>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ScanSearch className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-sm">
            No scans yet. Connect a repository and trigger a scan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Scan History</h2>
        <Badge variant="secondary" className="text-xs">
          {scans.length}
        </Badge>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repository</TableHead>
              <TableHead>Scanned At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tasks Created</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {scans.map((scan: any) => (
              <>
                <TableRow
                  key={scan.id}
                  className="cursor-pointer"
                  onClick={() => toggleExpand(scan.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProviderIcon provider={scan.repository?.provider} />
                      <span className="font-medium text-sm">
                        {scan.repository?.fullName || "Unknown"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {timeAgo(scan.scannedAt)}
                  </TableCell>
                  <TableCell>
                    {scan.status === "completed" ? (
                      <Badge
                        variant="secondary"
                        className="bg-green-500/10 text-green-500 border-green-500/20"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Completed
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="bg-red-500/10 text-red-500 border-red-500/20"
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Failed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {scan.tasksCreated ?? 0}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {scan.summary
                      ? scan.summary.length > 100
                        ? `${scan.summary.slice(0, 100)}...`
                        : scan.summary
                      : "--"}
                  </TableCell>
                  <TableCell>
                    {expandedId === scan.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
                {expandedId === scan.id && (
                  <TableRow key={`${scan.id}-detail`}>
                    <TableCell colSpan={6} className="p-0">
                      <Card className="m-2 border-dashed">
                        <CardContent className="p-4">
                          <p className="text-sm font-medium mb-1">Full Summary</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {scan.summary || "No summary available."}
                          </p>
                          {scan.errorMessage && (
                            <>
                              <p className="text-sm font-medium mt-3 mb-1 text-red-400">
                                Error
                              </p>
                              <p className="text-sm text-red-400/80">
                                {scan.errorMessage}
                              </p>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
