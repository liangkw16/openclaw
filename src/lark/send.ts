import { loadConfig } from "../config/config.js";
import { logVerbose } from "../globals.js";
import { recordChannelActivity } from "../infra/channel-activity.js";
import { resolveLarkAccount } from "./accounts.js";
import { createLarkClient } from "./client.js";
import type { LarkSendResult, LarkInteractiveCard, LarkPostContent } from "./types.js";

interface LarkSendOpts {
  appId?: string;
  appSecret?: string;
  accountId?: string;
  verbose?: boolean;
  replyToMessageId?: string;
}

function resolveCredentials(
  explicit: { appId?: string; appSecret?: string },
  params: { accountId: string; appId: string; appSecret: string },
): { appId: string; appSecret: string } {
  const appId = explicit.appId?.trim() || params.appId;
  const appSecret = explicit.appSecret?.trim() || params.appSecret;

  if (!appId) {
    throw new Error(
      `Lark App ID missing for account "${params.accountId}" (set channels.lark.appId or LARK_APP_ID).`,
    );
  }
  if (!appSecret) {
    throw new Error(
      `Lark App Secret missing for account "${params.accountId}" (set channels.lark.appSecret or LARK_APP_SECRET).`,
    );
  }
  return { appId, appSecret };
}

function normalizeTarget(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) {
    throw new Error("Recipient is required for Lark sends");
  }

  // Strip internal prefixes (lark:chat:, lark:user:, lark:)
  let normalized = trimmed
    .replace(/^lark:chat:/i, "")
    .replace(/^lark:user:/i, "")
    .replace(/^lark:/i, "");

  if (!normalized) {
    throw new Error("Recipient is required for Lark sends");
  }

  return normalized;
}

/**
 * Determine the receive_id_type based on the ID format
 * - open_id: starts with "ou_"
 * - user_id: starts with "on_" or custom user ID
 * - union_id: starts with "on_"
 * - chat_id: starts with "oc_"
 */
function getReceiveIdType(id: string): "open_id" | "user_id" | "chat_id" | "union_id" {
  if (id.startsWith("oc_")) {
    return "chat_id";
  }
  if (id.startsWith("ou_")) {
    return "open_id";
  }
  if (id.startsWith("on_")) {
    return "union_id";
  }
  // Default to open_id for user messages
  return "open_id";
}

export async function sendMessageLark(
  to: string,
  text: string,
  opts: LarkSendOpts = {},
): Promise<LarkSendResult> {
  const cfg = loadConfig();
  const account = resolveLarkAccount({
    cfg,
    accountId: opts.accountId,
  });
  const { appId, appSecret } = resolveCredentials(
    { appId: opts.appId, appSecret: opts.appSecret },
    account,
  );
  const chatId = normalizeTarget(to);
  const receiveIdType = getReceiveIdType(chatId);

  const client = createLarkClient({
    appId,
    appSecret,
    domain: account.config.domain,
  });

  const content = JSON.stringify({ text: text.trim() });

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: chatId,
      content,
      msg_type: "text",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Lark API error: ${response.msg || response.code}`);
  }

  const messageId = response.data?.message_id ?? "sent";

  recordChannelActivity({
    channel: "lark",
    accountId: account.accountId,
    direction: "outbound",
  });

  if (opts.verbose) {
    logVerbose(`lark: sent message to ${chatId}`);
  }

  return {
    messageId,
    chatId,
  };
}

export async function pushMessageLark(
  to: string,
  text: string,
  opts: LarkSendOpts = {},
): Promise<LarkSendResult> {
  return sendMessageLark(to, text, opts);
}

export async function replyMessageLark(
  messageId: string,
  text: string,
  opts: { appId?: string; appSecret?: string; accountId?: string; verbose?: boolean } = {},
): Promise<LarkSendResult> {
  const cfg = loadConfig();
  const account = resolveLarkAccount({
    cfg,
    accountId: opts.accountId,
  });
  const { appId, appSecret } = resolveCredentials(
    { appId: opts.appId, appSecret: opts.appSecret },
    account,
  );

  const client = createLarkClient({
    appId,
    appSecret,
    domain: account.config.domain,
  });

  const content = JSON.stringify({ text: text.trim() });

  const response = await client.im.message.reply({
    path: { message_id: messageId },
    data: {
      content,
      msg_type: "text",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Lark API error: ${response.msg || response.code}`);
  }

  const newMessageId = response.data?.message_id ?? "replied";

  recordChannelActivity({
    channel: "lark",
    accountId: account.accountId,
    direction: "outbound",
  });

  if (opts.verbose) {
    logVerbose(`lark: replied to message ${messageId}`);
  }

  return {
    messageId: newMessageId,
    chatId: messageId, // Original message ID as reference
  };
}

