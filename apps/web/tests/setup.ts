import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

type MatrixListener = (...args: unknown[]) => void;

const matrixSdkMocks = vi.hoisted(() => {
  const listeners = new Map<string, Set<MatrixListener>>();
  let cryptoEnabled = false;
  const crypto = {
    getOwnDeviceKeys: vi.fn(() =>
      Promise.resolve({ curve25519: "fake-curve-key", ed25519: "fake-ed-key" }),
    ),
    isCrossSigningReady: vi.fn(() => Promise.resolve(true)),
    isSecretStorageReady: vi.fn(() => Promise.resolve(true)),
  };
  const client = {
    createRoom: vi.fn(() => Promise.resolve({ room_id: "!created-room:familychat.local" })),
    getAccountData: vi.fn((): unknown => undefined),
    getCrypto: vi.fn(() => (cryptoEnabled ? crypto : undefined)),
    getRooms: vi.fn((): unknown[] => []),
    getUser: vi.fn((): unknown => null),
    getDeviceId: vi.fn(() => "FAKEDEVICE"),
    getUserId: vi.fn(() => "@timofey:familychat.local"),
    initRustCrypto: vi.fn(() => {
      cryptoEnabled = true;
      return Promise.resolve();
    }),
    joinRoom: vi.fn(() => Promise.resolve({})),
    login: vi.fn(() =>
      Promise.resolve({
        access_token: "fake-matrix-token",
        device_id: "FAKEDEVICE",
        user_id: "@timofey:familychat.local",
      }),
    ),
    logout: vi.fn(() => Promise.resolve({})),
    mxcUrlToHttp: vi.fn((mxcUrl: string) => `https://matrix.local/media/${encodeURIComponent(mxcUrl)}`),
    off: vi.fn((eventName: string, listener: MatrixListener) => {
      listeners.get(eventName)?.delete(listener);
    }),
    on: vi.fn((eventName: string, listener: MatrixListener) => {
      const current = listeners.get(eventName) ?? new Set<MatrixListener>();
      current.add(listener);
      listeners.set(eventName, current);
    }),
    publicRooms: vi.fn(() => Promise.resolve({ chunk: [] })),
    retryImmediately: vi.fn(() => true),
    sendReadReceipt: vi.fn(() => Promise.resolve({})),
    sendEvent: vi.fn(() => Promise.resolve({})),
    sendTextMessage: vi.fn(() => Promise.resolve({})),
    searchUserDirectory: vi.fn(() => Promise.resolve({ results: [] })),
    setRoomReadMarkers: vi.fn(() => Promise.resolve({})),
    removePusher: vi.fn(() => Promise.resolve({})),
    setPusher: vi.fn(() => Promise.resolve({})),
    setPresence: vi.fn(() => Promise.resolve({})),
    startClient: vi.fn(),
    stopClient: vi.fn(),
    uploadContent: vi.fn(() =>
      Promise.resolve({ content_uri: "mxc://familychat.local/uploaded-media" }),
    ),
  };

  return {
    client,
    createClient: vi.fn(() => client),
    crypto,
    emit(eventName: string, ...args: unknown[]) {
      for (const listener of listeners.get(eventName) ?? []) {
        listener(...args);
      }
    },
    reset() {
      listeners.clear();
      cryptoEnabled = false;
      crypto.getOwnDeviceKeys.mockResolvedValue({
        curve25519: "fake-curve-key",
        ed25519: "fake-ed-key",
      });
      crypto.isCrossSigningReady.mockResolvedValue(true);
      crypto.isSecretStorageReady.mockResolvedValue(true);
      client.createRoom.mockResolvedValue({ room_id: "!created-room:familychat.local" });
      client.getAccountData.mockReturnValue(undefined);
      client.getCrypto.mockImplementation(() => (cryptoEnabled ? crypto : undefined));
      client.getRooms.mockReturnValue([]);
      client.getUser.mockReturnValue(null);
      client.getDeviceId.mockReturnValue("FAKEDEVICE");
      client.getUserId.mockReturnValue("@timofey:familychat.local");
      client.initRustCrypto.mockImplementation(() => {
        cryptoEnabled = true;
        return Promise.resolve();
      });
      client.joinRoom.mockResolvedValue({});
      client.login.mockResolvedValue({
        access_token: "fake-matrix-token",
        device_id: "FAKEDEVICE",
        user_id: "@timofey:familychat.local",
      });
      client.logout.mockResolvedValue({});
      client.mxcUrlToHttp.mockImplementation(
        (mxcUrl: string) => `https://matrix.local/media/${encodeURIComponent(mxcUrl)}`,
      );
      client.sendTextMessage.mockResolvedValue({});
      client.sendEvent.mockResolvedValue({});
      client.searchUserDirectory.mockResolvedValue({ results: [] });
      client.publicRooms.mockResolvedValue({ chunk: [] });
      client.removePusher.mockResolvedValue({});
      client.retryImmediately.mockReturnValue(true);
      client.sendReadReceipt.mockResolvedValue({});
      client.uploadContent.mockResolvedValue({ content_uri: "mxc://familychat.local/uploaded-media" });
      client.setPusher.mockResolvedValue({});
      client.setRoomReadMarkers.mockResolvedValue({});
      client.createRoom.mockClear();
      client.getAccountData.mockClear();
      client.getCrypto.mockClear();
      client.getRooms.mockClear();
      client.getUser.mockClear();
      client.getDeviceId.mockClear();
      client.getUserId.mockClear();
      client.initRustCrypto.mockClear();
      client.joinRoom.mockClear();
      client.login.mockClear();
      client.logout.mockClear();
      client.mxcUrlToHttp.mockClear();
      client.off.mockClear();
      client.on.mockClear();
      client.publicRooms.mockClear();
      client.removePusher.mockClear();
      client.retryImmediately.mockClear();
      client.sendReadReceipt.mockClear();
      client.sendEvent.mockClear();
      client.sendTextMessage.mockClear();
      client.searchUserDirectory.mockClear();
      client.setPusher.mockClear();
      client.setPresence.mockClear();
      client.setRoomReadMarkers.mockClear();
      client.startClient.mockClear();
      client.stopClient.mockClear();
      client.uploadContent.mockClear();
      crypto.getOwnDeviceKeys.mockClear();
      crypto.isCrossSigningReady.mockClear();
      crypto.isSecretStorageReady.mockClear();
    },
  };
});

