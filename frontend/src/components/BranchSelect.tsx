import { useState } from "react";
import { GitBranch, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface Branch {
  name: string;
  isDefault: boolean;
}

interface BranchSelectProps {
  branches: Branch[] | undefined;
  value: string | null;
  onChange: (branch: string | null) => void;
  defaultBranchName?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  showIcon?: boolean;
  className?: string;
}

export function BranchSelect({
  branches,
  value,
  onChange,
  defaultBranchName,
  placeholder = "Select branch...",
  disabled = false,
  size = "default",
  showIcon = true,
  className,
}: BranchSelectProps) {
  const [open, setOpen] = useState(false);

  // Find the default branch from the list or use the provided default name
  const defaultBranch = branches?.find((b) => b.isDefault);
  const defaultName = defaultBranchName || defaultBranch?.name || "main";

  // Display text
  const displayValue = value || "default";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || !branches?.length}
          className={cn(
            "justify-between font-normal",
            size === "sm" && "h-7 px-2 text-xs",
            className
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            {showIcon && <GitBranch className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-4 w-4")} />}
            <span className="truncate">{displayValue}</span>
          </span>
          <ChevronsUpDown className={cn("ml-2 shrink-0 opacity-50", size === "sm" ? "h-3 w-3" : "h-4 w-4")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search branches..." />
          <CommandList>
            <CommandEmpty>No branch found.</CommandEmpty>
            <CommandGroup>
              {/* Default option (uses repo's default branch) */}
              <CommandItem
                value="default"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0"
                  )}
                />
                <GitBranch className="mr-2 h-4 w-4" />
                <span>default</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  ({defaultName})
                </span>
              </CommandItem>
              {/* All branches */}
              {branches?.map((branch) => (
                <CommandItem
                  key={branch.name}
                  value={branch.name}
                  onSelect={() => {
                    onChange(branch.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === branch.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <GitBranch className="mr-2 h-4 w-4" />
                  <span className="truncate">{branch.name}</span>
                  {branch.isDefault && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      (default)
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
