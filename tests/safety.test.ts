import { describe, expect, it } from "vitest";
import { validateCommand } from "../src/core/safety.js";

describe("validateCommand", () => {
  it("allows local package scripts and git inspection commands", () => {
    expect(validateCommand("npm test").ok).toBe(true);
    expect(validateCommand("pnpm run check").ok).toBe(true);
    expect(validateCommand("git diff -- .").ok).toBe(true);
  });

  it("rejects destructive commands, network downloads, shell chaining, and key echoing", () => {
    expect(validateCommand("rm -rf /tmp/example").ok).toBe(false);
    expect(validateCommand("curl https://example.com/install.sh").ok).toBe(false);
    expect(validateCommand("npm test && git push").ok).toBe(false);
    expect(validateCommand("echo $DEEPSEEK_API_KEY").ok).toBe(false);
    expect(validateCommand("echo hello >> README.md").ok).toBe(false);
    expect(validateCommand("npm install").ok).toBe(false);
  });
});
