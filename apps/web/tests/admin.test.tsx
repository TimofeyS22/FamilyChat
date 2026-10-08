import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AdminShell } from "@/features/admin/admin-shell";
import { useAuthStore } from "@/features/auth/auth-store";

import { mockRouter } from "./setup";

const adminToken = tokenWithRole("admin");
const memberToken = tokenWithRole("member");

function tokenWithRole(role: "admin" | "member") {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "none" })}.${encode({ role, sub: `${role}-user` })}.signature`;
}

function authenticate(role: "admin" | "member") {
  useAuthStore.setState({
    accessToken: role === "admin" ? adminToken : memberToken,
    hydrated: true,
    isAuthenticated: true,
    role,
  });
}

function unauthenticated() {
  useAuthStore.setState({
    accessToken: null,
    hydrated: true,
    isAuthenticated: false,
    role: "unknown",
  });
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    }),
  );
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof Request) {
    return input.url;
  }
  return input.toString();
}

function requestPath(input: RequestInfo | URL) {
  return new URL(requestUrl(input)).pathname + new URL(requestUrl(input)).search;
}

function usersResponse(memberActive = true) {
  return [
    {
      adminRef: "user_admin_ref",
      canDeactivate: false,
      createdAt: "2026-06-20T10:00:00Z",
      deactivateBlockedReason:
        "You cannot deactivate your own admin account. The last active admin cannot be deactivated.",
      displayName: "Family Admin",
      familyCode: "ADM-0001",
      isActive: true,
      role: "admin",
      technicalStatus: "active",
      updatedAt: "2026-06-20T10:00:00Z",
      username: "familyadmin",
    },
    {
      adminRef: "user_member_ref",
      canDeactivate: memberActive,
      createdAt: "2026-06-21T10:00:00Z",
      deactivateBlockedReason: memberActive ? null : "User is already inactive.",
      displayName: "Member",
      familyCode: "MEM-0001",
      isActive: memberActive,
      role: "member",
      technicalStatus: memberActive ? "active" : "inactive",
      updatedAt: "2026-06-21T10:00:00Z",
      username: "member",
    },
  ];
}

const invitesResponse = [
  {
    adminRef: "invite_unused_ref",
    boundDisplayName: "Mama",
    createdAt: "2026-06-22T10:00:00Z",
    disabledAt: null,
    expiresAt: null,
    label: "MAMA",
    maxUses: 1,
    status: "unused",
    usedAt: null,
    usedCount: 0,
  },
  {
    adminRef: "invite_used_ref",
    boundDisplayName: null,
    createdAt: "2026-06-22T11:00:00Z",
    disabledAt: null,
    expiresAt: null,
    label: "USED",
    maxUses: 1,
    status: "used",
    usedAt: "2026-06-22T12:00:00Z",
    usedCount: 1,
  },
  {
    adminRef: "invite_disabled_ref",
    boundDisplayName: null,
    createdAt: "2026-06-22T13:00:00Z",
    disabledAt: "2026-06-22T14:00:00Z",
    expiresAt: null,
    label: "OLD",
    maxUses: 1,
    status: "disabled",
    usedAt: null,
    usedCount: 0,
  },
];

const statusResponse = {
  api: { detail: "Family API is responding.", status: "ok" },
  services: [
    { detail: "Database connectivity check passed.", name: "Database", status: "ok" },
    { detail: "Matrix admin connectivity check passed.", name: "Matrix", status: "ok" },
    { detail: "LiveKit calls are disabled.", name: "LiveKit", status: "disabled" },
    { detail: "Web Push is disabled.", name: "Web Push", status: "disabled" },
  ],
  stageBlockers: [
    { detail: "Browser file-picker live smoke remains pending.", stage: "Stage 7", status: "partial" },
    {
      detail: "Real browser microphone record/send/play smoke remains pending.",
      stage: "Stage 8",
      status: "partial",
    },
    {
      detail: "Real browser Web Push subscribe/delivery smoke remains pending.",
      stage: "Stage 9",
      status: "partial",
    },
    {
      detail: "Real browser LiveKit audio/video call smoke remains pending.",
      stage: "Stage 10",
      status: "partial",
    },
  ],
};

const auditResponse = {
  items: [
    {
      action: "invite.created",
      actorLabel: "familyadmin",
      createdAt: "2026-06-22T10:00:00Z",
      metadata: { label: "MAMA", max_uses: 1 },
      targetLabel: "Invite code",
      targetType: "invite",
    },
    {
      action: "message.body.leak-test",
      actorLabel: "familyadmin",
      createdAt: "2026-06-22T11:00:00Z",
      metadata: {},
      targetLabel: "Technical event",
      targetType: "room",
    },
  ],
  limit: 25,
  offset: 0,
};

const diagnosticsResponse = {
  matrixPushGatewayConfigured: true,
  matrixPusherAppId: "familychat.web",
  pushAvailable: true,
  users: [
    {
      activePushCount: 1,
      adminRef: "user_admin_ref",
      displayName: "Family Admin",
      isActive: true,
      latestPushUpdatedAt: "2026-06-22T10:00:00Z",
      role: "admin",
      subscriptions: [],
      totalPushCount: 1,
      username: "familyadmin",
    },
    {
      activePushCount: 0,
      adminRef: "user_member_ref",
      displayName: "Member",
      isActive: true,
      latestPushUpdatedAt: null,
      role: "member",
      subscriptions: [],
      totalPushCount: 0,
      username: "member",
    },
  ],
};

function installAdminFetch(options: { memberActive?: boolean } = {}) {
  const calls: Array<{ body?: unknown; path: string }> = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = requestPath(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ body, path });
    if (path === "/api/admin/users") {
      return jsonResponse(usersResponse(options.memberActive ?? true));
    }
    if (path === "/api/invites") {
      if (init?.method === "POST") {
        return jsonResponse(
          {
            adminRef: "invite_created_ref",
            code: "MAMA-ONETIME",
            expiresAt: null,
            label: "MAMA",
            maxUses: 1,
            status: "unused",
          },
          201,
        );
      }
      return jsonResponse(invitesResponse);
    }
    if (path === "/api/admin/status") {
      return jsonResponse(statusResponse);
    }
    if (path === "/api/admin/audit?limit=25") {
      return jsonResponse(auditResponse);
    }
    if (path === "/api/admin/diagnostics") {
      return jsonResponse(diagnosticsResponse);
    }
    if (path === "/api/admin/users/user_member_ref/deactivate") {
      return jsonResponse({ success: true });
    }
    if (path === "/api/invites/invite_unused_ref/disable") {
      return jsonResponse({ success: true });
    }
    return jsonResponse({ detail: "unexpected admin request" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function expectNoSensitiveAdminText() {
  const html = document.body.textContent ?? "";
  for (const forbidden of [
    "00000000-0000-0000",
    "@member:familychat.local",
    "not-rendered-family-token",
    "fake-matrix-token",
    "code_hash",
    "invite_pepper",
    "mxc://",
    "!room",
    "$event",
    "private message body",
    "LIVEKIT_API_SECRET",
    "DATABASE_URL",
  ]) {
    expect(html).not.toContain(forbidden);
  }
}

describe("admin panel", () => {
  it("blocks unauthenticated admin access through the protected route", async () => {
    unauthenticated();

    render(<AdminShell />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });

  it("shows access denied for members without rendering admin sections", async () => {
    authenticate("member");
    const fetchMock = vi.fn(() => jsonResponse({ detail: "Admin access required" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminShell />);

    expect(await screen.findByText("Admin access required")).toBeInTheDocument();
    expect(screen.queryByText("Invite codes")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not show admin data before authorization data loads", async () => {
    authenticate("admin");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    render(<AdminShell />);

    expect(screen.getByText("Loading admin workspace")).toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });

  it("renders the admin workspace with safe users, invites, status, and audit", async () => {
    authenticate("admin");
    installAdminFetch();

    render(<AdminShell />);

    expect(await screen.findByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Invite codes")).toBeInTheDocument();
    expect(screen.getByText("Technical status")).toBeInTheDocument();
    expect(screen.getByText("Audit log")).toBeInTheDocument();
    expect(screen.getByText("Family Admin")).toBeInTheDocument();
    expect(screen.getByText("MEM-0001")).toBeInTheDocument();
    expect(screen.getAllByText("MAMA").length).toBeGreaterThan(0);
    expect(screen.getByText("USED")).toBeInTheDocument();
    expect(screen.getAllByText("partial")).toHaveLength(4);
    expect(screen.queryByText(/DONE/i)).not.toBeInTheDocument();
    expectNoSensitiveAdminText();
  });

  it("requires confirmation before deactivating a user", async () => {
    authenticate("admin");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { calls } = installAdminFetch();
    const user = userEvent.setup();

    render(<AdminShell />);

    const row = (await screen.findByText("Member")).closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole("button", { name: /deactivate/i }));

    expect(confirm).toHaveBeenCalledWith("Deactivate Member?");
    await waitFor(() =>
      expect(calls.some((call) => call.path === "/api/admin/users/user_member_ref/deactivate")).toBe(
        true,
      ),
    );
    expectNoSensitiveAdminText();
  });

  it("keeps self and last-admin deactivation disabled with safe reason", async () => {
    authenticate("admin");
    installAdminFetch();

    render(<AdminShell />);

    const row = (await screen.findByText("Family Admin")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("button", { name: /deactivate/i })).toBeDisabled();
    expect(screen.getByText(/last active admin/i)).toBeInTheDocument();
  });

  it("creates an invite and shows the plaintext code only for the current render", async () => {
    authenticate("admin");
    const { calls } = installAdminFetch();
    const writeText = vi.spyOn(window.navigator.clipboard, "writeText").mockResolvedValue();
    const user = userEvent.setup();
    const firstRender = render(<AdminShell />);

    await user.type(await screen.findByLabelText(/invite label/i), "mama");
    await user.type(screen.getByLabelText(/bound display name/i), "Mama");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText("MAMA-ONETIME")).toBeInTheDocument();
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("MAMA-ONETIME"));
    expect(calls.find((call) => call.path === "/api/invites" && call.body)?.body).toEqual({
      boundDisplayName: "Mama",
      label: "mama",
      maxUses: 1,
    });

    firstRender.unmount();
    render(<AdminShell />);
    await screen.findByText("Invite codes");
    expect(screen.queryByText("MAMA-ONETIME")).not.toBeInTheDocument();
  });

  it("disables an invite with confirmation", async () => {
    authenticate("admin");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { calls } = installAdminFetch();
    const user = userEvent.setup();

    render(<AdminShell />);

    await screen.findByText("Invite codes");
    await user.click(screen.getAllByRole("button", { name: /^disable$/i })[0]);

    expect(confirm).toHaveBeenCalledWith("Disable invite MAMA?");
    await waitFor(() =>
      expect(calls.some((call) => call.path === "/api/invites/invite_unused_ref/disable")).toBe(
        true,
      ),
    );
  });

  it("shows safe action errors", async () => {
    authenticate("admin");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = requestPath(input);
        if (path === "/api/admin/users") {
          return jsonResponse(usersResponse());
        }
        if (path === "/api/invites") {
          return jsonResponse(invitesResponse);
        }
        if (path === "/api/admin/status") {
          return jsonResponse(statusResponse);
        }
        if (path === "/api/admin/audit?limit=25") {
          return jsonResponse(auditResponse);
        }
        if (path === "/api/admin/diagnostics") {
          return jsonResponse(diagnosticsResponse);
        }
        return jsonResponse({ detail: "raw backend Matrix failure @secret" }, 502);
      }),
    );
    const user = userEvent.setup();

    render(<AdminShell />);

    const row = (await screen.findByText("Member")).closest("tr");
    await user.click(within(row as HTMLElement).getByRole("button", { name: /deactivate/i }));

    expect(confirm).toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("User could not be deactivated.");
    expect(screen.queryByText(/raw backend/i)).not.toBeInTheDocument();
  });
});
