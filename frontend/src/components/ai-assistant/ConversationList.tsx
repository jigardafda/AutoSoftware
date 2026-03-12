/**
 * Conversation List Component
 *
 * Displays conversation history with search and filtering.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search,
  MessageSquare,
  Trash2,
  Archive,
  MoreHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  contextType?: "global" | "project" | "repository";
  contextId?: string;
}

export function ConversationList({
  selectedId,
  onSelect,
  onClose,
  contextType,
  contextId,
}: Props) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch conversations
  const { data: conversations, isLoading } = useQuery({
    queryKey: ["conversations", contextType, contextId],
    queryFn: () =>
      api.chat.listConversations({
        contextType,
        contextId,
        limit: 50,
      }),
  });

  // Search conversations
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["conversations-search", searchQuery],
    queryFn: () => api.chat.searchConversations(searchQuery, 20),
    enabled: searchQuery.length >= 2,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.chat.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      api.chat.updateConversation(id, { archive: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  // Display list
  const displayList = useMemo(() => {
    if (searchQuery.length >= 2 && searchResults) {
      return searchResults;
    }
    return conversations || [];
  }, [searchQuery, searchResults, conversations]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <span className="font-medium text-sm">History</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading || isSearching ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : displayList.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {searchQuery ? "No results found" : "No conversations yet"}
            </div>
          ) : (
            displayList.map((conv: any) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={conv.id === selectedId}
                onSelect={() => onSelect(conv.id)}
                onDelete={() => deleteMutation.mutate(conv.id)}
                onArchive={() => archiveMutation.mutate(conv.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: {
    id: string;
    title: string | null;
    messageCount: number;
    lastMessage?: { content: string; role: string; createdAt: string } | null;
    updatedAt: string;
  };
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onArchive: () => void;
}

function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onDelete,
  onArchive,
}: ConversationItemProps) {
  const title =
    conversation.title || conversation.lastMessage?.content?.slice(0, 40) || "New conversation";

  return (
    <div
      className={cn(
        "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors",
        isSelected ? "bg-primary/10" : "hover:bg-muted"
      )}
      onClick={onSelect}
    >
      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{conversation.messageCount} messages</span>
          <span>·</span>
          <span>
            {formatDistanceToNow(new Date(conversation.updatedAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
          >
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
