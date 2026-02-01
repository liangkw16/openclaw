import * as lark from "@larksuiteoapi/node-sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "../config/config.js";
import { danger, logVerbose } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveLarkAccount } from "./accounts.js";
import { getLarkDomain } from "./client.js";
import { sendMessageLark, replyMessageLark } from "./send.js";
import { normalizePluginHttpPath } from "../plugins/http-path.js";
import { registerPluginHttpRoute } from "../plugins/http-registry.js";
import type { ResolvedLarkAccount, LarkWebhookContext } from "./types.js";
import { dispatchReplyWithBufferedBlockDispatcher } from "../auto-reply/reply/provider-dispatcher.js";
import { resolveEffectiveMessagesConfig } from "../agents/identity.js";
import { chunkMarkdownText } from "../auto-reply/chunk.js";
import { resolveAgentRoute } from "../routing/resolve-route.js";

export interface MonitorLarkProviderOptions {
  appId: string;
  appSecret: string;
  accountId?: string;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  webhookPath?: string;
  encryptKey?: string;
  verificationToken?: string;
  mode?: "websocket" | "webhook";
  domain?: "feishu" | "lark";
}

export interface LarkProviderMonitor {
  account: ResolvedLarkAccount;
  stop: () => void;
}

// Track runtime state in memory
const runtimeState = new Map<
  string,
  {
    running: boolean;
    lastStartAt: number | null;
    lastStopAt: number | null;
    lastError: string | null;
    lastInboundAt?: number | null;
    lastOutboundAt?: number | null;
  }
>();

function recordChannelRuntimeState(params: {
  channel: string;
  accountId: string;
  state: Partial<{
    running: boolean;
    lastStartAt: number | null;
    lastStopAt: number | null;
    lastError: string | null;
    lastInboundAt: number | null;
    lastOutboundAt: number | null;
  }>;
}): void {
  const key = `${params.channel}:${params.accountId}`;
  const existing = runtimeState.get(key) ?? {
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
  };
  runtimeState.set(key, { ...existing, ...params.state });
}

export function getLarkRuntimeState(accountId: string) {
  return runtimeState.get(`lark:${accountId}`);
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// Message/Sender structure (shared between formats)
interface LarkMessageData {
  message_id?: string;
  root_id?: string;
  parent_id?: string;
  chat_id?: string;
  chat_type?: string;
  message_type?: string;
  content?: string;
  mentions?: Array<{
    key: string;
    id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    name: string;
    tenant_key?: string;
  }>;
}

interface LarkSenderData {
  sender_id?: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  sender_type?: string;
  tenant_key?: string;
}

// Lark event can come in two formats:
// 1. WebSocket format: { message: {...}, sender: {...}, ... } at top level
// 2. Webhook format: { header: {...}, event: { message: {...}, sender: {...} } }
interface LarkMessageEvent {
  schema?: string;
  // Webhook format fields
  header?: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
    tenant_key: string;
  };
  event?: {
    sender?: LarkSenderData;
    message?: LarkMessageData;
  };
  // WebSocket format fields (at top level)
  message?: LarkMessageData;
  sender?: LarkSenderData;
  event_id?: string;
  event_type?: string;
  create_time?: string;
  token?: string;
  app_id?: string;
  tenant_key?: string;
}

function parseMessageContent(messageType: string, content: string): { text: string; raw: unknown } {
  try {
    const parsed = JSON.parse(content);

    switch (messageType) {
      case "text":
        return { text: parsed.text ?? "", raw: parsed };
      case "post":
        // Extract text from post content
        const postContent = parsed.content ?? parsed.zh_cn?.content ?? parsed.en_us?.content ?? [];
        const textParts: string[] = [];
        for (const paragraph of postContent) {
          if (Array.isArray(paragraph)) {
            for (const element of paragraph) {
              if (element.tag === "text") {
                textParts.push(element.text);
              } else if (element.tag === "a") {
                textParts.push(element.text);
              } else if (element.tag === "at") {
                textParts.push(`@${element.user_name || element.user_id}`);
              }
            }
          }
        }
        return { text: textParts.join(""), raw: parsed };
      case "image":
        return { text: "[Image]", raw: parsed };
      case "file":
        return { text: `[File: ${parsed.file_name ?? "unknown"}]`, raw: parsed };
      case "audio":
        return { text: "[Audio]", raw: parsed };
      case "video":
        return { text: "[Video]", raw: parsed };
      case "interactive":
        return { text: "[Interactive Card]", raw: parsed };
      default:
        return { text: `[${messageType}]`, raw: parsed };
    }
  } catch {
    return { text: content, raw: content };
  }
}

