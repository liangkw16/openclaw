import { z } from "zod";

const DmPolicySchema = z.enum(["open", "allowlist", "pairing", "disabled"]);
const GroupPolicySchema = z.enum(["open", "allowlist", "disabled"]);
const LarkDomainSchema = z.enum(["feishu", "lark"]);
const LarkModeSchema = z.enum(["websocket", "webhook"]);

const LarkGroupConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    requireMention: z.boolean().optional(),
    systemPrompt: z.string().optional(),
    skills: z.array(z.string()).optional(),
  })
  .strict();

const LarkAccountConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    appIdFile: z.string().optional(),
    appSecretFile: z.string().optional(),
    encryptKey: z.string().optional(),
    verificationToken: z.string().optional(),
    name: z.string().optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    mode: LarkModeSchema.optional().default("websocket"),
    webhookPath: z.string().optional(),
    domain: LarkDomainSchema.optional().default("feishu"),
    groups: z.record(z.string(), LarkGroupConfigSchema.optional()).optional(),
  })
  .strict();

export const LarkConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    appIdFile: z.string().optional(),
    appSecretFile: z.string().optional(),
    encryptKey: z.string().optional(),
    verificationToken: z.string().optional(),
    name: z.string().optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    mode: LarkModeSchema.optional().default("websocket"),
    webhookPath: z.string().optional(),
    domain: LarkDomainSchema.optional().default("feishu"),
    accounts: z.record(z.string(), LarkAccountConfigSchema.optional()).optional(),
    groups: z.record(z.string(), LarkGroupConfigSchema.optional()).optional(),
  })
  .strict();

export type LarkConfigSchemaType = z.infer<typeof LarkConfigSchema>;
