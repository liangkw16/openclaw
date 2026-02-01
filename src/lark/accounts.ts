import fs from "node:fs";
import type { OpenClawConfig } from "../config/config.js";
import type {
  LarkConfig,
  LarkAccountConfig,
  ResolvedLarkAccount,
  LarkTokenSource,
} from "./types.js";

export const DEFAULT_ACCOUNT_ID = "default";

function readFileIfExists(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }
  try {
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return undefined;
  }
}

function resolveAppId(params: {
  accountId: string;
  baseConfig?: LarkConfig;
  accountConfig?: LarkAccountConfig;
}): { appId: string; tokenSource: LarkTokenSource } {
  const { accountId, baseConfig, accountConfig } = params;

  // Check account-level config first
  if (accountConfig?.appId?.trim()) {
    return { appId: accountConfig.appId.trim(), tokenSource: "config" };
  }

  // Check account-level app ID file
  const accountFileAppId = readFileIfExists(accountConfig?.appIdFile);
  if (accountFileAppId) {
    return { appId: accountFileAppId, tokenSource: "file" };
  }

  // For default account, check base config and env
  if (accountId === DEFAULT_ACCOUNT_ID) {
    if (baseConfig?.appId?.trim()) {
      return { appId: baseConfig.appId.trim(), tokenSource: "config" };
    }

    const baseFileAppId = readFileIfExists(baseConfig?.appIdFile);
    if (baseFileAppId) {
      return { appId: baseFileAppId, tokenSource: "file" };
    }

    const envAppId = process.env.LARK_APP_ID?.trim();
    if (envAppId) {
      return { appId: envAppId, tokenSource: "env" };
    }
  }

  return { appId: "", tokenSource: "none" };
}

function resolveAppSecret(params: {
  accountId: string;
  baseConfig?: LarkConfig;
  accountConfig?: LarkAccountConfig;
}): string {
  const { accountId, baseConfig, accountConfig } = params;

  // Check account-level config first
  if (accountConfig?.appSecret?.trim()) {
    return accountConfig.appSecret.trim();
  }

  // Check account-level secret file
  const accountFileSecret = readFileIfExists(accountConfig?.appSecretFile);
  if (accountFileSecret) {
    return accountFileSecret;
  }

  // For default account, check base config and env
  if (accountId === DEFAULT_ACCOUNT_ID) {
    if (baseConfig?.appSecret?.trim()) {
      return baseConfig.appSecret.trim();
    }

    const baseFileSecret = readFileIfExists(baseConfig?.appSecretFile);
    if (baseFileSecret) {
      return baseFileSecret;
    }

    const envSecret = process.env.LARK_APP_SECRET?.trim();
    if (envSecret) {
      return envSecret;
    }
  }

  return "";
}

export function resolveLarkAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string;
}): ResolvedLarkAccount {
  const { cfg, accountId = DEFAULT_ACCOUNT_ID } = params;
  const larkConfig = cfg.channels?.lark as LarkConfig | undefined;
  const accounts = larkConfig?.accounts;
  const accountConfig = accountId !== DEFAULT_ACCOUNT_ID ? accounts?.[accountId] : undefined;

  const { appId, tokenSource } = resolveAppId({
    accountId,
    baseConfig: larkConfig,
    accountConfig,
  });

  const appSecret = resolveAppSecret({
    accountId,
    baseConfig: larkConfig,
    accountConfig,
  });

  const mergedConfig: LarkConfig & LarkAccountConfig = {
    ...larkConfig,
    ...accountConfig,
  };

  const enabled =
    accountConfig?.enabled ??
    (accountId === DEFAULT_ACCOUNT_ID ? (larkConfig?.enabled ?? true) : false);

  const name =
    accountConfig?.name ?? (accountId === DEFAULT_ACCOUNT_ID ? larkConfig?.name : undefined);

  return {
    accountId,
    name,
    enabled,
    appId,
    appSecret,
    tokenSource,
    config: mergedConfig,
  };
}

export function listLarkAccountIds(cfg: OpenClawConfig): string[] {
  const larkConfig = cfg.channels?.lark as LarkConfig | undefined;
  const accounts = larkConfig?.accounts;
  const ids = new Set<string>();

  // Add default account if configured at base level
  if (larkConfig?.appId?.trim() || larkConfig?.appIdFile || process.env.LARK_APP_ID?.trim()) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  // Add named accounts
  if (accounts) {
    for (const id of Object.keys(accounts)) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

export function resolveDefaultLarkAccountId(cfg: OpenClawConfig): string {
  const ids = listLarkAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function normalizeAccountId(accountId: string | undefined): string {
  const trimmed = accountId?.trim().toLowerCase();
  if (!trimmed || trimmed === "default") {
    return DEFAULT_ACCOUNT_ID;
  }
  return trimmed;
}
