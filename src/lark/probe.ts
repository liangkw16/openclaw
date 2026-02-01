import type { LarkDomain, LarkProbeResult } from "./types.js";

interface LarkTokenResponse {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
}

export async function probeLarkBot(
  appId: string,
  appSecret: string,
  timeoutMs = 5000,
  domain: LarkDomain = "feishu",
): Promise<LarkProbeResult> {
  if (!appId?.trim()) {
    return { ok: false, error: "App ID not configured" };
  }
  if (!appSecret?.trim()) {
    return { ok: false, error: "App secret not configured" };
  }

  const baseUrl = domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";

  try {
    // Get tenant access token to verify credentials
    const response = await withTimeout(
      fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          app_id: appId.trim(),
          app_secret: appSecret.trim(),
        }),
      }),
      timeoutMs,
    );

    const data = (await response.json()) as LarkTokenResponse;

    if (data.code !== 0) {
      return {
        ok: false,
        error: data.msg || `API error: ${data.code}`,
      };
    }

    return {
      ok: true,
      bot: {
        appName: appId, // We don't have the app name from this API
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}
