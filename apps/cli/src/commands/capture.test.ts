import { describe, expect, it } from "vitest";
import { hostPage } from "./capture.js";

describe("buoy see host page", () => {
  const page = hostPage([{ slug: "gallery", name: "Component gallery", description: "Every component <rendered>" }], "my-app");

  it("has an inline script that parses", () => {
    const script = page.slice(page.indexOf("<script>") + 8, page.lastIndexOf("</script>"));
    expect(() => new Function(script)).not.toThrow();
  });

  it("sandboxes visualizers and blocks their network access", () => {
    expect(page).toContain('sandbox="allow-scripts"');
    expect(page).not.toContain("allow-same-origin");
    expect(page).toContain("connect-src 'none'");
  });

  it("escapes visualizer text", () => {
    expect(page).toContain("Every component &lt;rendered&gt;");
  });
});
