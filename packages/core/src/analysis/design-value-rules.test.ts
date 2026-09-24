import { describe, expect, it } from "vitest";
import { classifyFileContext, isDesignDeclaration, isSvgPaintProperty, isTailwindDesignValue, parseArbitraryClass } from "./design-value-rules.js";

describe("classifyFileContext", () => {
  it("recognises artwork by path and by content", () => {
    expect(classifyFileContext("apps/webapp/app/assets/icons/BunLogoIcon.tsx")).toBe("artwork");
    expect(classifyFileContext("packages/ui/src/icons/youtube.tsx")).toBe("artwork");
    expect(classifyFileContext("src/components/MachineIcon.tsx")).toBe("artwork");
    const svgOnly = `export const Mark = () => (<svg viewBox="0 0 10 10"><g><path fill="#f00" d="M0 0"/><stop stopColor="#fff"/></g></svg>);`;
    expect(classifyFileContext("src/components/Mark.tsx", svgOnly)).toBe("artwork");
    const mixed = `export const Card = () => (<div><svg><path fill="#f00"/></svg><p style={{ color: '#333' }}>x</p></div>);`;
    expect(classifyFileContext("src/components/Card.tsx", mixed)).toBeNull();
  });

  it("recognises email templates, OG images and tests", () => {
    expect(classifyFileContext("packages/email/src/templates/welcome.tsx")).toBe("email");
    expect(classifyFileContext("src/notify/Receipt.tsx", `import { Html, Button } from '@react-email/components';`)).toBe("email");
    expect(classifyFileContext("app/blog/[slug]/opengraph-image.tsx")).toBe("og-image");
    expect(classifyFileContext("app/api/share/route.tsx", `import { ImageResponse } from 'next/og';`)).toBe("og-image");
    expect(classifyFileContext("src/Button.stories.tsx")).toBe("test-or-story");
    expect(classifyFileContext("src/__stories__/showcase/lifecycle.front-component.tsx")).toBe("test-or-story");
    expect(classifyFileContext("apps/webapp/app/routes/storybook.colors/route.tsx")).toBe("test-or-story");
    expect(classifyFileContext("src/components/Button.tsx", "export const Button = () => <button/>")).toBeNull();
    for (const p of ["packages/surveys/src/styles/preflight.css", "src/normalize.css", "packages/editor/src/styles/github-dark.css", "styles/prism-okaidia.css"]) {
      expect(classifyFileContext(p), p).toBe("third-party");
    }
    expect(classifyFileContext("src/styles/editor.css")).toBeNull();
  });

  it("treats SVG paint properties as artwork", () => {
    for (const p of ["fill", "stroke", "stopColor", "stop-color"]) expect(isSvgPaintProperty(p)).toBe(true);
    expect(isSvgPaintProperty("color")).toBe(false);
    expect(isSvgPaintProperty("background-color")).toBe(false);
  });
});

describe("isTailwindDesignValue", () => {
  it("flags literal design values", () => {
    for (const c of ["bg-[#3b82f6]", "hover:text-[#1a1a18]", "text-[13px]", "p-[7px]", "sm:gap-[18px]", "rounded-[10px]",
      "shadow-[0_4px_12px_#0001]", "tracking-[-0.02em]", "leading-[1.15]", "font-[600]", "font-[450]", "border-[2px]", "bg-[rgb(1,2,3)]/50",
      "text-[hsl(280,100%,70%)]", "bg-[hsla(0,0%,0%,0.5)]", "text-[color:hsl(0,0%,100%)]", "outline-offset-[4px]"]) {
      expect(isTailwindDesignValue(c), c).toBe(true);
    }
  });

  it("ignores tokens, layout maths, mechanics and keywords", () => {
    for (const c of ["text-[var(--brand)]", "border-[var(--brand)]", "w-(--button-width)", "[--offset:10px]", "[animation-fill-mode:both]",
      "transition-[transform,opacity]", "min-h-[100dvh]", "w-[calc(100%-2rem)]", "grid-cols-[minmax(440px,1fr)_1fr]", "rounded-[inherit]",
      "aspect-[900/580]", "w-[340px]", "max-w-[370px]", "scale-x-[1.6]", "blur-[50px]", "duration-[250ms]", "z-[1]",
      "bg-[conic-gradient(from_90deg,#F00_5deg,#EAB308_63deg)]", "data-[state=open]:bg-white", "[&_input]:p-2",
      "p-[0px]", "border-[1px]", "right-[-10px]", "top-[3px]", "inset-x-[12px]", "rounded-[9999px]", "gap-[1px]", "bg-[url(/x.png)]",
      "shadow-[0_0_0_1px_hsl(var(--sidebar-border))]", "w-[hsl(1,2%,3%)]"]) {
      expect(isTailwindDesignValue(c), c).toBe(false);
    }
  });

  it("parses variants, including bracketed ones", () => {
    expect(parseArbitraryClass("[&_svg]:hover:bg-[#fff]")).toEqual({ utility: "bg", value: "#fff" });
    expect(parseArbitraryClass("data-[state=open]:p-[7px]")).toEqual({ utility: "p", value: "7px" });
    expect(parseArbitraryClass("[mask-image:none]")).toBeNull();
  });
});

describe("isDesignDeclaration", () => {
  it("keeps colour, spacing, type and radius literals", () => {
    for (const [p, v] of [["color", "#333"], ["backgroundColor", "rgba(0,0,0,.5)"], ["padding", "12px"], ["fontSize", "15px"], ["borderRadius", "6px"], ["gap", "0.75rem"],
      ["color", "#e2e8f0 !important"], ["box-shadow", "0 1px 2px rgba(0,0,0,.1)"], ["font-weight", "600"]]) {
      expect(isDesignDeclaration(p!, v!), `${p}: ${v}`).toBe(true);
    }
  });
  it("drops layout geometry, keywords, maths, hairlines and SVG paint", () => {
    for (const [p, v] of [["height", "100vh"], ["left", "260px"], ["width", "340px"], ["height", "1px"], ["padding", "0"], ["margin", "auto"],
      ["width", "calc(100% - 2rem)"], ["fill", "#fbf0df"], ["stroke", "#000"], ["maxWidth", "70ch"], ["padding", "5%"],
      ["background-color", "rgba(0, 0, 0, 0)"], ["color", "#0000"], ["box-shadow", "none !important"], ["font-weight", "bold"], ["font-weight", "700"], ["font-weight", "400 !important"],
      ["border-radius", "99px"], ["border-radius", "9999px"]]) {
      expect(isDesignDeclaration(p!, v!), `${p}: ${v}`).toBe(false);
    }
  });
});
