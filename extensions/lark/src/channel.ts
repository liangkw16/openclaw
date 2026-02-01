import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  LarkConfigSchema,
  type ChannelPlugin,
  type ChannelStatusIssue,
  type OpenClawConfig,
  type LarkConfig,
  type LarkChannelData,
  type ResolvedLarkAccount,
} from "openclaw/plugin-sdk";

import { getLarkRuntime } from "./runtime.js";

// Lark channel metadata
const meta = {
  id: "lark",
  label: "Lark",
  selectionLabel: "Lark (Feishu)",
  detailLabel: "Lark Bot",
  docsPath: "/channels/lark",
  docsLabel: "lark",
  blurb: "Lark/Feishu bot for enterprise messaging.",
  systemImage: "message.fill",
};

export const larkPlugin: ChannelPlugin<ResolvedLarkAccount> = {
  id: "lark",
  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },
  pairing: {
    idLabel: "larkUserId",
    normalizeAllowEntry: (entry) => {
      // Lark IDs are case-sensitive; only strip prefix variants (lark: / lark:user:).
      return entry.replace(/^lark:(?:user:)?/i, "");
    },
    notifyApproval: async ({ cfg, id }) => {
      const lark = getLarkRuntime().channel.lark;
      const account = lark.resolveLarkAccount({ cfg });
      if (!account.appId || !account.appSecret) {
        throw new Error("Lark app credentials not configured");
      }
      await lark.sendMessageLark(id, "OpenClaw: your access has been approved.", {});
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: true, // Lark supports reply threads
    media: true,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.lark"] },
  configSchema: buildChannelConfigSchema(LarkConfigSchema),
  config: {
    listAccountIds: (cfg) => getLarkRuntime().channel.lark.listLarkAccountIds(cfg),
    resolveAccount: (cfg, accountId) =>
      getLarkRuntime().channel.lark.resolveLarkAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => getLarkRuntime().channel.lark.resolveDefaultLarkAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const larkConfig = (cfg.channels?.lark ?? {}) as LarkConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            lark: {
              ...larkConfig,
              enabled,
            },
          },
        };
      }
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          lark: {
            ...larkConfig,
            accounts: {
              ...larkConfig.accounts,
              [accountId]: {
                ...larkConfig.accounts?.[accountId],
                enabled,
              },
            },
          },
        },
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      const larkConfig = (cfg.channels?.lark ?? {}) as LarkConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        // oxlint-disable-next-line no-unused-vars
        const { appId, appSecret, appIdFile, appSecretFile, ...rest } = larkConfig;
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            lark: rest,
          },
        };
      }
      const accounts = { ...larkConfig.accounts };
      delete accounts[accountId];
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          lark: {
            ...larkConfig,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },
    isConfigured: (account) => Boolean(account.appId?.trim() && account.appSecret?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.appId?.trim() && account.appSecret?.trim()),
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (
        getLarkRuntime().channel.lark.resolveLarkAccount({ cfg, accountId }).config.allowFrom ?? []
      ).map((entry) => String(entry)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => {
          // Lark sender IDs are case-sensitive; keep original casing.
          return entry.replace(/^lark:(?:user:)?/i, "");
        }),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg.channels?.lark as LarkConfig | undefined)?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.lark.accounts.${resolvedAccountId}.`
        : "channels.lark.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: "openclaw pairing approve lark <code>",
        normalizeEntry: (raw) => raw.replace(/^lark:(?:user:)?/i, ""),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = (cfg.channels?.defaults as { groupPolicy?: string } | undefined)
        ?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") {
        return [];
      }
      return [
        `- Lark groups: groupPolicy="open" allows any member in groups to trigger. Set channels.lark.groupPolicy="allowlist" + channels.lark.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId, groupId }) => {
      const account = getLarkRuntime().channel.lark.resolveLarkAccount({ cfg, accountId });
      const groups = account.config.groups;
      if (!groups) {
        return false;
      }
      const groupConfig = groups[groupId] ?? groups["*"];
      return groupConfig?.requireMention ?? false;
    },
  },
  messaging: {
    normalizeTarget: (target) => {
      const trimmed = target.trim();
      if (!trimmed) {
        return null;
      }
      return trimmed.replace(/^lark:(chat|user):/i, "").replace(/^lark:/i, "");
    },
    targetResolver: {
      looksLikeId: (id) => {
        const trimmed = id?.trim();
        if (!trimmed) {
          return false;
        }
        // Lark chat IDs start with oc_, user IDs with ou_, union IDs with on_
        return /^(oc_|ou_|on_)[a-zA-Z0-9]+$/.test(trimmed) || /^lark:/i.test(trimmed);
      },
      hint: "<chatId|userId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },
  setup: {
    resolveAccountId: ({ accountId }) =>
      getLarkRuntime().channel.lark.normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) => {
      const larkConfig = (cfg.channels?.lark ?? {}) as LarkConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            lark: {
              ...larkConfig,
              name,
            },
          },
        };
      }
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          lark: {
            ...larkConfig,
            accounts: {
              ...larkConfig.accounts,
              [accountId]: {
                ...larkConfig.accounts?.[accountId],
                name,
              },
            },
          },
        },
      };
    },
    validateInput: ({ accountId, input }) => {
      const typedInput = input as {
        useEnv?: boolean;
        appId?: string;
        appSecret?: string;
        appIdFile?: string;
        appSecretFile?: string;
      };
      if (typedInput.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "LARK_APP_ID can only be used for the default account.";
      }
      if (!typedInput.useEnv && !typedInput.appId && !typedInput.appIdFile) {
        return "Lark requires appId or --app-id-file (or --use-env).";
      }
      if (!typedInput.useEnv && !typedInput.appSecret && !typedInput.appSecretFile) {
        return "Lark requires appSecret or --app-secret-file (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const typedInput = input as {
        name?: string;
        useEnv?: boolean;
        appId?: string;
        appSecret?: string;
        appIdFile?: string;
        appSecretFile?: string;
        mode?: "websocket" | "webhook";
        domain?: "feishu" | "lark";
      };
      const larkConfig = (cfg.channels?.lark ?? {}) as LarkConfig;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            lark: {
              ...larkConfig,
              enabled: true,
              ...(typedInput.name ? { name: typedInput.name } : {}),
              ...(typedInput.useEnv
                ? {}
                : typedInput.appIdFile
                  ? { appIdFile: typedInput.appIdFile }
                  : typedInput.appId
                    ? { appId: typedInput.appId }
                    : {}),
              ...(typedInput.useEnv
                ? {}
                : typedInput.appSecretFile
                  ? { appSecretFile: typedInput.appSecretFile }
                  : typedInput.appSecret
                    ? { appSecret: typedInput.appSecret }
                    : {}),
              ...(typedInput.mode ? { mode: typedInput.mode } : {}),
              ...(typedInput.domain ? { domain: typedInput.domain } : {}),
            },
          },
        };
      }

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          lark: {
            ...larkConfig,
            enabled: true,
            accounts: {
              ...larkConfig.accounts,
              [accountId]: {
                ...larkConfig.accounts?.[accountId],
                enabled: true,
                ...(typedInput.name ? { name: typedInput.name } : {}),
                ...(typedInput.appIdFile
                  ? { appIdFile: typedInput.appIdFile }
                  : typedInput.appId
                    ? { appId: typedInput.appId }
                    : {}),
                ...(typedInput.appSecretFile
                  ? { appSecretFile: typedInput.appSecretFile }
                  : typedInput.appSecret
                    ? { appSecret: typedInput.appSecret }
                    : {}),
                ...(typedInput.mode ? { mode: typedInput.mode } : {}),
                ...(typedInput.domain ? { domain: typedInput.domain } : {}),
              },
            },
          },
        },
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getLarkRuntime().channel.text.chunkMarkdownText(text, limit),
    textChunkLimit: 4000, // Lark allows up to 4000 characters per text message
    sendPayload: async ({ to, payload, accountId, cfg }) => {
      const runtime = getLarkRuntime();
      const larkData = (payload.channelData?.lark as LarkChannelData | undefined) ?? {};
      const sendText = runtime.channel.lark.sendMessageLark;
      const sendInteractive = runtime.channel.lark.sendInteractiveCardLark;
      const sendPost = runtime.channel.lark.sendPostLark;

      let lastResult: { messageId: string; chatId: string } | null = null;

      const chunkLimit =
        runtime.channel.text.resolveTextChunkLimit?.(cfg, "lark", accountId ?? undefined, {
          fallbackLimit: 4000,
        }) ?? 4000;

      const chunks = payload.text
        ? runtime.channel.text.chunkMarkdownText(payload.text, chunkLimit)
        : [];

      // Send interactive card if provided
      if (larkData.interactive) {
        lastResult = await sendInteractive(to, larkData.interactive, {
          accountId: accountId ?? undefined,
        });
      }

      // Send post if provided
      if (larkData.post) {
        lastResult = await sendPost(to, larkData.post, {
          accountId: accountId ?? undefined,
        });
      }

      // Send text chunks
      for (const chunk of chunks) {
        if (chunk.trim()) {
          lastResult = await sendText(to, chunk, {
            accountId: accountId ?? undefined,
          });
        }
      }

      if (lastResult) {
        return { channel: "lark", ...lastResult };
      }
      return { channel: "lark", messageId: "empty", chatId: to };
    },
    sendText: async ({ to, text, accountId }) => {
      const runtime = getLarkRuntime();
      const sendText = runtime.channel.lark.sendMessageLark;

      const result = await sendText(to, text, {
        accountId: accountId ?? undefined,
      });

      return { channel: "lark", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      const runtime = getLarkRuntime();
      // For now, just send text with the media URL
      // Full media support would require uploading to Lark first
      const messageText = mediaUrl ? `${text}\n\n${mediaUrl}` : text;
      const result = await runtime.channel.lark.sendMessageLark(to, messageText, {
        accountId: accountId ?? undefined,
      });
      return { channel: "lark", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) => {
      const issues: ChannelStatusIssue[] = [];
      for (const account of accounts) {
        const accountId = account.accountId ?? DEFAULT_ACCOUNT_ID;
        if (!account.appId?.trim()) {
          issues.push({
            channel: "lark",
            accountId,
            kind: "config",
            message: "Lark App ID not configured",
          });
        }
        if (!account.appSecret?.trim()) {
          issues.push({
            channel: "lark",
            accountId,
            kind: "config",
            message: "Lark App Secret not configured",
          });
        }
      }
      return issues;
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      mode: snapshot.mode ?? null,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) =>
      getLarkRuntime().channel.lark.probeLarkBot(
        account.appId,
        account.appSecret,
        timeoutMs,
        account.config.domain,
      ),
    buildAccountSnapshot: ({ account, runtime, probe }) => {
      const configured = Boolean(account.appId?.trim() && account.appSecret?.trim());
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        mode: account.config.mode ?? "websocket",
        probe,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const appId = account.appId.trim();
      const appSecret = account.appSecret.trim();
      const mode = account.config.mode ?? "websocket";
      const domain = account.config.domain ?? "feishu";

      let larkBotLabel = "";
      try {
        const probe = await getLarkRuntime().channel.lark.probeLarkBot(appId, appSecret, 2500, domain);
        const appName = probe.ok ? probe.bot?.appName?.trim() : null;
        if (appName) {
          larkBotLabel = ` (${appName})`;
        }
      } catch (err) {
        if (getLarkRuntime().logging.shouldLogVerbose()) {
          ctx.log?.debug?.(`[${account.accountId}] bot probe failed: ${String(err)}`);
        }
      }

      ctx.log?.info(`[${account.accountId}] starting Lark provider${larkBotLabel} in ${mode} mode`);

      return getLarkRuntime().channel.lark.monitorLarkProvider({
        appId,
        appSecret,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        webhookPath: account.config.webhookPath,
        encryptKey: account.config.encryptKey,
        verificationToken: account.config.verificationToken,
        mode,
        domain,
      });
    },
    logoutAccount: async ({ accountId, cfg }) => {
      const envAppId = process.env.LARK_APP_ID?.trim() ?? "";
      const nextCfg = { ...cfg } as OpenClawConfig;
      const larkConfig = (cfg.channels?.lark ?? {}) as LarkConfig;
      const nextLark = { ...larkConfig };
      let cleared = false;
      let changed = false;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        if (
          nextLark.appId ||
          nextLark.appSecret ||
          nextLark.appIdFile ||
          nextLark.appSecretFile
        ) {
          delete nextLark.appId;
          delete nextLark.appSecret;
          delete nextLark.appIdFile;
          delete nextLark.appSecretFile;
          cleared = true;
          changed = true;
        }
      }

      const accounts = nextLark.accounts ? { ...nextLark.accounts } : undefined;
      if (accounts && accountId in accounts) {
        const entry = accounts[accountId];
        if (entry && typeof entry === "object") {
          const nextEntry = { ...entry } as Record<string, unknown>;
          if (
            "appId" in nextEntry ||
            "appSecret" in nextEntry ||
            "appIdFile" in nextEntry ||
            "appSecretFile" in nextEntry
          ) {
            cleared = true;
            delete nextEntry.appId;
            delete nextEntry.appSecret;
            delete nextEntry.appIdFile;
            delete nextEntry.appSecretFile;
            changed = true;
          }
          if (Object.keys(nextEntry).length === 0) {
            delete accounts[accountId];
            changed = true;
          } else {
            accounts[accountId] = nextEntry as typeof entry;
          }
        }
      }

      if (accounts) {
        if (Object.keys(accounts).length === 0) {
          delete nextLark.accounts;
          changed = true;
        } else {
          nextLark.accounts = accounts;
        }
      }

      if (changed) {
        if (Object.keys(nextLark).length > 0) {
          nextCfg.channels = { ...nextCfg.channels, lark: nextLark };
        } else {
          const nextChannels = { ...nextCfg.channels };
          delete (nextChannels as Record<string, unknown>).lark;
          if (Object.keys(nextChannels).length > 0) {
            nextCfg.channels = nextChannels;
          } else {
            delete nextCfg.channels;
          }
        }
        await getLarkRuntime().config.writeConfigFile(nextCfg);
      }

      const resolved = getLarkRuntime().channel.lark.resolveLarkAccount({
        cfg: changed ? nextCfg : cfg,
        accountId,
      });
      const loggedOut = resolved.tokenSource === "none";

      return { cleared, envToken: Boolean(envAppId), loggedOut };
    },
  },
};
