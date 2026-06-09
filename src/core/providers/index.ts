import { DeepSeekProvider } from "./deepseek.js";
import { MockProvider } from "./mock.js";
import type { HarnessProvider, RunOptions } from "../../types/harness.js";

export function createProvider(kind: RunOptions["provider"]): HarnessProvider {
  if (kind === "mock") return new MockProvider();
  return new DeepSeekProvider();
}
