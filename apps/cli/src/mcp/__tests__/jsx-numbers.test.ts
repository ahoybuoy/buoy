import { describe, expect, it } from "vitest";
import { extractFileSignals } from "../file-check.js";

// Same cases as the cloud scanner (containers/scanner/test/theme-scale.test.js):
// the CLI and the PR reviewer must read bare JSX numbers the same way.
const values = (src: string, path = "src/A.tsx") => extractFileSignals(src, path).map((s) => String(s.value));
const px = (src: string) => values(src).filter((v) => /px$/.test(v));

describe("bare JSX numbers", () => {
  it("MUI sx (one line or many) is theme steps", () => {
    expect(px(`import { Box } from "@mui/material";\nexport const A = () => <Box sx={{ p: 3, mb: 4 }} />;\n`)).toEqual([]);
    expect(px(`import { Box } from "@mui/material";\nexport const A = () => <Box\n  sx={{\n    gap: 3,\n    borderRadius: 2,\n  }}\n/>;\n`)).toEqual([]);
  });
  it("Chakra style props are theme steps", () => {
    expect(px(`import { Box } from "@chakra-ui/react";\nexport const A = () => <Box gap={4} rounded={2} p={3} />;\n`)).toEqual([]);
  });
  it("style-prop fontSize and letterSpacing are px, not theme steps", () => {
    expect(px(`import { Box } from "@mui/material";\nexport const A = () => <Box fontSize={19} letterSpacing={4} />;\n`)).toEqual(expect.arrayContaining(["19px", "4px"]));
  });
  it("Mantine and plain style objects are px", () => {
    expect(px(`import { Box } from "@mantine/core";\nexport const A = () => <Box p={13} />;\n`)).toContain("13px");
    expect(px(`export const A = () => <div style={{ padding: 13 }} />;\n`)).toContain("13px");
  });
  it("unitless numbers stay numbers", () => {
    const v = values(`export const A = () => <div style={{ lineHeight: 1.5, fontWeight: 600 }} />;\n`);
    expect(v.some((x) => /^(1\.5|600)px$/.test(x))).toBe(false);
  });
});
