import type { IntegrationProvider } from "@autosoftware/shared";
import type { IntegrationAdapter } from "./types.js";

const adapters = new Map<IntegrationProvider, IntegrationAdapter>();

export function registerAdapter(adapter: IntegrationAdapter): void {
  adapters.set(adapter.provider, adapter);
}

export function getAdapter(provider: IntegrationProvider): IntegrationAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`No adapter registered for provider: ${provider}`);
  }
  return adapter;
}

export function getAllAdapters(): IntegrationAdapter[] {
  return Array.from(adapters.values());
}
