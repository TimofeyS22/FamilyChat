import { describe, expect, it } from "vitest";

import { formatPeerPresenceLabel, matrixPresenceFromUser } from "@/features/matrix/presence";
import type { MatrixUserPresence } from "@/features/matrix/types";

describe("matrixPresenceFromUser", () => {
  it("uses absolute last active timestamp from matrix user fields", () => {
    const now = 1_700_000_000_000;
    const presence = matrixPresenceFromUser(
      {
        currentlyActive: false,
        lastActiveAgo: 5 * 60 * 1000,
        lastPresenceTs: now - 10 * 60 * 1000,
        presence: "offline",
        userId: "@mama:familychat.local",
      },
      "@mama:familychat.local",
    );

    expect(presence?.lastActiveAt).toBe(now - 15 * 60 * 1000);
  });

  it("prefers getLastActiveTs when available", () => {
    const presence = matrixPresenceFromUser(
      {
        getLastActiveTs: () => 1_699_999_000_000,
        presence: "offline",
        userId: "@mama:familychat.local",
      },
      "@mama:familychat.local",
    );

    expect(presence?.lastActiveAt).toBe(1_699_999_000_000);
  });
});

describe("formatPeerPresenceLabel", () => {
  it("shows online status for active peers", () => {
    const presence: MatrixUserPresence = {
      currentlyActive: true,
      presence: "online",
      userId: "@mama:familychat.local",
    };
    expect(formatPeerPresenceLabel(presence)).toBe("в сети");
  });

  it("formats last seen time", () => {
    const now = 1_700_000_000_000;
    const presence: MatrixUserPresence = {
      currentlyActive: false,
      lastActiveAt: now - 5 * 60 * 1000,
      presence: "offline",
      userId: "@mama:familychat.local",
    };
    expect(formatPeerPresenceLabel(presence, now)).toBe("был(а) 5 мин назад");
  });

  it("uses message activity fallback when presence has no timestamp", () => {
    const now = 1_700_000_000_000;
    expect(formatPeerPresenceLabel(undefined, now, now - 2 * 60 * 60 * 1000)).toBe("был(а) 2 ч назад");
  });

  it("shows last seen when presence is online but last activity is old", () => {
    const now = 1_700_000_000_000;
    const presence: MatrixUserPresence = {
      currentlyActive: false,
      presence: "online",
      userId: "@mama:familychat.local",
    };

    expect(formatPeerPresenceLabel(presence, now, now - 2 * 60 * 60 * 1000)).toBe("был(а) 2 ч назад");
  });
});
