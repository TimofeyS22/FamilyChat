import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatShell } from "@/features/chats/chat-shell";
import { useAuthStore } from "@/features/auth/auth-store";
import { matrixMediaMaxBytes } from "@/features/matrix/media";
import { matrixCryptoDatabasePrefixForSession } from "@/features/matrix/matrix-client";
import { matrixSessionStorage } from "@/features/matrix/session-storage";

import { getLiveKitMocks, getMatrixSdkMocks } from "./setup";

const matrixSdkMocks = getMatrixSdkMocks();
const liveKitMocks = getLiveKitMocks();
const authenticatedMatrixSession = {
  accessToken: "not-rendered-matrix-token",
  baseUrl: "http://localhost:8080",
  deviceId: "FAKEDEVICE",
  userId: "@timofey:familychat.local",
};
const authenticatedCryptoDatabasePrefix =
  matrixCryptoDatabasePrefixForSession(authenticatedMatrixSession);

const familyUsers = [
  {
    avatarUrl: null,
    displayName: "Mama",
    familyCode: "MAM-1001",
    id: "family-user-mama-uuid",
    matrixUserId: "@mama:familychat.local",
    username: "mama",
  },
  {
    avatarUrl: null,
    displayName: "Papa",
    familyCode: "PAP-1002",
    id: "family-user-papa-uuid",
    matrixUserId: "@papa:familychat.local",
    username: "papa",
  },
  {
    avatarUrl: null,
    displayName: "Timofey",
    familyCode: "TIM-1000",
    id: "family-user-self-uuid",
    matrixUserId: "@timofey:familychat.local",
    username: "timofey",
  },
];

type FakeEvent = {
  getType: () => string;
  getContent: () => unknown;
  getSender: () => string;
  getTs: () => number;
  getId: () => string;
};

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

function requestBody(init?: RequestInit) {
  if (typeof init?.body !== "string") {
    return {};
  }
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function stubFamilyFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url === "http://localhost:8000/api/family/users") {
      return jsonResponse(familyUsers);
    }
    if (url === "http://localhost:8000/api/family/users/search?code=MAM-1001") {
      return jsonResponse(familyUsers[0]);
    }
    if (url === "http://localhost:8000/api/family/users/search?code=NOPE-404") {
      return jsonResponse({ detail: "Raw backend search failure @external:evil" }, 404);
    }
    if (url === "http://localhost:8000/api/calls/token") {
      const body = requestBody(init);
      return jsonResponse({
        callId: body.callId,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        livekitUrl: "ws://livekit.test:7880",
        peerDisplayName: "Mama",
        token: "not-rendered-livekit-token",
      });
    }
    if (url.startsWith("https://matrix.local/media/")) {
      return Promise.resolve(new Response(new Blob(["image marker"], { type: "image/png" }), { status: 200 }));
    }
    return jsonResponse({ detail: "Unexpected Family API request" }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function authenticate() {
  useAuthStore.setState({
    accessToken: "not-rendered-family-token",
    hydrated: true,
    isAuthenticated: true,
    role: "member",
  });
  matrixSessionStorage.write({
    ...authenticatedMatrixSession,
  });
}

function textEvent(body: string, sender = "@mama:familychat.local", timestamp = 1000): FakeEvent {
  return {
    getContent: () => ({ body, msgtype: "m.text" }),
    getId: () => `$fake-${timestamp}`,
    getSender: () => sender,
    getTs: () => timestamp,
    getType: () => "m.room.message",
  };
}

function encryptedEvent(sender = "@mama:familychat.local", timestamp = 1100): FakeEvent {
  return {
    getContent: () => ({
      algorithm: "m.megolm.v1.aes-sha2",
      ciphertext: "encrypted-payload",
      sender_key: "sender-curve25519-key",
      session_id: "missing-session",
    }),
    getId: () => `$encrypted-${timestamp}`,
    getSender: () => sender,
    getTs: () => timestamp,
    getType: () => "m.room.encrypted",
  };
}

function imageEvent(timestamp = 1400): FakeEvent {
  return {
    getContent: () => ({
      body: "summer.png",
      info: { mimetype: "image/png", size: 2048 },
      msgtype: "m.image",
      url: "mxc://familychat.local/image-media",
    }),
    getId: () => `$image-${timestamp}`,
    getSender: () => "@mama:familychat.local",
    getTs: () => timestamp,
    getType: () => "m.room.message",
  };
}

function fileEvent(timestamp = 1500): FakeEvent {
  return {
    getContent: () => ({
      body: "family.pdf",
      filename: "family.pdf",
      info: { mimetype: "application/pdf", size: 4096 },
      msgtype: "m.file",
      url: "mxc://familychat.local/file-media",
    }),
    getId: () => `$file-${timestamp}`,
    getSender: () => "@mama:familychat.local",
    getTs: () => timestamp,
    getType: () => "m.room.message",
  };
}

function voiceEvent(timestamp = 1600, encrypted = false): FakeEvent {
  const mediaContent = encrypted
    ? {
        file: {
          hashes: { sha256: "mock-ciphertext-hash" },
          iv: "mock-iv",
          key: {
            alg: "A256CTR",
            ext: true,
            k: "mock-key",
            key_ops: ["decrypt", "encrypt"],
            kty: "oct",
          },
          url: "mxc://familychat.local/voice-ciphertext",
          v: "v2",
        },
      }
    : { url: "mxc://familychat.local/voice-media" };

  return {
    getContent: () => ({
      "org.familychat.voice": true,
      body: "Voice message",
      filename: "voice-message.webm",
      info: { duration: 2400, mimetype: "audio/webm", size: 512 },
      msgtype: "m.audio",
      ...mediaContent,
    }),
    getId: () => `$voice-${timestamp}`,
    getSender: () => "@mama:familychat.local",
    getTs: () => timestamp,
    getType: () => "m.room.message",
  };
}

function callEvent(
  type: string,
  content: Record<string, unknown>,
  sender = "@mama:familychat.local",
  timestamp = Date.now(),
): FakeEvent {
  return {
    getContent: () => ({
      timestamp,
      ...content,
    }),
    getId: () => `$call-${type}-${timestamp}`,
    getSender: () => sender,
    getTs: () => timestamp,
    getType: () => type,
  };
}

function unsupportedEvent(): FakeEvent {
  return {
    getContent: () => ({ body: "hidden unsupported event", msgtype: "m.notice" }),
    getId: () => "$unsupported",
    getSender: () => "@mama:familychat.local",
    getTs: () => 1200,
    getType: () => "m.room.message",
  };
}

class FakeMediaRecorder {
  static isTypeSupported = vi.fn((mimeType: string) => mimeType.startsWith("audio/webm"));
  static stopTwice = false;

  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  state: RecordingState = "inactive";

  constructor(_stream: MediaStream, options: MediaRecorderOptions = {}) {
    this.mimeType = options.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["voice marker"], { type: this.mimeType }),
    } as BlobEvent);
    this.onstop?.();
    if (FakeMediaRecorder.stopTwice) {
      this.onstop?.();
    }
  }
}

function stubVoiceRecording() {
  FakeMediaRecorder.stopTwice = false;
  const stopTrack = vi.fn();
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
  const getUserMedia = vi.fn(() => Promise.resolve(stream));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(window, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });

  return { getUserMedia, stopTrack };
}