export async function sendImageLark(
  to: string,
  imageKey: string,
  opts: LarkSendOpts = {},
): Promise<LarkSendResult> {
  const cfg = loadConfig();
  const account = resolveLarkAccount({
    cfg,
    accountId: opts.accountId,
  });
  const { appId, appSecret } = resolveCredentials(
    { appId: opts.appId, appSecret: opts.appSecret },
    account,
  );
  const chatId = normalizeTarget(to);
  const receiveIdType = getReceiveIdType(chatId);

  const client = createLarkClient({
    appId,
    appSecret,
    domain: account.config.domain,
  });

  const content = JSON.stringify({ image_key: imageKey });

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: chatId,
      content,
      msg_type: "image",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Lark API error: ${response.msg || response.code}`);
  }

  const messageId = response.data?.message_id ?? "sent";

  recordChannelActivity({
    channel: "lark",
    accountId: account.accountId,
    direction: "outbound",
  });

  if (opts.verbose) {
    logVerbose(`lark: sent image to ${chatId}`);
  }

  return {
    messageId,
    chatId,
  };
}

export async function sendInteractiveCardLark(
  to: string,
  card: LarkInteractiveCard,
  opts: LarkSendOpts = {},
): Promise<LarkSendResult> {
  const cfg = loadConfig();
  const account = resolveLarkAccount({
    cfg,
    accountId: opts.accountId,
  });
  const { appId, appSecret } = resolveCredentials(
    { appId: opts.appId, appSecret: opts.appSecret },
    account,
  );
  const chatId = normalizeTarget(to);
  const receiveIdType = getReceiveIdType(chatId);

  const client = createLarkClient({
    appId,
    appSecret,
    domain: account.config.domain,
  });

  const content = JSON.stringify(card);

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: chatId,
      content,
      msg_type: "interactive",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Lark API error: ${response.msg || response.code}`);
  }

  const messageId = response.data?.message_id ?? "sent";

  recordChannelActivity({
    channel: "lark",
    accountId: account.accountId,
    direction: "outbound",
  });

  if (opts.verbose) {
    logVerbose(`lark: sent interactive card to ${chatId}`);
  }

  return {
    messageId,
    chatId,
  };
}

export async function sendPostLark(
  to: string,
  post: LarkPostContent,
  opts: LarkSendOpts = {},
): Promise<LarkSendResult> {
  const cfg = loadConfig();
  const account = resolveLarkAccount({
    cfg,
    accountId: opts.accountId,
  });
  const { appId, appSecret } = resolveCredentials(
    { appId: opts.appId, appSecret: opts.appSecret },
    account,
  );
  const chatId = normalizeTarget(to);
  const receiveIdType = getReceiveIdType(chatId);

  const client = createLarkClient({
    appId,
    appSecret,
    domain: account.config.domain,
  });

  // Post content uses zh_cn or en_us locale
  const content = JSON.stringify({
    zh_cn: post,
  });

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: chatId,
      content,
      msg_type: "post",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Lark API error: ${response.msg || response.code}`);
  }

  const messageId = response.data?.message_id ?? "sent";

  recordChannelActivity({
    channel: "lark",
    accountId: account.accountId,
    direction: "outbound",
  });

  if (opts.verbose) {
    logVerbose(`lark: sent post to ${chatId}`);
  }

  return {
    messageId,
    chatId,
  };
}

/**
 * Upload an image to Lark and get an image_key for sending
 */
export async function uploadImageLark(
  imageBuffer: Buffer,
  imageType: "message" | "avatar" = "message",
  opts: { appId?: string; appSecret?: string; accountId?: string } = {},
): Promise<string> {
  const cfg = loadConfig();
  const account = resolveLarkAccount({
    cfg,
    accountId: opts.accountId,
  });
  const { appId, appSecret } = resolveCredentials(
    { appId: opts.appId, appSecret: opts.appSecret },
    account,
  );

  const client = createLarkClient({
    appId,
    appSecret,
    domain: account.config.domain,
  });

  const response = (await client.im.image.create({
    data: {
      image_type: imageType,
      image: imageBuffer,
    },
  })) as { code?: number; msg?: string; data?: { image_key?: string } };

  if (response.code !== 0) {
    throw new Error(`Lark API error: ${response.msg || response.code}`);
  }

  const imageKey = response.data?.image_key;
  if (!imageKey) {
    throw new Error("Failed to upload image: no image_key returned");
  }

  return imageKey;
}