function buildInboundContext(
  event: LarkMessageEvent,
  _accountId: string,
): LarkWebhookContext | null {
  // Handle both WebSocket format (top-level) and Webhook format (nested in event)
  const message = event.message ?? event.event?.message;
  const sender = event.sender ?? event.event?.sender;

  if (!message?.message_id || !message.chat_id) {
    console.log(`[lark] buildInboundContext: missing message_id or chat_id`, { message });
    return null;
  }

  const senderId = sender?.sender_id?.open_id ?? sender?.sender_id?.user_id ?? "unknown";
  const senderType = sender?.sender_type === "app" ? "bot" : "user";

  // Skip messages from bots (including self)
  if (senderType === "bot") {
    return null;
  }

  const messageType = (message.message_type as LarkWebhookContext["messageType"]) ?? "text";
  const chatType = message.chat_type === "group" ? "group" : "p2p";

  return {
    messageId: message.message_id,
    chatId: message.chat_id,
    chatType,
    senderId,
    senderType,
    messageType,
    content: message.content ? JSON.parse(message.content) : {},
    mentions: message.mentions?.map((m) => ({
      key: m.key,
      id: m.id,
      name: m.name,
    })),
    rootId: message.root_id,
    parentId: message.parent_id,
  };
}

async function handleLarkMessage(
  event: LarkMessageEvent,
  options: {
    accountId: string;
    config: OpenClawConfig;
    runtime: RuntimeEnv;
  },
): Promise<void> {
  const { accountId, config, runtime } = options;

  const ctx = buildInboundContext(event, accountId);
  if (!ctx) {
    logVerbose(`lark: skipping non-message event or bot message`);
    return;
  }

  // Record inbound activity
  recordChannelRuntimeState({
    channel: "lark",
    accountId,
    state: {
      lastInboundAt: Date.now(),
    },
  });

  // Handle both WebSocket format (top-level) and Webhook format (nested in event)
  const message = event.message ?? event.event?.message;
  const messageType = message?.message_type ?? "text";
  const content = message?.content ?? "{}";

  const { text } = parseMessageContent(messageType, content);
  logVerbose(`lark: received ${messageType} message from ${ctx.senderId}: ${text.slice(0, 50)}...`);

  // Resolve routing to get agentId
  const peerKind = ctx.chatType === "group" ? "group" : "dm";
  const route = resolveAgentRoute({
    channel: "lark",
    accountId,
    peer: { kind: peerKind, id: ctx.chatId },
    cfg: config,
  });

  // Build inbound context payload for auto-reply system
  const ctxPayload = {
    Provider: "lark",
    From: ctx.chatId, // Use chat_id for routing
    FromName: ctx.senderId,
    Body: text,
    IsGroup: ctx.chatType === "group",
    Channel: "lark",
    AccountId: accountId,
    MessageId: ctx.messageId,
  };

  try {
    const textLimit = 4000; // Lark message limit

    const { queuedFinal } = await dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: config,
      dispatcherOptions: {
        responsePrefix: resolveEffectiveMessagesConfig(config, route.agentId).responsePrefix,
        deliver: async (payload, _info) => {
          const chunks = payload.text ? chunkMarkdownText(payload.text, textLimit) : [];

          // Send each chunk
          for (const chunk of chunks) {
            if (chunk.trim()) {
              // Reply to the original message for threading
              await replyMessageLark(ctx.messageId, chunk, {
                accountId,
              });
            }
          }

          recordChannelRuntimeState({
            channel: "lark",
            accountId,
            state: {
              lastOutboundAt: Date.now(),
            },
          });
        },
        onError: (err, info) => {
          runtime.error?.(danger(`lark ${info.kind} reply failed: ${String(err)}`));
        },
      },
      replyOptions: {},
    });

    if (!queuedFinal) {
      logVerbose(`lark: no response generated for message from ${ctx.senderId}`);
    }
  } catch (err) {
    runtime.error?.(danger(`lark: auto-reply failed: ${String(err)}`));

    // Send error message to user
    try {
      await sendMessageLark(ctx.chatId, "Sorry, I encountered an error processing your message.", {
        accountId,
      });
    } catch (sendErr) {
      runtime.error?.(danger(`lark: error reply failed: ${String(sendErr)}`));
    }
  }
}