async function startVoiceRecording() {
  const button = screen.getByRole("button", { name: /записать голос/i });
  fireEvent.pointerDown(button, { clientX: 20, clientY: 20, pointerId: 1 });
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 220));
  });
}

function stubVoiceRecordingDenied() {
  const getUserMedia = vi.fn(() =>
    Promise.reject(new DOMException("raw microphone path /private/device", "NotAllowedError")),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(window, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });
}

function stubCallBrowser() {
  const getUserMedia = vi.fn(() => Promise.resolve({} as MediaStream));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(window, "RTCPeerConnection", {
    configurable: true,
    value: class FakeRTCPeerConnection {},
  });
  return { getUserMedia };
}

function dropDataTransfer(file: File, additionalFiles: File[] = []) {
  const files = [file, ...additionalFiles];
  return {
    dataTransfer: {
      files: {
        item: (index: number) => files[index] ?? null,
        length: files.length,
      },
      types: ["Files"],
    },
  };
}

function stubAudioPlayback() {
  const play = vi.fn(() => Promise.resolve());
  const pause = vi.fn();

  class FakeAudio {
    currentTime = 0;
    duration = 2.4;
    preload = "";
    src: string;

    constructor(src: string) {
      this.src = src;
    }

    addEventListener(eventName: string, listener: EventListener) {
      if (eventName === "loadedmetadata") {
        listener(new Event("loadedmetadata"));
      }
    }

    pause = pause;
    play = play;
  }

  vi.stubGlobal("Audio", FakeAudio);
  return { pause, play };
}

function fakeRoom(
  name: string,
  events: FakeEvent[],
  members = ["@timofey:familychat.local", "@mama:familychat.local", "@papa:familychat.local"],
  encrypted = false,
  roomId = "!private-room-id:familychat.local",
  membership = "join",
  invitedMembers: string[] = [],
  unreadCount = 2,
  readUpTo: string | null = null,
  readReceipts: Record<string, string[]> = {},
) {
  const displayNames: Record<string, string> = {
    "@mama:familychat.local": "Mama",
    "@papa:familychat.local": "Papa",
    "@timofey:familychat.local": "Timofey",
  };
  return {
    getMember: (userId: string) => ({
      rawDisplayName: displayNames[userId],
      userId,
    }),
    getMembersWithMembership: (requestedMembership: string) => {
      if (requestedMembership === "join") {
        return members.map((userId) => ({ userId }));
      }
      if (requestedMembership === "invite") {
        return invitedMembers.map((userId) => ({ userId }));
      }
      return [];
    },
    getEventReadUpTo: () => readUpTo,
    getUsersReadUpTo: (event: FakeEvent) => readReceipts[event.getId()] ?? [],
    getLiveTimeline: () => ({ getEvents: () => events }),
    getMyMembership: () => membership,
    getUnreadNotificationCount: () => unreadCount,
    hasEncryptionStateEvent: () => encrypted,
    name,
    roomId,
  };
}

async function renderConnectedChat(
  roomName = "Family Chat With A Very Long Name That Should Truncate",
  options: {
    encrypted?: boolean;
    events?: FakeEvent[];
    members?: string[];
    roomId?: string;
    membership?: string;
    invitedMembers?: string[];
    expectedRoomName?: string;
    unreadCount?: number;
    readUpTo?: string | null;
    readReceipts?: Record<string, string[]>;
  } = {},
) {
  authenticate();
  const fetchMock = stubFamilyFetch();
  matrixSdkMocks.client.getRooms.mockReturnValue([
    fakeRoom(
      roomName,
      options.events ?? [
        textEvent("Hello from Matrix", "@mama:familychat.local", 1000),
        unsupportedEvent(),
        textEvent("A very long text message ".repeat(10), "@timofey:familychat.local", 1300),
      ],
      options.members,
      Boolean(options.encrypted),
      options.roomId,
      options.membership,
      options.invitedMembers,
      options.unreadCount,
      options.readUpTo,
      options.readReceipts,
    ),
  ]);

  render(<ChatShell />);
  await waitFor(() =>
    expect(screen.getAllByText(options.expectedRoomName ?? roomName).length).toBeGreaterThan(0),
  );
  act(() => matrixSdkMocks.emit("sync", "PREPARED"));
  if (!options.events) {
    await screen.findByText("Hello from Matrix");
  }
  return fetchMock;
}

async function renderDirectChat() {
  return renderConnectedChat("Mama", {
    members: ["@timofey:familychat.local", "@mama:familychat.local"],
  });
}