const cryptoWasmMocks = vi.hoisted(() => {
  class EncryptedAttachment {
    encryptedData: Uint8Array;
    mediaEncryptionInfo: string;

    constructor(encryptedData: Uint8Array, mediaEncryptionInfo: string) {
      this.encryptedData = encryptedData;
      this.mediaEncryptionInfo = mediaEncryptionInfo;
    }

    free = vi.fn();
  }

  const encryptedFileInfo = {
    hashes: { sha256: "mock-ciphertext-hash" },
    iv: "mock-iv",
    key: {
      alg: "A256CTR",
      ext: true,
      k: "mock-key",
      key_ops: ["decrypt", "encrypt"],
      kty: "oct",
    },
    v: "v2",
  };

  const Attachment = {
    decrypt: vi.fn(() => new TextEncoder().encode("decrypted media")),
    encrypt: vi.fn(() => ({
      encryptedData: new Uint8Array([69, 50, 69, 69]),
      free: vi.fn(),
      mediaEncryptionInfo: JSON.stringify(encryptedFileInfo),
    })),
  };

  return {
    Attachment,
    EncryptedAttachment,
    encryptedFileInfo,
    initAsync: vi.fn(() => Promise.resolve()),
    reset() {
      Attachment.decrypt.mockClear();
      Attachment.encrypt.mockClear();
      this.initAsync.mockClear();
    },
  };
});

type LiveKitListener = (...args: unknown[]) => void;
type MockLiveKitTrack = {
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  kind: "audio" | "video";
  mute: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  unmute: ReturnType<typeof vi.fn>;
};