export async function monitorLarkProvider(
  opts: MonitorLarkProviderOptions,
): Promise<LarkProviderMonitor> {
  const {
    appId,
    appSecret,
    accountId,
    config,
    runtime,
    abortSignal,
    webhookPath,
    encryptKey,
    verificationToken,
    mode = "websocket",
    domain = "feishu",
  } = opts;
  const resolvedAccountId = accountId ?? "default";

  // Record starting state
  recordChannelRuntimeState({
    channel: "lark",
    accountId: resolvedAccountId,
    state: {
      running: true,
      lastStartAt: Date.now(),
    },
  });

  const account = resolveLarkAccount({
    cfg: config,
    accountId: resolvedAccountId,
  });

  let stopFn: () => void;

  if (mode === "websocket") {
    stopFn = await startWebSocketMode({
      appId,
      appSecret,
      accountId: resolvedAccountId,
      config,
      runtime,
      abortSignal,
      domain,
    });
  } else {
    stopFn = await startWebhookMode({
      appId,
      appSecret,
      accountId: resolvedAccountId,
      config,
      runtime,
      abortSignal,
      webhookPath,
      encryptKey,
      verificationToken,
      domain,
    });
  }

  // Handle abort signal
  const stopHandler = () => {
    logVerbose(`lark: stopping provider for account ${resolvedAccountId}`);
    stopFn();
    recordChannelRuntimeState({
      channel: "lark",
      accountId: resolvedAccountId,
      state: {
        running: false,
        lastStopAt: Date.now(),
      },
    });
  };

  abortSignal?.addEventListener("abort", stopHandler);

  return {
    account,
    stop: () => {
      stopHandler();
      abortSignal?.removeEventListener("abort", stopHandler);
    },
  };
}

async function startWebSocketMode(opts: {
  appId: string;
  appSecret: string;
  accountId: string;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  domain: "feishu" | "lark";
}): Promise<() => void> {
  const { appId, appSecret, accountId, config, runtime, domain } = opts;

  logVerbose(`lark: starting WebSocket mode for account ${accountId}`);

  // Create event dispatcher
  const eventDispatcher = new lark.EventDispatcher({}).register({
    "im.message.receive_v1": async (data: unknown) => {
      console.log(`[lark] Received im.message.receive_v1 event:`, JSON.stringify(data, null, 2));
      await handleLarkMessage(data as LarkMessageEvent, {
        accountId,
        config,
        runtime,
      });
    },
  });

  console.log(`[lark] Creating WSClient with appId=${appId}, domain=${domain}`);

  // Create WebSocket client with more verbose logging for debugging
  const wsClient = new lark.WSClient({
    appId,
    appSecret,
    domain: getLarkDomain(domain),
    loggerLevel: lark.LoggerLevel.debug, // Enable debug logging
  });

  console.log(`[lark] Starting WebSocket connection...`);

  // Start WebSocket connection
  void wsClient.start({
    eventDispatcher,
  });

  console.log(`[lark] WebSocket client start() called`);
  logVerbose(`lark: WebSocket connection started for account ${accountId}`);

  return () => {
    // WSClient doesn't have a stop method in current SDK version
    // The connection will be cleaned up when the process ends
    logVerbose(`lark: stopping WebSocket for account ${accountId}`);
  };
}

async function startWebhookMode(opts: {
  appId: string;
  appSecret: string;
  accountId: string;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  webhookPath?: string;
  encryptKey?: string;
  verificationToken?: string;
  domain: "feishu" | "lark";
}): Promise<() => void> {
  const { accountId, config, runtime, webhookPath, encryptKey, verificationToken } = opts;

  logVerbose(`lark: starting Webhook mode for account ${accountId}`);

  // Create event dispatcher with encryption key if provided
  const eventDispatcher = new lark.EventDispatcher({
    encryptKey: encryptKey || undefined,
    verificationToken: verificationToken || undefined,
  }).register({
    "im.message.receive_v1": async (data: unknown) => {
      await handleLarkMessage(data as LarkMessageEvent, {
        accountId,
        config,
        runtime,
      });
    },
  });

  // Register HTTP webhook handler
  const normalizedPath = normalizePluginHttpPath(webhookPath, "/lark/webhook") ?? "/lark/webhook";
  const unregisterHttp = registerPluginHttpRoute({
    path: normalizedPath,
    pluginId: "lark",
    accountId,
    log: (msg) => logVerbose(msg),
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      // Handle GET requests for webhook verification
      if (req.method === "GET") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain");
        res.end("OK");
        return;
      }

      // Only accept POST requests
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET, POST");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
        return;
      }

      try {
        const rawBody = await readRequestBody(req);
        const body = JSON.parse(rawBody);

        // Handle URL verification challenge
        if (body.type === "url_verification" || body.challenge) {
          logVerbose(`lark: handling URL verification challenge`);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ challenge: body.challenge }));
          return;
        }

        // Respond immediately with 200 to avoid Lark timeout
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ code: 0 }));

        // Handle the event
        const eventType = body.header?.event_type;
        if (eventType === "im.message.receive_v1") {
          logVerbose(`lark: received ${eventType} webhook event`);
          await eventDispatcher.invoke(body).catch((err: unknown) => {
            runtime.error?.(danger(`lark webhook handler failed: ${String(err)}`));
          });
        } else {
          logVerbose(`lark: ignoring event type: ${eventType}`);
        }
      } catch (err) {
        runtime.error?.(danger(`lark webhook error: ${String(err)}`));
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
    },
  });

  logVerbose(`lark: registered webhook handler at ${normalizedPath}`);

  return () => {
    unregisterHttp();
    logVerbose(`lark: unregistered webhook handler for account ${accountId}`);
  };
}
