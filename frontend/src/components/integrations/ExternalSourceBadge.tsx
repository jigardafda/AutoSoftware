import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProviderIcon } from "./ProviderIcon";

interface ExternalSourceBadgeProps {
  externalLink: {
    externalItemId: string;
    externalItemUrl: string | null;
    externalItemType: string | null;
    integrationLink: {
      externalProjectName: string;
      integration: {
        provider: string;
        displayName: string;
      };
    };
  };
}

export function ExternalSourceBadge({ externalLink }: ExternalSourceBadgeProps) {
  const { provider, displayName } = externalLink.integrationLink.integration;
  const label = `${displayName}: ${externalLink.externalItemId}`;

  if (externalLink.externalItemUrl) {
    return (
      <a
        href={externalLink.externalItemUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex"
      >
        <Badge
          variant="outline"
          className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 hover:bg-indigo-500/20 transition-colors cursor-pointer gap-1"
        >
          <ProviderIcon provider={provider} className="h-3 w-3" />
          {label}
          <ExternalLink className="h-2.5 w-2.5" />
        </Badge>
      </a>
    );
  }

  return (
    <Badge
      variant="outline"
      className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 gap-1"
    >
      <ProviderIcon provider={provider} className="h-3 w-3" />
      {label}
    </Badge>
  );
}
