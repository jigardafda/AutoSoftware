import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  ExternalLink,
  CheckCircle2,
  Import,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProviderIcon } from "./ProviderIcon";

interface ImportItemsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: any;
  repos: any[];
  onImported: () => void;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

export function ImportItemsSheet({
  open,
  onOpenChange,
  link,
  repos,
  onImported,
}: ImportItemsSheetProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRepo, setSelectedRepo] = useState<string>(repos[0]?.id || "");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    if (open && link) {
      setSelectedIds(new Set());
      setImported(false);
      setImportResult(null);
      setSearch("");
      loadItems();
    }
  }, [open, link]);

  useEffect(() => {
    if (repos.length > 0 && !selectedRepo) {
      setSelectedRepo(repos[0].id);
    }
  }, [repos, selectedRepo]);

  const loadItems = async (cursor?: string, append = false) => {
    if (!link) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "50" };
      if (cursor) params.cursor = cursor;
      if (search) params.search = search;

      const result = await api.integrations.listItems(
        link.integrationId,
        link.externalProjectId,
        params
      );

      setItems((prev) => (append ? [...prev, ...result.items] : result.items));
      setNextCursor(result.nextCursor);
    } catch (err: any) {
      toast.error(`Failed to load items: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setItems([]);
    setNextCursor(null);
    loadItems();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0 || !selectedRepo) return;
    setImporting(true);
    try {
      const result = await api.integrations.importItems(link.id, {
        itemIds: Array.from(selectedIds),
        repositoryId: selectedRepo,
      });
      setImportResult(result);
      setImported(true);
      onImported();
      toast.success(`Imported ${result.imported} item(s)`);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const isMonitoring = items.length > 0 &&
    ["error", "incident", "alert"].includes(items[0]?.itemType);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ProviderIcon provider={link?.integration?.provider} />
            Import from {link?.externalProjectName}
          </SheetTitle>
          <SheetDescription>
            Select items to import as tasks.
          </SheetDescription>
        </SheetHeader>

        {imported ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">
              {importResult?.imported || 0} item(s) imported
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="flex gap-2 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search items..."
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleSearch} disabled={loading}>
                Search
              </Button>
            </div>

            {/* Items table */}
            <ScrollArea className="flex-1 mt-3 -mx-6 px-6">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No items found.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selectedIds.size === items.length && items.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Title</TableHead>
                      {isMonitoring ? (
                        <>
                          <TableHead className="w-16 text-right">Events</TableHead>
                          <TableHead className="w-16 text-right">Users</TableHead>
                          <TableHead className="w-16 text-right">Last</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="w-20">Status</TableHead>
                          <TableHead className="w-16">Priority</TableHead>
                          <TableHead className="w-16 text-right">Created</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => toggleSelect(item.id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate max-w-[300px]">
                              {item.title}
                            </p>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          {item.labels.length > 0 && (
                            <div className="flex gap-1 mt-0.5">
                              {item.labels.slice(0, 3).map((l: string) => (
                                <Badge key={l} variant="outline" className="text-[9px] px-1 py-0">
                                  {l}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        {isMonitoring ? (
                          <>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {item.metadata?.count ?? "-"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {item.metadata?.userCount ?? "-"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {relativeTime(item.updatedAt)}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {item.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {item.priority || "-"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {relativeTime(item.createdAt)}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {nextCursor && !loading && (
                <div className="flex justify-center py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => loadItems(nextCursor, true)}
                  >
                    Load more
                  </Button>
                </div>
              )}
              {loading && items.length > 0 && (
                <div className="flex justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </ScrollArea>

            {/* Bottom bar */}
            <div className="flex items-center gap-3 pt-4 border-t mt-auto">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <div className="flex-1" />
              {repos.length > 0 && (
                <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select repo" />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                onClick={handleImport}
                disabled={importing || selectedIds.size === 0 || !selectedRepo}
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Import className="h-4 w-4 mr-1" />
                )}
                Import {selectedIds.size > 0 ? `${selectedIds.size} Item(s)` : ""}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
