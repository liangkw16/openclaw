import * as lark from "@larksuiteoapi/node-sdk";
import type { LarkDomain } from "./types.js";

// Cache clients by appId to reuse connections
const clientCache = new Map<string, lark.Client>();

export interface CreateLarkClientOptions {
  appId: string;
  appSecret: string;
  domain?: LarkDomain;
  disableTokenCache?: boolean;
}

/**
 * Create or retrieve a cached Lark SDK client
 */
export function createLarkClient(options: CreateLarkClientOptions): lark.Client {
  const { appId, appSecret, domain = "feishu", disableTokenCache } = options;

  // Return cached client if available (and caching is enabled)
  if (!disableTokenCache) {
    const cached = clientCache.get(appId);
    if (cached) {
      return cached;
    }
  }

  const client = new lark.Client({
    appId,
    appSecret,
    domain: domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu,
    disableTokenCache,
  });

  // Cache the client
  if (!disableTokenCache) {
    clientCache.set(appId, client);
  }

  return client;
}

/**
 * Clear a client from cache (useful for logout/reconfiguration)
 */
export function clearLarkClientCache(appId: string): void {
  clientCache.delete(appId);
}

/**
 * Clear all cached clients
 */
export function clearAllLarkClientCache(): void {
  clientCache.clear();
}

/**
 * Get the appropriate Lark domain enum value
 */
export function getLarkDomain(
  domain: LarkDomain | undefined,
): typeof lark.Domain.Feishu | typeof lark.Domain.Lark {
  return domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu;
}