describe("Matrix chat shell", () => {
  it("initializes Matrix crypto with a persistent browser store before sync", async () => {
    await renderConnectedChat();

    expect(matrixSdkMocks.client.initRustCrypto).toHaveBeenCalledWith({
      cryptoDatabasePrefix: authenticatedCryptoDatabasePrefix,
      useIndexedDB: true,
    });
    expect(matrixSdkMocks.crypto.getOwnDeviceKeys).toHaveBeenCalled();
    expect(matrixSdkMocks.client.startClient).toHaveBeenCalledWith({ initialSyncLimit: 50 });
  });

  it("keeps Matrix session storage separate from the crypto store across a normal remount", async () => {
    authenticate();
    stubFamilyFetch();
    matrixSdkMocks.client.getRooms.mockReturnValue([
      fakeRoom("Family Chat", [textEvent("Reload-safe message")], undefined, true),
    ]);

    const firstRender = render(<ChatShell />);
    await screen.findByText("Reload-safe message");

    firstRender.unmount();

    expect(matrixSessionStorage.read()).toEqual(
      expect.objectContaining({
        deviceId: "FAKEDEVICE",
        userId: "@timofey:familychat.local",
      }),
    );

    render(<ChatShell />);
    await screen.findByText("Reload-safe message");

    expect(matrixSdkMocks.client.initRustCrypto).toHaveBeenCalledTimes(2);
    expect(matrixSdkMocks.client.initRustCrypto).toHaveBeenNthCalledWith(2, {
      cryptoDatabasePrefix: authenticatedCryptoDatabasePrefix,
      useIndexedDB: true,
    });
  });

  it("renders Matrix rooms and timeline without exposing tokens or raw IDs", async () => {
    await renderConnectedChat();

    expect(screen.getByText("Hello from Matrix")).toBeInTheDocument();
    expect(screen.getByText("Mama")).toBeInTheDocument();
    expect(screen.getAllByText(/A very long text message/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("hidden unsupported event")).not.toBeInTheDocument();
    expect(screen.queryByText("not-rendered-family-token")).not.toBeInTheDocument();
    expect(screen.queryByText("not-rendered-matrix-token")).not.toBeInTheDocument();
    expect(screen.queryByText("!private-room-id:familychat.local")).not.toBeInTheDocument();
    expect(screen.queryByText("@mama:familychat.local")).not.toBeInTheDocument();
  });

  it("names direct chats after the peer even when the Matrix room is named after the current user", async () => {
    await renderConnectedChat("Timofey", {
      expectedRoomName: "Mama",
      members: ["@timofey:familychat.local", "@mama:familychat.local"],
    });

    expect((await screen.findAllByText("Mama")).length).toBeGreaterThan(1);
    expect(screen.queryByText("Timofey")).not.toBeInTheDocument();
  });

  it("shows encrypted incoming events instead of hiding them while keys are pending", async () => {
    await renderConnectedChat("Mama", {
      encrypted: true,
      events: [encryptedEvent("@mama:familychat.local", 1800)],
      members: ["@timofey:familychat.local", "@mama:familychat.local"],
    });

    expect(await screen.findByText("Сообщение получено, ждём ключи шифрования.")).toBeInTheDocument();
    expect(screen.getByText("Зашифрованное сообщение")).toBeInTheDocument();
  });

  it("renders completed call events and marks them read when the chat is opened", async () => {
    const callId = "familychat_call_history_01";
    await renderConnectedChat("Mama", {
      events: [
        callEvent("com.familychat.call.invite", { callId, mode: "audio" }, "@mama:familychat.local", 1800),
        callEvent("com.familychat.call.accept", { callId }, "@timofey:familychat.local", 1900),
        callEvent("com.familychat.call.hangup", { callId }, "@mama:familychat.local", 2100),
      ],
      members: ["@timofey:familychat.local", "@mama:familychat.local"],
    });

    expect((await screen.findAllByText("Аудиозвонок завершён")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Входящий аудиозвонок")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(matrixSdkMocks.client.setRoomReadMarkers).toHaveBeenCalledWith(
        "!private-room-id:familychat.local",
        "$call-com.familychat.call.hangup-2100",
        expect.any(Object),
      ),
    );
  });

  it("refreshes room timelines when sync reports unread state after a push resume", async () => {
    authenticate();
    stubFamilyFetch();
    matrixSdkMocks.client.getRooms.mockReturnValue([
      fakeRoom("Family Chat", [], undefined, true),
    ]);

    render(<ChatShell />);
    await waitFor(() => expect(screen.getAllByText("Family Chat").length).toBeGreaterThan(0));
    expect(screen.queryByText("Message after push")).not.toBeInTheDocument();

    matrixSdkMocks.client.getRooms.mockReturnValue([
      fakeRoom(
        "Family Chat",
        [textEvent("Message after push", "@mama:familychat.local", 2200)],
        undefined,
        true,
      ),
    ]);
    act(() => matrixSdkMocks.emit("sync", "SYNCING"));

    await waitFor(() => expect(screen.getAllByText("Message after push").length).toBeGreaterThan(0));
  });

  it("falls back to timeline unread count when Matrix notification count is empty", async () => {
    authenticate();
    stubFamilyFetch();
    matrixSdkMocks.client.getRooms.mockReturnValue([
      fakeRoom("Papa", [textEvent("Selected room", "@papa:familychat.local", 1000)]),
      fakeRoom(
        "Mama",
        [
          textEvent("Already read", "@mama:familychat.local", 1000),
          textEvent("Unread one", "@mama:familychat.local", 2000),
          textEvent("Unread two", "@mama:familychat.local", 3000),
        ],
        undefined,
        false,
        "!unread-room-id:familychat.local",
        "join",
        [],
        0,
        "$fake-1000",
      ),
    ]);

    render(<ChatShell />);

    expect((await screen.findAllByText("2")).length).toBeGreaterThan(0);
  });

  it("shows a read receipt status for own messages read by a family member", async () => {
    await renderConnectedChat("Mama", {
      events: [textEvent("Seen message", "@timofey:familychat.local", 1300)],
      readReceipts: {
        "$fake-1300": ["@mama:familychat.local"],
      },
    });

    expect(await screen.findByText("прочитано")).toBeInTheDocument();
    expect(screen.getByLabelText("Прочитано")).toBeInTheDocument();
  });

  it("wakes Matrix sync when the PWA returns to focus after a push", async () => {
    await renderConnectedChat();

    act(() => window.dispatchEvent(new Event("focus")));

    expect(matrixSdkMocks.client.retryImmediately).toHaveBeenCalled();
  });

  it("auto-joins invited direct rooms so recipients can receive direct chats", async () => {
    authenticate();
    stubFamilyFetch();
    matrixSdkMocks.client.getRooms.mockReturnValue([
      fakeRoom(
        "Mama",
        [],
        ["@timofey:familychat.local", "@mama:familychat.local"],
        true,
        "!invited-direct-room:familychat.local",
        "invite",
      ),
    ]);

    render(<ChatShell />);
    act(() => matrixSdkMocks.emit("sync", "PREPARED"));

    await waitFor(() =>
      expect(matrixSdkMocks.client.joinRoom).toHaveBeenCalledWith(
        "!invited-direct-room:familychat.local",
      ),
    );
    expect(screen.queryByText("!invited-direct-room:familychat.local")).not.toBeInTheDocument();
  });

  it("renders chat skeleton loading states without raw identifiers", async () => {
    authenticate();
    stubFamilyFetch();
    matrixSdkMocks.client.getRooms.mockReturnValue([]);

    render(<ChatShell />);

    expect(await screen.findByLabelText("Загрузка списка чатов")).toBeInTheDocument();
    expect(screen.queryByText("not-rendered-family-token")).not.toBeInTheDocument();
    expect(screen.queryByText("not-rendered-matrix-token")).not.toBeInTheDocument();
    expect(screen.queryByText("FAKEDEVICE")).not.toBeInTheDocument();
  });

  it("shows encrypted rooms as encrypted only when crypto is ready", async () => {
    await renderConnectedChat("Mama", { encrypted: true });

    expect(await screen.findByText("Шифрование включено")).toBeInTheDocument();
  });

  it("shows an honest recovery-needed state for encrypted rooms on an unverified browser", async () => {
    matrixSdkMocks.crypto.isCrossSigningReady.mockResolvedValue(false);
    matrixSdkMocks.crypto.isSecretStorageReady.mockResolvedValue(false);

    await renderConnectedChat("Mama", { encrypted: true });

    expect(
      await screen.findByText("Шифрование включено. На этом устройстве нужна настройка восстановления."),
    ).toBeInTheDocument();
  });

  it("does not send in encrypted rooms when Matrix crypto initialization fails", async () => {
    matrixSdkMocks.client.initRustCrypto.mockRejectedValueOnce(new Error("raw crypto failure"));
    await renderConnectedChat("Mama", { encrypted: true });
    act(() => matrixSdkMocks.emit("sync", "PREPARED"));

    expect(await screen.findByText("Шифрование включено. На этом устройстве нужна настройка восстановления.")).toBeInTheDocument();
    expect(screen.getByLabelText(/сообщение/i)).toBeDisabled();
    expect(screen.getByLabelText(/сообщение/i)).toHaveAttribute(
      "placeholder",
      "Для отправки в этом чате нужна настройка шифрования",
    );
    expect(screen.queryByText(/raw crypto failure/i)).not.toBeInTheDocument();
  });

  it("recovers from a stale Matrix crypto store for a different account", async () => {
    matrixSdkMocks.client.initRustCrypto.mockRejectedValueOnce(
      new Error(
        "the account in the store doesn't match the account in the constructor: expected @timofey:familychat.local:FAKEDEVICE, got @other:familychat.local:OLDDEVICE",
      ),
    );

    await renderConnectedChat("Mama", { encrypted: true });

    expect(await screen.findByText("Шифрование включено")).toBeInTheDocument();
    expect(matrixSdkMocks.client.initRustCrypto).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/сообщение/i)).not.toBeDisabled();
  });

  it("sends trimmed text only", async () => {
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/сообщение/i), "   hello family   ");
    await user.click(screen.getByRole("button", { name: /отправить/i }));

    await waitFor(() =>
      expect(matrixSdkMocks.client.sendTextMessage).toHaveBeenCalledWith(
        "!private-room-id:familychat.local",
        "hello family",
        expect.any(String),
      ),
    );
  });

  it("shows a safe send failure state", async () => {
    matrixSdkMocks.client.sendTextMessage.mockRejectedValue(new Error("M_UNKNOWN_TOKEN"));
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/сообщение/i), "hello");
    await user.click(screen.getByRole("button", { name: /отправить/i }));

    expect(await screen.findByRole("button", { name: /повторить/i })).toBeInTheDocument();
    expect(screen.queryByText(/M_UNKNOWN_TOKEN/i)).not.toBeInTheDocument();
  });

  it("shows offline state and disables composer sends", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await renderConnectedChat();

    expect(await screen.findByText(/вы офлайн/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/сообщение/i)).toBeDisabled();
    expect(screen.getByLabelText(/сообщение/i)).toHaveAttribute(
      "placeholder",
      "Похоже, вы офлайн. Подключитесь к интернету перед отправкой.",
    );
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("renders image previews and file cards without exposing raw mxc URIs", async () => {
    const fetchMock = await renderConnectedChat("Media room", { events: [imageEvent(), fileEvent()] });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("https://matrix.local/media/"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer not-rendered-matrix-token",
          }),
        }),
      ),
    );
    expect(screen.getByText("family.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /скачать/i })).toHaveAttribute(
      "href",
      expect.stringContaining("https://matrix.local/media/"),
    );
    expect(screen.queryByText(/mxc:\/\//i)).not.toBeInTheDocument();
  });

  it("blocks oversized attachments before upload", async () => {
    await renderConnectedChat();
    const user = userEvent.setup();
    const oversized = new File(["x"], "huge-video.mp4", { type: "video/mp4" });
    Object.defineProperty(oversized, "size", {
      configurable: true,
      value: matrixMediaMaxBytes + 1,
    });

    await user.upload(screen.getByLabelText(/выбрать файл/i), oversized);

    expect(await screen.findByRole("alert")).toHaveTextContent("100 MB or smaller");
    expect(matrixSdkMocks.client.uploadContent).not.toHaveBeenCalled();
  });

  it("uses the normal Matrix media path for unencrypted room uploads", async () => {
    await renderConnectedChat("Media room");
    const user = userEvent.setup();
    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText(/выбрать файл/i), file);
    expect(await screen.findByText("notes.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /отправить файл/i }));

    await waitFor(() =>
      expect(matrixSdkMocks.client.uploadContent).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          name: "notes.pdf",
          type: "application/pdf",
        }),
      ),
    );
    await waitFor(() => expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalled());
    const sendEventCalls = matrixSdkMocks.client.sendEvent.mock.calls as unknown[][];
    const content = sendEventCalls[0][2] as Record<string, unknown>;
    expect(content).toEqual(
      expect.objectContaining({
        filename: "notes.pdf",
        msgtype: "m.file",
        url: "mxc://familychat.local/uploaded-media",
      }),
    );
    expect(content).not.toHaveProperty("file");
  });

  it("sends multiple selected photos as one album event", async () => {
    await renderConnectedChat("Media room");
    const user = userEvent.setup();
    const first = new File(["one"], "one.png", { type: "image/png" });
    const second = new File(["two"], "two.jpg", { type: "image/jpeg" });

    await user.upload(screen.getByLabelText(/выбрать файл/i), [first, second]);
    expect(await screen.findByText("2 фото")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /отправить файл/i }));

    await waitFor(() => expect(matrixSdkMocks.client.uploadContent).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalledTimes(1));
    const sendEventCalls = matrixSdkMocks.client.sendEvent.mock.calls as unknown[][];
    const content = sendEventCalls[0][2] as Record<string, unknown>;
    const album = content["org.familychat.album"] as { items?: unknown[] } | undefined;

    expect(content).toEqual(
      expect.objectContaining({
        body: "Фото (2)",
        msgtype: "m.image",
      }),
    );
    expect(album?.items).toHaveLength(2);
  });

  it("sends a dropped supported file through the existing Matrix media path", async () => {
    await renderConnectedChat("Drop room");
    const file = new File(["hello"], "drop-notes.pdf", { type: "application/pdf" });
    const panel = screen.getByText("Hello from Matrix").closest("section");
    expect(panel).not.toBeNull();

    fireEvent.dragOver(panel as HTMLElement, dropDataTransfer(file));
    expect(await screen.findByText(/перетащите один файл/i)).toBeInTheDocument();
    fireEvent.drop(panel as HTMLElement, dropDataTransfer(file));

    await waitFor(() =>
      expect(matrixSdkMocks.client.uploadContent).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          name: "drop-notes.pdf",
          type: "application/pdf",
        }),
      ),
    );
    expect(screen.queryByText("Файл отправлен.")).not.toBeInTheDocument();
  });

  it("shows a safe error for oversized dropped files", async () => {
    await renderConnectedChat("Drop room");
    const oversized = new File(["x"], "huge.zip", { type: "application/zip" });
    Object.defineProperty(oversized, "size", {
      configurable: true,
      value: matrixMediaMaxBytes + 1,
    });
    const panel = screen.getByText("Hello from Matrix").closest("section");
    expect(panel).not.toBeNull();

    fireEvent.drop(panel as HTMLElement, dropDataTransfer(oversized));

    expect(await screen.findByRole("alert")).toHaveTextContent("100 MB or smaller");
    expect(matrixSdkMocks.client.uploadContent).not.toHaveBeenCalled();
    expect(screen.queryByText(/private\/|fakepath/i)).not.toBeInTheDocument();
  });

  it("shows a safe error when multiple files are dropped", async () => {
    await renderConnectedChat("Drop room");
    const first = new File(["one"], "one.pdf", { type: "application/pdf" });
    const second = new File(["two"], "two.pdf", { type: "application/pdf" });
    const panel = screen.getByText("Hello from Matrix").closest("section");
    expect(panel).not.toBeNull();

    fireEvent.drop(panel as HTMLElement, dropDataTransfer(first, [second]));

    expect(await screen.findByRole("alert")).toHaveTextContent("Перетащите только один файл за раз.");
    expect(matrixSdkMocks.client.uploadContent).not.toHaveBeenCalled();
  });

  it("shows a chat sync reason when dropping while Matrix is disconnected", async () => {
    await renderConnectedChat("Drop room");
    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });
    const panel = screen.getByText("Hello from Matrix").closest("section");
    expect(panel).not.toBeNull();
    act(() => matrixSdkMocks.emit("sync", "ERROR"));

    fireEvent.drop(panel as HTMLElement, dropDataTransfer(file));

    expect(
      await screen.findByText("Подключение к чату ещё не готово. Дождитесь синхронизации."),
    ).toBeInTheDocument();
    expect(matrixSdkMocks.client.uploadContent).not.toHaveBeenCalled();
  });

  it("encrypts media bytes and sends encrypted file content in encrypted rooms", async () => {
    await renderConnectedChat("Encrypted media", { encrypted: true });
    const user = userEvent.setup();
    const file = new File(["plain marker"], "private.png", { type: "image/png" });

    await user.upload(screen.getByLabelText(/выбрать файл/i), file);
    await user.click(screen.getByRole("button", { name: /отправить файл/i }));

    await waitFor(() => expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalled());
    const uploadContentCalls = matrixSdkMocks.client.uploadContent.mock.calls as unknown[][];
    const [uploadedBody, uploadOptions] = uploadContentCalls[0];
    expect(uploadedBody).toBeInstanceOf(Blob);
    expect(uploadedBody).not.toBe(file);
    expect(Array.from(new Uint8Array(await (uploadedBody as Blob).arrayBuffer()))).toEqual([
      69, 50, 69, 69,
    ]);
    expect(uploadOptions).toEqual(
      expect.objectContaining({
        includeFilename: false,
        type: "application/octet-stream",
      }),
    );
    const sendEventCalls = matrixSdkMocks.client.sendEvent.mock.calls as unknown[][];
    const content = sendEventCalls[0][2] as Record<string, unknown>;
    expect(content).toEqual(
      expect.objectContaining({
        filename: "private.png",
        file: expect.objectContaining({
          url: "mxc://familychat.local/uploaded-media",
          v: "v2",
        }),
        msgtype: "m.image",
      }),
    );
    expect(content).not.toHaveProperty("url");
  });

  it("records and sends voice messages through the normal Matrix media path", async () => {
    const { getUserMedia, stopTrack } = stubVoiceRecording();
    await renderConnectedChat("Voice room");
    const user = userEvent.setup();

    await startVoiceRecording();
    expect(await screen.findByRole("button", { name: /отправить голосовое сообщение/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /отправить голосовое сообщение/i }));

    await waitFor(() => expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stopTrack).toHaveBeenCalled();
    const uploadContentCalls = matrixSdkMocks.client.uploadContent.mock.calls as unknown[][];
    const [uploadedBody, uploadOptions] = uploadContentCalls[0];
    expect(uploadedBody).toBeInstanceOf(File);
    expect((uploadedBody as File).name).toBe("voice-message.webm");
    expect(uploadOptions).toEqual(
      expect.objectContaining({
        name: "voice-message.webm",
        type: "audio/webm;codecs=opus",
      }),
    );
    const sendEventCalls = matrixSdkMocks.client.sendEvent.mock.calls as unknown[][];
    const content = sendEventCalls[0][2] as Record<string, unknown>;
    expect(content).toEqual(
      expect.objectContaining({
        "org.familychat.voice": true,
        body: "Голосовое сообщение",
        filename: "voice-message.webm",
        msgtype: "m.audio",
        url: "mxc://familychat.local/uploaded-media",
      }),
    );
    expect(content).not.toHaveProperty("file");
    expect(content.info).toEqual(
      expect.objectContaining({
        duration: expect.any(Number),
        mimetype: "audio/webm;codecs=opus",
        size: expect.any(Number),
      }),
    );
  });

  it("keeps voice recording idempotent and restores the microphone action", async () => {
    stubVoiceRecording();
    FakeMediaRecorder.stopTwice = true;
    await renderConnectedChat("Voice room");
    const user = userEvent.setup();

    await startVoiceRecording();
    await user.click(await screen.findByRole("button", { name: /отправить голосовое сообщение/i }));

    await waitFor(() => expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalledTimes(1));
    expect(matrixSdkMocks.client.uploadContent).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: /записать голос/i })).toBeEnabled();
    FakeMediaRecorder.stopTwice = false;
  });

  it("switches the mobile composer action between microphone, send, and recording timer", async () => {
    stubVoiceRecording();
    await renderConnectedChat("Voice room");
    const user = userEvent.setup();
    const input = screen.getByLabelText(/сообщение/i);

    expect(screen.getByRole("button", { name: /прикрепить файл/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /записать голос/i })).toBeEnabled();

    await user.type(input, "Привет");
    expect(screen.getByRole("button", { name: /^отправить$/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /записать голос/i })).not.toBeInTheDocument();

    await user.clear(input);
    await startVoiceRecording();
    expect(await screen.findByText(/запись/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /сообщение/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /прикрепить файл/i })).toBeDisabled();
  });

  it("uses encrypted attachment content for voice messages in encrypted rooms", async () => {
    stubVoiceRecording();
    await renderConnectedChat("Encrypted voice", { encrypted: true });
    const user = userEvent.setup();

    await startVoiceRecording();
    await user.click(await screen.findByRole("button", { name: /отправить голосовое сообщение/i }));

    await waitFor(() => expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalled());
    const uploadContentCalls = matrixSdkMocks.client.uploadContent.mock.calls as unknown[][];
    const [uploadedBody, uploadOptions] = uploadContentCalls[0];
    expect(uploadedBody).toBeInstanceOf(Blob);
    expect(uploadedBody).not.toBeInstanceOf(File);
    expect(Array.from(new Uint8Array(await (uploadedBody as Blob).arrayBuffer()))).toEqual([
      69, 50, 69, 69,
    ]);
    expect(uploadOptions).toEqual(
      expect.objectContaining({
        includeFilename: false,
        type: "application/octet-stream",
      }),
    );
    const sendEventCalls = matrixSdkMocks.client.sendEvent.mock.calls as unknown[][];
    const content = sendEventCalls[0][2] as Record<string, unknown>;
    expect(content).toEqual(
      expect.objectContaining({
        "org.familychat.voice": true,
        body: "Голосовое сообщение",
        file: expect.objectContaining({
          url: "mxc://familychat.local/uploaded-media",
          v: "v2",
        }),
        msgtype: "m.audio",
      }),
    );
    expect(content).not.toHaveProperty("url");
  });

  it("cancels voice recordings without uploading anything", async () => {
    const { stopTrack } = stubVoiceRecording();
    await renderConnectedChat("Voice room");
    const user = userEvent.setup();

    await startVoiceRecording();
    await user.click(await screen.findByRole("button", { name: /отменить запись голоса/i }));

    expect(stopTrack).toHaveBeenCalled();
    expect(matrixSdkMocks.client.uploadContent).not.toHaveBeenCalled();
    expect(matrixSdkMocks.client.sendEvent).not.toHaveBeenCalled();
  });

  it("shows safe voice recording errors without leaking browser exception details", async () => {
    stubVoiceRecordingDenied();
    await renderConnectedChat("Voice room");

    await startVoiceRecording();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Доступ к микрофону запрещён.",
    );
    expect(screen.queryByText(/private\/device/i)).not.toBeInTheDocument();
    expect(matrixSdkMocks.client.uploadContent).not.toHaveBeenCalled();
  });

  it("shows an unsupported state when browser voice recording APIs are absent", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: undefined,
    });
    await renderConnectedChat("Voice room");

    await startVoiceRecording();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Запись голоса не поддерживается в этом браузере.",
    );
    expect(matrixSdkMocks.client.uploadContent).not.toHaveBeenCalled();
  });

  it("renders voice messages as playable audio without exposing raw MXC URIs", async () => {
    await renderConnectedChat("Voice room", { events: [voiceEvent()] });

    expect(await screen.findByRole("button", { name: /воспроизвести голосовое сообщение/i })).toBeInTheDocument();
    expect(screen.getAllByText("Голосовое сообщение").length).toBeGreaterThan(0);
    expect(screen.queryByText("Voice message")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /скачать/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/mxc:\/\//i)).not.toBeInTheDocument();
  });

  it("plays older plaintext voice messages through the authenticated media fetch path", async () => {
    const { play } = stubAudioPlayback();
    await renderConnectedChat("Voice room", { events: [voiceEvent()] });
    const mediaFetch = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    );
    vi.stubGlobal("fetch", mediaFetch);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /воспроизвести голосовое сообщение/i }));

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(mediaFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://matrix.local/media/"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer not-rendered-matrix-token",
        }),
      }),
    );
  });

  it("decrypts encrypted voice messages only when playback starts", async () => {
    const { play } = stubAudioPlayback();
    await renderConnectedChat("Encrypted voice", { events: [voiceEvent(1700, true)] });
    const mediaFetch = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    );
    vi.stubGlobal("fetch", mediaFetch);
    const user = userEvent.setup();

    expect(mediaFetch).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: /воспроизвести голосовое сообщение/i }));

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(mediaFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://matrix.local/media/"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer not-rendered-matrix-token",
        }),
      }),
    );
    expect(screen.queryByText(/mxc:\/\//i)).not.toBeInTheDocument();
  });

  it("shows a safe file upload failure state", async () => {
    matrixSdkMocks.client.uploadContent.mockRejectedValue(new Error("M_UNKNOWN_TOKEN"));
    await renderConnectedChat();
    const user = userEvent.setup();
    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText(/выбрать файл/i), file);
    await user.click(screen.getByRole("button", { name: /отправить файл/i }));

    expect(await screen.findByRole("button", { name: /повторить/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/M_UNKNOWN_TOKEN/i)).not.toBeInTheDocument();
  });

  it("shows copy text action without exposing message metadata", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await renderConnectedChat();

    const messageText = screen.getAllByText("Hello from Matrix").at(-1);
    expect(messageText).toBeDefined();
    fireEvent.contextMenu(messageText as HTMLElement);

    expect(screen.getByRole("menuitem", { name: /копировать текст/i })).toBeInTheDocument();
    expect(screen.queryByText("@mama:familychat.local")).not.toBeInTheDocument();
    expect(screen.queryByText("$fake-1000")).not.toBeInTheDocument();
  });

  it("deletes a message locally without redacting it for everyone", async () => {
    await renderConnectedChat();
    const user = userEvent.setup();

    const messageText = screen.getAllByText("Hello from Matrix").at(-1);
    expect(messageText).toBeDefined();
    fireEvent.contextMenu(messageText as HTMLElement);
    await user.click(screen.getByRole("menuitem", { name: /удалить у меня/i }));

    expect(await screen.findByText("Сообщение удалено у вас.")).toBeInTheDocument();
    expect(screen.queryByText("Hello from Matrix")).not.toBeInTheDocument();
    expect(matrixSdkMocks.client.sendEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      "m.room.redaction",
      expect.anything(),
    );
  });

  it("retries a failed text send through the existing send path and blocks duplicate retry", async () => {
    matrixSdkMocks.client.sendTextMessage
      .mockRejectedValueOnce(new Error("M_UNKNOWN_TOKEN"))
      .mockImplementation(() => new Promise(() => undefined));
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/сообщение/i), "retry me");
    await user.click(screen.getByRole("button", { name: /^отправить$/i }));
    const retryButton = await screen.findByRole("button", { name: /повторить/i });

    await user.click(retryButton);
    await user.click(retryButton);

    expect(matrixSdkMocks.client.sendTextMessage).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText(/отправка/i).length).toBeGreaterThan(0);
  });

  it("blocks retry while the browser is offline", async () => {
    matrixSdkMocks.client.sendTextMessage.mockRejectedValueOnce(new Error("offline"));
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/сообщение/i), "retry offline");
    await user.click(screen.getByRole("button", { name: /^отправить$/i }));
    const retryButton = await screen.findByRole("button", { name: /повторить/i });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    fireEvent(window, new Event("offline"));

    await waitFor(() => expect(retryButton).toBeDisabled());
    expect(matrixSdkMocks.client.sendTextMessage).toHaveBeenCalledTimes(1);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    fireEvent(window, new Event("online"));
  });

  it("retries a failed media send without inventing a filename caption", async () => {
    matrixSdkMocks.client.uploadContent
      .mockRejectedValueOnce(new Error("temporary upload failure"))
      .mockResolvedValue({ content_uri: "mxc://familychat.local/uploaded-media" });
    await renderConnectedChat("Media retry");
    const user = userEvent.setup();
    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText(/выбрать файл/i), file);
    await user.click(screen.getByRole("button", { name: /отправить файл/i }));
    const retryButton = await screen.findByRole("button", { name: /повторить/i });
    await user.click(retryButton);

    await waitFor(() => expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalled());
    const sendEventCalls = matrixSdkMocks.client.sendEvent.mock.calls as unknown[][];
    const content = sendEventCalls[0][2] as Record<string, unknown>;
    expect(content).toEqual(
      expect.objectContaining({
        body: "notes.pdf",
        filename: "notes.pdf",
      }),
    );
  });

  it("keeps mobile-style room selection and back navigation", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Family Chat With A Very Long Name/i }),
    );

    expect(screen.getByRole("button", { name: /назад/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /назад/i }));
    expect(screen.getByLabelText(/поиск по чатам/i)).toBeInTheDocument();
  });

  it("renders call controls only for a direct Family API peer room", async () => {
    await renderDirectChat();

    expect(await screen.findByRole("button", { name: /начать аудиозвонок с mama/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /начать видеозвонок с mama/i })).toBeInTheDocument();
    expect(screen.queryByText("@mama:familychat.local")).not.toBeInTheDocument();
    expect(screen.queryByText("family-user-mama-uuid")).not.toBeInTheDocument();
  });

  it("keeps call controls when Matrix has not marked a one-to-one room as direct yet", async () => {
    await renderConnectedChat("Mama", {
      members: [
        "@timofey:familychat.local",
        "@mama:familychat.local",
        "@papa:familychat.local",
      ],
      roomId: "!one-to-one-without-direct-flag:familychat.local",
    });

    expect(await screen.findByRole("button", { name: /начать аудиозвонок с mama/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /начать видеозвонок с mama/i })).toBeInTheDocument();
  });

  it("uses Matrix m.direct account data to show call controls before joined members settle", async () => {
    matrixSdkMocks.client.getAccountData.mockReturnValue({
      getContent: () => ({
        "@mama:familychat.local": ["!direct-from-account-data:familychat.local"],
      }),
    });

    await renderConnectedChat("Mama", {
      members: [
        "@timofey:familychat.local",
        "@mama:familychat.local",
        "@papa:familychat.local",
      ],
      roomId: "!direct-from-account-data:familychat.local",
    });

    expect(await screen.findByRole("button", { name: /начать аудиозвонок с mama/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /начать аудиозвонок с papa/i })).not.toBeInTheDocument();
  });

  it("shows call controls for a direct room while the peer is still invited", async () => {
    await renderConnectedChat("Mama", {
      invitedMembers: ["@mama:familychat.local"],
      members: ["@timofey:familychat.local"],
      roomId: "!direct-with-invited-peer:familychat.local",
    });

    expect(await screen.findByRole("button", { name: /начать аудиозвонок с mama/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /начать видеозвонок с mama/i })).toBeInTheDocument();
  });

  it("does not render call controls in the common room or group rooms", async () => {
    await renderConnectedChat();
    const queryButton = (label: string) =>
      screen.queryByRole("button", { name: new RegExp(label, "i") });

    expect(queryButton("начать аудиозвонок")).not.toBeInTheDocument();
    expect(queryButton("начать видеозвонок")).not.toBeInTheDocument();
  });

  it("shows an incoming call from a timeline invite restored after push open", async () => {
    await renderConnectedChat("Mama", {
      encrypted: true,
      events: [
        callEvent("com.familychat.call.invite", {
          callId: "familycall123456",
          expiresAt: Date.now() + 30_000,
          mode: "audio",
        }),
      ],
      members: ["@timofey:familychat.local", "@mama:familychat.local"],
    });

    expect((await screen.findAllByText("Входящий аудиозвонок")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ответить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отклонить" })).toBeInTheDocument();
  });

  it("starts an outgoing audio call with Matrix signaling and a short-lived Family API token", async () => {
    stubCallBrowser();
    const fetchMock = await renderDirectChat();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /начать аудиозвонок с mama/i }));

    await waitFor(() =>
      expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalledWith(
        "!private-room-id:familychat.local",
        "com.familychat.call.invite",
        expect.objectContaining({
          callId: expect.any(String),
          mode: "audio",
        }),
      ),
    );
    await waitFor(() =>
      expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalledWith(
        "!private-room-id:familychat.local",
        "m.room.message",
        expect.objectContaining({
          "org.familychat.call.invite": true,
          body: "Входящий аудиозвонок",
          highlight: true,
          msgtype: "m.text",
        }),
        expect.stringMatching(/^familychat-call-push-/),
      ),
    );
    await waitFor(() =>
      expect(liveKitMocks.createLocalTracks).toHaveBeenCalledWith({
        audio: true,
        video: false,
      }),
    );

    const tokenCall = fetchMock.mock.calls.find(
      ([input]) => requestUrl(input) === "http://localhost:8000/api/calls/token",
    );
    expect(tokenCall).toBeDefined();
    expect(tokenCall?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer not-rendered-family-token",
        }),
        method: "POST",
      }),
    );
    expect(requestBody(tokenCall?.[1])).toEqual(
      expect.objectContaining({
        mode: "audio",
        targetUserId: "family-user-mama-uuid",
      }),
    );
    expect(requestBody(tokenCall?.[1])).not.toHaveProperty("roomName");
    expect(liveKitMocks.lastRoom()?.connect).toHaveBeenCalledWith(
      "ws://livekit.test:7880",
      "not-rendered-livekit-token",
    );
    expect(screen.queryByText("not-rendered-livekit-token")).not.toBeInTheDocument();
  });

  it("starts an outgoing video call with local camera and microphone tracks", async () => {
    stubCallBrowser();
    await renderDirectChat();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /начать видеозвонок с mama/i }));

    await waitFor(() =>
      expect(liveKitMocks.createLocalTracks).toHaveBeenCalledWith({
        audio: true,
        video: {
          degradationPreference: "maintain-resolution",
          facingMode: "user",
          frameRate: 24,
          resolution: { height: 720, width: 1280 },
        },
      }),
    );
    expect(await screen.findByText("Звонок подключён")).toBeInTheDocument();
  });

  it("accepts an incoming audio call and joins the LiveKit room only after answering", async () => {
    stubCallBrowser();
    await renderDirectChat();
    const user = userEvent.setup();
    const room = fakeRoom(
      "Mama",
      [],
      ["@timofey:familychat.local", "@mama:familychat.local"],
    );

    act(() =>
      matrixSdkMocks.emit(
        "Room.timeline",
        callEvent("com.familychat.call.invite", {
          callId: "incomingCall01",
          expiresAt: Date.now() + 45_000,
          mode: "audio",
        }),
        room,
        false,
      ),
    );

    expect((await screen.findAllByText("Входящий аудиозвонок")).length).toBeGreaterThan(0);
    expect(liveKitMocks.createLocalTracks).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /ответить/i }));

    await waitFor(() =>
      expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalledWith(
        "!private-room-id:familychat.local",
        "com.familychat.call.accept",
        expect.objectContaining({ callId: "incomingCall01" }),
      ),
    );
    await waitFor(() =>
      expect(liveKitMocks.createLocalTracks).toHaveBeenCalledWith({
        audio: true,
        video: false,
      }),
    );
  });

  it("rejects an incoming call without requesting local media or a LiveKit token", async () => {
    const fetchMock = await renderDirectChat();
    const user = userEvent.setup();
    const room = fakeRoom(
      "Mama",
      [],
      ["@timofey:familychat.local", "@mama:familychat.local"],
    );

    act(() =>
      matrixSdkMocks.emit(
        "Room.timeline",
        callEvent("com.familychat.call.invite", {
          callId: "incomingCall02",
          expiresAt: Date.now() + 45_000,
          mode: "video",
        }),
        room,
        false,
      ),
    );

    expect((await screen.findAllByText("Входящий видеозвонок")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /отклонить/i }));

    await waitFor(() =>
      expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalledWith(
        "!private-room-id:familychat.local",
        "com.familychat.call.reject",
        expect.objectContaining({ callId: "incomingCall02" }),
      ),
    );
    expect(liveKitMocks.createLocalTracks).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(
        ([input]) => requestUrl(input) === "http://localhost:8000/api/calls/token",
      ),
    ).toBe(false);
  });

  it("cancels an outgoing call while camera access is still pending", async () => {
    stubCallBrowser();
    liveKitMocks.createLocalTracks.mockImplementationOnce(
      () => new Promise(() => {
        /* keep pending until the test ends */
      }),
    );
    await renderDirectChat();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /начать видеозвонок с mama/i }));
    expect(await screen.findByRole("button", { name: /^отменить$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^отменить$/i }));

    await waitFor(() =>
      expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalledWith(
        "!private-room-id:familychat.local",
        "com.familychat.call.hangup",
        expect.objectContaining({ callId: expect.any(String) }),
      ),
    );
    expect(screen.queryByText("Звоним")).not.toBeInTheDocument();
    expect(screen.queryByText("Подключаемся")).not.toBeInTheDocument();
  });

  it("shows incoming call when invite expiresAt is serialized as a string", async () => {
    await renderDirectChat();
    const room = fakeRoom(
      "Mama",
      [],
      ["@timofey:familychat.local", "@mama:familychat.local"],
    );

    act(() =>
      matrixSdkMocks.emit(
        "Room.timeline",
        callEvent("com.familychat.call.invite", {
          callId: "incomingCall03",
          expiresAt: String(Date.now() + 45_000),
          mode: "video",
        }),
        room,
        false,
      ),
    );

    expect((await screen.findAllByText("Входящий видеозвонок")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Ответить" })).toBeInTheDocument();
  });

  it("handles mute, camera toggle, and hangup without exposing raw call identifiers", async () => {
    stubCallBrowser();
    await renderDirectChat();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /начать видеозвонок с mama/i }));
    await screen.findByText("Звонок подключён");

    const audioTrack = liveKitMocks.createdTracks.find((track) => track.kind === "audio");
    const videoTrack = liveKitMocks.createdTracks.find((track) => track.kind === "video");
    expect(audioTrack).toBeDefined();
    expect(videoTrack).toBeDefined();

    await user.click(screen.getByRole("button", { name: /^выключить микрофон$/i }));
    expect(audioTrack?.mute).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^включить микрофон$/i }));
    expect(audioTrack?.unmute).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^выключить камеру$/i }));
    expect(videoTrack?.stop).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^включить камеру$/i }));
    expect(liveKitMocks.createdTracks.filter((track) => track.kind === "video")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /^завершить звонок$/i }));

    await waitFor(() =>
      expect(matrixSdkMocks.client.sendEvent).toHaveBeenCalledWith(
        "!private-room-id:familychat.local",
        "com.familychat.call.hangup",
        expect.objectContaining({ callId: expect.any(String) }),
      ),
    );
    expect(audioTrack?.stop).toHaveBeenCalled();
    expect(videoTrack?.stop).toHaveBeenCalled();
    expect(liveKitMocks.lastRoom()?.disconnect).toHaveBeenCalled();
    expect(screen.queryByText(/fc-call-/i)).not.toBeInTheDocument();
  });

  it("shows a safe permission denial message for call media access failures", async () => {
    stubCallBrowser();
    liveKitMocks.createLocalTracksRejects(
      new DOMException("raw camera device /private/path", "NotAllowedError"),
    );
    await renderDirectChat();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /начать видеозвонок с mama/i }));

    expect(await screen.findByText("Доступ к камере или микрофону запрещён.")).toBeInTheDocument();
    expect(screen.queryByText(/private\/path/i)).not.toBeInTheDocument();
  });

  it("shows a safe connection failure message for LiveKit connection errors", async () => {
    stubCallBrowser();
    liveKitMocks.connectRejects(new Error("raw livekit ws://secret-host"));
    await renderDirectChat();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /начать аудиозвонок с mama/i }));

    expect(await screen.findByText("Звонок не удалось подключить.")).toBeInTheDocument();
    expect(screen.queryByText(/secret-host/i)).not.toBeInTheDocument();
  });

  it("ignores malformed and expired incoming call invites", async () => {
    await renderDirectChat();
    const room = fakeRoom(
      "Mama",
      [],
      ["@timofey:familychat.local", "@mama:familychat.local"],
    );

    act(() => {
      matrixSdkMocks.emit(
        "Room.timeline",
        callEvent("com.familychat.call.invite", {
          callId: "bad",
          expiresAt: Date.now() + 45_000,
          mode: "audio",
        }),
        room,
        false,
      );
      matrixSdkMocks.emit(
        "Room.timeline",
        callEvent("com.familychat.call.invite", {
          callId: "expiredCall01",
          expiresAt: Date.now() - 1,
          mode: "video",
        }),
        room,
        false,
      );
    });

    expect(screen.queryByText(/входящий аудиозвонок/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/входящий видеозвонок/i)).not.toBeInTheDocument();
  });
});

