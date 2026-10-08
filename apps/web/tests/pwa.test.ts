import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function publicFile(path: string) {
  return readFileSync(join(process.cwd(), "public", path), "utf8");
}

describe("PWA assets", () => {
  it("declares an installable manifest with local icons", () => {
    const manifest = JSON.parse(publicFile("manifest.webmanifest")) as {
      background_color?: string;
      display?: string;
      icons?: { purpose?: string; src?: string; sizes?: string }[];
      name?: string;
      start_url?: string;
      theme_color?: string;
    };

    expect(manifest.name).toBe("FamilyChat");
    expect(manifest.background_color).toBe("#ffffff");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/chats");
    expect(manifest.theme_color).toBe("#ffffff");
    expect(manifest.icons?.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons?.some((icon) => icon.sizes === "512x512")).toBe(true);
    expect(manifest.icons?.some((icon) => icon.purpose?.includes("maskable"))).toBe(true);
  });

  it("keeps the service worker offline cache scoped to the fallback shell", () => {
    const serviceWorker = publicFile("sw.js");

    expect(serviceWorker).toContain("/offline.html");
    expect(serviceWorker).toContain("request.mode !== \"navigate\"");
    expect(serviceWorker).toContain("self.addEventListener(\"push\"");
    expect(serviceWorker).toContain("\"Новое сообщение\"");
    expect(serviceWorker).not.toContain("Новое сообщение в FamilyChat");
    expect(serviceWorker).not.toContain("/api/");
    expect(serviceWorker).not.toContain("/_matrix/");
    expect(serviceWorker).not.toContain("room_id");
    expect(serviceWorker).not.toContain("event_id");
  });
});
