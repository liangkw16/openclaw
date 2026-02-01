import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  resolveLarkAccount,
  listLarkAccountIds,
  resolveDefaultLarkAccountId,
  normalizeAccountId,
  DEFAULT_ACCOUNT_ID,
} from "./accounts.js";
import type { OpenClawConfig } from "../config/config.js";

describe("Lark accounts", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("resolveLarkAccount", () => {
    it("resolves account from config", () => {
      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            appId: "cli_test123",
            appSecret: "secret123",
            enabled: true,
          },
        },
      };

      const account = resolveLarkAccount({ cfg });

      expect(account.accountId).toBe(DEFAULT_ACCOUNT_ID);
      expect(account.appId).toBe("cli_test123");
      expect(account.appSecret).toBe("secret123");
      expect(account.enabled).toBe(true);
      expect(account.tokenSource).toBe("config");
    });

    it("resolves account from env for default account", () => {
      process.env.LARK_APP_ID = "cli_env123";
      process.env.LARK_APP_SECRET = "envsecret123";

      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            enabled: true,
          },
        },
      };

      const account = resolveLarkAccount({ cfg });

      expect(account.appId).toBe("cli_env123");
      expect(account.appSecret).toBe("envsecret123");
      expect(account.tokenSource).toBe("env");
    });

    it("resolves named account from accounts section", () => {
      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            enabled: true,
            accounts: {
              prod: {
                appId: "cli_prod123",
                appSecret: "prodsecret123",
                enabled: true,
                name: "Production Bot",
              },
            },
          },
        },
      };

      const account = resolveLarkAccount({ cfg, accountId: "prod" });

      expect(account.accountId).toBe("prod");
      expect(account.appId).toBe("cli_prod123");
      expect(account.appSecret).toBe("prodsecret123");
      expect(account.name).toBe("Production Bot");
      expect(account.enabled).toBe(true);
    });

    it("prefers config over env", () => {
      process.env.LARK_APP_ID = "cli_env123";
      process.env.LARK_APP_SECRET = "envsecret123";

      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            appId: "cli_config123",
            appSecret: "configsecret123",
            enabled: true,
          },
        },
      };

      const account = resolveLarkAccount({ cfg });

      expect(account.appId).toBe("cli_config123");
      expect(account.appSecret).toBe("configsecret123");
      expect(account.tokenSource).toBe("config");
    });

    it("returns empty credentials when not configured", () => {
      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            enabled: true,
          },
        },
      };

      const account = resolveLarkAccount({ cfg });

      expect(account.appId).toBe("");
      expect(account.appSecret).toBe("");
      expect(account.tokenSource).toBe("none");
    });
  });

  describe("listLarkAccountIds", () => {
    it("returns default account when base config has appId", () => {
      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            appId: "cli_test123",
            appSecret: "secret123",
          },
        },
      };

      const ids = listLarkAccountIds(cfg);

      expect(ids).toContain(DEFAULT_ACCOUNT_ID);
    });

    it("returns named accounts from accounts section", () => {
      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            accounts: {
              prod: { appId: "cli_prod123", appSecret: "secret1" },
              dev: { appId: "cli_dev123", appSecret: "secret2" },
            },
          },
        },
      };

      const ids = listLarkAccountIds(cfg);

      expect(ids).toContain("prod");
      expect(ids).toContain("dev");
    });

    it("returns default account when env is set", () => {
      process.env.LARK_APP_ID = "cli_env123";

      const cfg: OpenClawConfig = {};

      const ids = listLarkAccountIds(cfg);

      expect(ids).toContain(DEFAULT_ACCOUNT_ID);
    });
  });

  describe("resolveDefaultLarkAccountId", () => {
    it("returns default when default account exists", () => {
      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            appId: "cli_test123",
            appSecret: "secret123",
          },
        },
      };

      const id = resolveDefaultLarkAccountId(cfg);

      expect(id).toBe(DEFAULT_ACCOUNT_ID);
    });

    it("returns first named account when no default exists", () => {
      const cfg: OpenClawConfig = {
        channels: {
          lark: {
            accounts: {
              prod: { appId: "cli_prod123", appSecret: "secret1" },
            },
          },
        },
      };

      const id = resolveDefaultLarkAccountId(cfg);

      expect(id).toBe("prod");
    });
  });

  describe("normalizeAccountId", () => {
    it("returns DEFAULT_ACCOUNT_ID for empty string", () => {
      expect(normalizeAccountId("")).toBe(DEFAULT_ACCOUNT_ID);
    });

    it("returns DEFAULT_ACCOUNT_ID for 'default'", () => {
      expect(normalizeAccountId("default")).toBe(DEFAULT_ACCOUNT_ID);
    });

    it("normalizes to lowercase", () => {
      expect(normalizeAccountId("Prod")).toBe("prod");
    });

    it("trims whitespace", () => {
      expect(normalizeAccountId("  prod  ")).toBe("prod");
    });
  });
});