describe("Family chat discovery", () => {
  it("loads active family members through Family API without exposing raw identifiers", async () => {
    const fetchMock = await renderConnectedChat();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^семья$/i }));

    expect((await screen.findAllByText("Mama")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("MAM-1001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Papa").length).toBeGreaterThan(0);
    expect(screen.queryByText("@mama:familychat.local")).not.toBeInTheDocument();
    expect(screen.queryByText("family-user-mama-uuid")).not.toBeInTheDocument();
    expect(screen.queryByText("not-rendered-family-token")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/family/users",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer not-rendered-family-token",
        }),
        method: "GET",
      }),
    );
  });

  it("searches only by family code and keeps Matrix directory APIs unused", async () => {
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^семья$/i }));
    await user.type(await screen.findByLabelText(/семейный код/i), "mam-1001");
    await user.click(screen.getByRole("button", { name: /^найти$/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/family/users/search?code=MAM-1001",
        expect.objectContaining({ method: "GET" }),
      ),
    );
    expect(await screen.findAllByText("Mama")).not.toHaveLength(0);
    expect(matrixSdkMocks.client.searchUserDirectory).not.toHaveBeenCalled();
    expect(matrixSdkMocks.client.publicRooms).not.toHaveBeenCalled();
  });

  it("shows a safe family-code search miss", async () => {
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^семья$/i }));
    await user.type(await screen.findByLabelText(/семейный код/i), "nope-404");
    await user.click(screen.getByRole("button", { name: /^найти$/i }));

    expect(await screen.findByText("Участник семьи не найден.")).toBeInTheDocument();
    expect(screen.queryByText(/Raw backend search failure/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@external:evil/i)).not.toBeInTheDocument();
  });

  it("creates a direct chat only with a Family API user", async () => {
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^семья$/i }));
    const familySection = (await screen.findByRole("heading", { name: /участники семьи/i })).closest(
      "section",
    );
    expect(familySection).not.toBeNull();

    await user.click(
      within(familySection as HTMLElement).getAllByRole("button", { name: /написать/i })[0],
    );

    await waitFor(() =>
      expect(matrixSdkMocks.client.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          invite: ["@mama:familychat.local"],
          is_direct: true,
          preset: "private_chat",
          visibility: "private",
        }),
      ),
    );
    const directRoomRequest = (matrixSdkMocks.client.createRoom.mock.calls as unknown[][])[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(directRoomRequest).not.toHaveProperty("initial_state");
    expect(JSON.stringify(matrixSdkMocks.client.createRoom.mock.calls)).not.toContain(
      "@external:evil",
    );
  });

  it("opens an existing direct chat instead of creating a duplicate room", async () => {
    await renderConnectedChat("Mama", {
      encrypted: true,
      members: ["@timofey:familychat.local", "@mama:familychat.local"],
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^семья$/i }));
    const familySection = (await screen.findByRole("heading", { name: /участники семьи/i })).closest(
      "section",
    );
    expect(familySection).not.toBeNull();

    await user.click(
      within(familySection as HTMLElement).getAllByRole("button", { name: /написать/i })[0],
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Mama" })).toBeInTheDocument(),
    );
    expect(matrixSdkMocks.client.createRoom).not.toHaveBeenCalled();
  });

  it("creates group chats from selected Family API users only", async () => {
    await renderConnectedChat();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^семья$/i }));
    await screen.findByText("Семейная группа");
    await user.click(screen.getByLabelText("Выбрать Mama"));
    await user.click(screen.getByLabelText("Выбрать Papa"));
    await user.type(screen.getByLabelText(/название группы/i), "Weekend plans");
    await user.click(screen.getByRole("button", { name: /создать групповой чат/i }));

    await waitFor(() =>
      expect(matrixSdkMocks.client.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          invite: ["@mama:familychat.local", "@papa:familychat.local"],
          name: "Weekend plans",
          preset: "private_chat",
          visibility: "private",
        }),
      ),
    );
    const groupRoomRequest = (matrixSdkMocks.client.createRoom.mock.calls as unknown[][])[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(groupRoomRequest).not.toHaveProperty("initial_state");
    expect(screen.queryByLabelText(/matrix user/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/@user:server/i)).not.toBeInTheDocument();
    expect(JSON.stringify(matrixSdkMocks.client.createRoom.mock.calls)).not.toContain(
      "@external:evil",
    );
  });

  it("opens the backend-prepared common family chat without creating it client-side", async () => {
    await renderConnectedChat("Family Chat");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^семья$/i }));
    await user.click(await screen.findByRole("button", { name: /открыть семейный чат/i }));

    expect(matrixSdkMocks.client.createRoom).not.toHaveBeenCalled();
    expect(screen.getByText("Hello from Matrix")).toBeInTheDocument();
    expect(screen.getAllByText("Без шифрования").length).toBeGreaterThan(0);
  });

  it("does not create the common family chat from the frontend when it is missing", async () => {
    await renderConnectedChat("Other Family Room");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /^семья$/i }));
    await user.click(await screen.findByRole("button", { name: /открыть семейный чат/i }));

    expect(matrixSdkMocks.client.createRoom).not.toHaveBeenCalled();
    expect(await screen.findByText(/reconcile-команду для общей комнаты/i)).toBeInTheDocument();
  });
});
