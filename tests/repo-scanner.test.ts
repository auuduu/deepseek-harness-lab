import { afterEach, describe, expect, it } from "vitest";
import { scanRepo } from "../src/core/repo-scanner.js";
import { createGitFixture } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("scanRepo", () => {
  it("detects git state, package scripts, and candidate source files", async () => {
    const fixture = await createGitFixture();
    cleanup = fixture.cleanup;

    const summary = await scanRepo(fixture.repoPath, "fix calculator add function");

    expect(summary.currentBranch).toMatch(/main|master/);
    expect(summary.isDirty).toBe(false);
    expect(summary.packageManager).toBe("npm");
    expect(summary.packageScripts.test).toBe("node test/calculator.test.js");
    expect(summary.files).toContain("src/calculator.js");
    expect(summary.candidateFiles.some((file) => file.path === "src/calculator.js")).toBe(true);
  });
});
