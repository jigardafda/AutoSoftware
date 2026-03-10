import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;

interface PaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, total, pageSize = PAGE_SIZE, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-sm text-muted-foreground">
        {start}-{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm min-w-[60px] text-center">
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number = PAGE_SIZE): T[] {
  return items.slice(page * pageSize, (page + 1) * pageSize);
}

export { PAGE_SIZE };
