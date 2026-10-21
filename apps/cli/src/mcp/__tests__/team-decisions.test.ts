import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { BuoyConfig } from "../../config/schema.js";

vi.mock("../../cloud/config.js", () => ({
  getApiToken: vi.fn(() => "tok"),
  getApiEndpoint: vi.fn(() => "https://api.example.test"),
}));

const { configDecisions, fetchCloudDecisions, mergeDecisions, parseGitHubRepo } = await import("../team-decisions.js");
const cloudConfig = await import("../../cloud/config.js");

const config = (drift: Partial<BuoyConfig["drift"]>) => ({ drift: { ignore: [], promote: [], enforce: [], ...drift } }) as unknown as BuoyConfig;

describe("configDecisions", () => {
  it("returns .buoy.yaml rules that apply to the file", () => {
    const out = configDecisions(config({
      ignore: [
        { value: "text-[12.5px]", reason: "our caption size" },
        { value: "#ff3e81", file: "src/marketing/**", reason: "campaign colour" },
      ],
      enforce: [{ type: "hardcoded-color", file: "src/components/**", reason: "components use tokens only" }],
    }), "src/components/Card.tsx");
    expect(out.leaveAlone).toEqual(["text-[12.5px]: our caption size"]);
    expect(out.alwaysFlag).toEqual(["type hardcoded-color in src/components/**: components use tokens only"]);
  });
});

describe("parseGitHubRepo", () => {
  it("reads ssh and https remotes", () => {
    expect(parseGitHubRepo("git@github.com:sastrum/sastrum-app.git")).toBe("sastrum/sastrum-app");
    expect(parseGitHubRepo("https://github.com/ahoybuoy/buoy\n")).toBe("ahoybuoy/buoy");
    expect(parseGitHubRepo("https://gitlab.com/a/b.git")).toBeNull();
  });
});

describe("fetchCloudDecisions", () => {
  afterEach(() => vi.mocked(cloudConfig.getApiToken).mockReturnValue("tok"));

  function repoWithRemote() {
    const dir = mkdtempSync(join(tmpdir(), "buoy-dec-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["remote", "add", "origin", "git@github.com:sastrum/sastrum-app.git"], { cwd: dir });
    return dir;
  }

  it("asks Buoy Cloud for this repo and file", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      file: [{ value: "text-[12.5px]", reason: "by design", source: "reply" }],
      recurring: [{ value: "text-[12.5px]", files: 6, reason: "by design" }],
    }), { status: 200 }));
    const out = await fetchCloudDecisions(repoWithRemote(), "src/a.tsx", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/decisions?repo=sastrum%2Fsastrum-app&file=src%2Fa.tsx",
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
    expect(mergeDecisions({ leaveAlone: [], alwaysFlag: [] }, out).leaveAlone).toEqual([
      "text-[12.5px] in this file: by design",
      "text-[12.5px] (kept in 6 files): by design",
    ]);
  });

  it("degrades quietly: logged out, not on Buoy, or offline", async () => {
    vi.mocked(cloudConfig.getApiToken).mockReturnValue(undefined);
    expect(await fetchCloudDecisions(repoWithRemote(), "a.tsx")).toEqual({ unavailable: expect.stringMatching(/not logged in/) });
    vi.mocked(cloudConfig.getApiToken).mockReturnValue("tok");
    const notFound = vi.fn(async () => new Response("{}", { status: 404 }));
    expect(await fetchCloudDecisions(repoWithRemote(), "a.tsx", notFound as unknown as typeof fetch))
      .toEqual({ unavailable: "sastrum/sastrum-app is not on Buoy Cloud in this account" });
    const offline = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    const merged = mergeDecisions({ leaveAlone: ["x"], alwaysFlag: [] }, await fetchCloudDecisions(repoWithRemote(), "a.tsx", offline as unknown as typeof fetch));
    expect(merged.leaveAlone).toEqual(["x"]);
    expect(merged.sources[1]).toMatch(/did not answer/);
  });
});