const liveKitMocks = vi.hoisted(() => {
  const RoomEvent = {
    Connected: "connected",
    ConnectionStateChanged: "connectionStateChanged",
    Disconnected: "disconnected",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
  };
  const Track = {
    Kind: {
      Audio: "audio",
      Video: "video",
    },
  };
  class VideoPreset {
    encoding: { maxBitrate: number; maxFramerate?: number };
    height: number;
    width: number;

    constructor(width: number, height: number, maxBitrate: number, maxFramerate?: number) {
      this.width = width;
      this.height = height;
      this.encoding = { maxBitrate, maxFramerate };
    }
  }
  const VideoPresets = {
    h720: {
      encoding: { maxBitrate: 2_500_000, maxFramerate: 30 },
      height: 720,
      resolution: { height: 720, width: 1280 },
      width: 1280,
    },
  };
  const roomInstances: MockRoom[] = [];
  const createdTracks: MockLiveKitTrack[] = [];
  let createLocalTracksError: unknown = null;
  let connectError: unknown = null;

  function createTrack(kind: "audio" | "video"): MockLiveKitTrack {
    const track = {
      attach: vi.fn((element?: HTMLMediaElement) => element ?? ({} as HTMLMediaElement)),
      detach: vi.fn(() => []),
      kind,
      mute: vi.fn(() => Promise.resolve()),
      stop: vi.fn(),
      unmute: vi.fn(() => Promise.resolve()),
    };
    createdTracks.push(track);
    return track;
  }

  class MockRoom {
    readonly listeners = new Map<string, Set<LiveKitListener>>();
    readonly localParticipant = {
      publishTrack: vi.fn(() => Promise.resolve()),
      setCameraEnabled: vi.fn((enabled: boolean) => {
        if (!enabled) {
          const latestVideoTrack = createdTracks
            .filter((track) => track.kind === "video")
            .at(-1);
          (latestVideoTrack?.stop as (() => void) | undefined)?.();
          return Promise.resolve(undefined);
        }
        const track = createTrack("video");
        return Promise.resolve({ track });
      }),
    };

    constructor() {
      roomInstances.push(this);
    }

    connect = vi.fn(() => (connectError ? Promise.reject(connectError) : Promise.resolve()));

    disconnect = vi.fn(() => {
      this.emit(RoomEvent.Disconnected);
    });

    on = vi.fn((eventName: string, listener: LiveKitListener) => {
      const listeners = this.listeners.get(eventName) ?? new Set<LiveKitListener>();
      listeners.add(listener);
      this.listeners.set(eventName, listeners);
      return this;
    });

    emit(eventName: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(eventName) ?? []) {
        listener(...args);
      }
    }
  }

  const createLocalTracks = vi.fn((options: { audio?: boolean; video?: boolean }) => {
    if (createLocalTracksError) {
      return Promise.reject(createLocalTracksError);
    }
    const tracks: MockLiveKitTrack[] = [];
    if (options.audio) {
      tracks.push(createTrack("audio"));
    }
    if (options.video) {
      tracks.push(createTrack("video"));
    }
    return Promise.resolve(tracks);
  });

  return {
    Room: MockRoom,
    RoomEvent,
    Track,
    VideoPreset,
    VideoPresets,
    connectRejects(error: unknown) {
      connectError = error;
    },
    createLocalTracks,
    createLocalTracksRejects(error: unknown) {
      createLocalTracksError = error;
    },
    createdTracks,
    emitConnectionFailure() {
      roomInstances.at(-1)?.emit(RoomEvent.ConnectionStateChanged, "failed");
    },
    lastRoom() {
      return roomInstances.at(-1) ?? null;
    },
    reset() {
      connectError = null;
      createLocalTracksError = null;
      roomInstances.length = 0;
      createdTracks.length = 0;
      createLocalTracks.mockClear();
    },
    roomInstances,
  };
});

vi.mock("matrix-js-sdk", () => ({
  createClient: matrixSdkMocks.createClient,
}));

vi.mock("@matrix-org/matrix-sdk-crypto-wasm", () => ({
  Attachment: cryptoWasmMocks.Attachment,
  EncryptedAttachment: cryptoWasmMocks.EncryptedAttachment,
  initAsync: cryptoWasmMocks.initAsync,
}));

vi.mock("livekit-client", () => ({
  Room: liveKitMocks.Room,
  RoomEvent: liveKitMocks.RoomEvent,
  Track: liveKitMocks.Track,
  VideoPreset: liveKitMocks.VideoPreset,
  VideoPresets: liveKitMocks.VideoPresets,
  createLocalTracks: liveKitMocks.createLocalTracks,
}));

export function getMatrixSdkMocks() {
  return matrixSdkMocks;
}

export function getCryptoWasmMocks() {
  return cryptoWasmMocks;
}

export function getLiveKitMocks() {
  return liveKitMocks;
}

let objectUrlCounter = 0;
function installObjectUrlMocks() {
  Object.defineProperty(window.URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => {
      objectUrlCounter += 1;
      return `blob:familychat-test-${objectUrlCounter}`;
    }),
  });
  Object.defineProperty(window.URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
}

installObjectUrlMocks();

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

beforeEach(() => {
  installObjectUrlMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  matrixSdkMocks.reset();
  cryptoWasmMocks.reset();
  liveKitMocks.reset();
  window.localStorage.clear();
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
});
