export type LarkTokenSource = "config" | "env" | "file" | "none";

export type LarkDomain = "feishu" | "lark";

export interface LarkConfig {
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  appIdFile?: string;
  appSecretFile?: string;
  encryptKey?: string;
  verificationToken?: string;
  name?: string;
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  groupPolicy?: "open" | "allowlist" | "disabled";
  mode?: "websocket" | "webhook";
  webhookPath?: string;
  domain?: LarkDomain;
  accounts?: Record<string, LarkAccountConfig>;
  groups?: Record<string, LarkGroupConfig>;
}

export interface LarkAccountConfig {
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  appIdFile?: string;
  appSecretFile?: string;
  encryptKey?: string;
  verificationToken?: string;
  name?: string;
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  dmPolicy?: "open" | "allowlist" | "pairing" | "disabled";
  groupPolicy?: "open" | "allowlist" | "disabled";
  mode?: "websocket" | "webhook";
  webhookPath?: string;
  domain?: LarkDomain;
  groups?: Record<string, LarkGroupConfig>;
}

export interface LarkGroupConfig {
  enabled?: boolean;
  allowFrom?: Array<string | number>;
  requireMention?: boolean;
  systemPrompt?: string;
  skills?: string[];
}

export interface ResolvedLarkAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  appId: string;
  appSecret: string;
  tokenSource: LarkTokenSource;
  config: LarkConfig & LarkAccountConfig;
}

export interface LarkSendResult {
  messageId: string;
  chatId: string;
}

export interface LarkProbeResult {
  ok: boolean;
  bot?: {
    appName?: string;
    openId?: string;
    avatarUrl?: string;
  };
  error?: string;
}

export type LarkMessageType =
  | "text"
  | "image"
  | "file"
  | "audio"
  | "video"
  | "post"
  | "interactive";

export interface LarkWebhookContext {
  messageId: string;
  chatId: string;
  chatType: "p2p" | "group";
  senderId: string;
  senderType: "user" | "bot";
  messageType: LarkMessageType;
  content: unknown;
  mentions?: LarkMention[];
  rootId?: string;
  parentId?: string;
}

export interface LarkMention {
  key: string;
  id: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  name: string;
}

export interface LarkChannelData {
  interactive?: LarkInteractiveCard;
  post?: LarkPostContent;
}

export interface LarkInteractiveCard {
  header?: {
    title?: {
      tag: "plain_text" | "lark_md";
      content: string;
    };
    template?: string;
  };
  elements: unknown[];
}

export interface LarkPostContent {
  title?: string;
  content: Array<Array<LarkPostElement>>;
}

export type LarkPostElement =
  | { tag: "text"; text: string }
  | { tag: "a"; text: string; href: string }
  | { tag: "at"; user_id: string; user_name?: string }
  | { tag: "img"; image_key: string; width?: number; height?: number };
