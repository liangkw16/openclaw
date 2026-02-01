import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setLarkRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function getLarkRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Lark runtime not initialized - plugin not registered");
  }
  return runtime;
}
