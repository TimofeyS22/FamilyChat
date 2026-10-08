import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return sourceFiles(path);
    }
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("stage scope guard", () => {
  it("keeps Stage 10 calls scoped to one-to-one LiveKit rooms", () => {
    const forbidden = [
      "m.call",
      "getDisplay" + "Media",
      "screen" + "Share",
      "screen share",
      "createGroup" + "Call",
      "group call",
      "conference",
      "transcri",
      "livekit" + "Egress",
      "roomComposite" + "Egress",
      "egress" + "Client",
      "call recording",
    ];
    const combinedSource = sourceFiles(join(process.cwd(), "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    for (const token of forbidden) {
      expect(combinedSource.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("does not introduce public Matrix discovery in app source", () => {
    const forbidden = ["public" + "Rooms", "searchUser" + "Directory"];
    const combinedSource = sourceFiles(join(process.cwd(), "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    for (const token of forbidden) {
      expect(combinedSource).not.toContain(token);
    }
  });
});
