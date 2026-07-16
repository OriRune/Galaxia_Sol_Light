import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Vercel production configuration", () => {
  it("uses the exact SPA, cache, security, and feature-preserving policy", async () => {
    const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
      framework: string;
      buildCommand: string;
      outputDirectory: string;
      rewrites: { source: string; destination: string }[];
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    expect(config).toMatchObject({
      framework: "vite",
      buildCommand: "npm run build",
      outputDirectory: "dist",
      rewrites: [{ source: "/(.*)", destination: "/index.html" }],
    });
    const global = config.headers.find((entry) => entry.source === "/(.*)")?.headers;
    const csp = global?.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("https:");
    expect(csp).not.toContain("Cross-Origin");
    expect(global).toEqual(
      expect.arrayContaining([
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ]),
    );
    expect(config.headers).toEqual(
      expect.arrayContaining([
        {
          source: "/assets/(.*)",
          headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
        },
        {
          source: "/index.html",
          headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
        },
      ]),
    );
  });
});
