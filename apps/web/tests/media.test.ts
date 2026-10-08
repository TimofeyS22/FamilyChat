import { describe, expect, it } from "vitest";

import {
  buildMatrixMediaEventContent,
  matrixMediaKindForFile,
  matrixMediaMaxBytes,
  validateMatrixMediaFile,
} from "@/features/matrix/media";

describe("Matrix media helpers", () => {
  it("accepts files up to the Stage 7 100 MB limit", () => {
    const file = new File([new Uint8Array(16)], "photo.png", { type: "image/png" });

    expect(validateMatrixMediaFile(file)).toEqual({ ok: true });
  });

  it("blocks oversized files before upload", () => {
    const oversized = new File(["x"], "too-large.zip", { type: "application/zip" });
    Object.defineProperty(oversized, "size", {
      configurable: true,
      value: matrixMediaMaxBytes + 1,
    });

    expect(validateMatrixMediaFile(oversized)).toEqual({
      message: "Files must be 100 MB or smaller.",
      ok: false,
    });
  });

  it("maps browser file mimetypes to Matrix media kinds including audio", () => {
    expect(matrixMediaKindForFile(new File(["x"], "image.jpg", { type: "image/jpeg" }))).toBe(
      "image",
    );
    expect(matrixMediaKindForFile(new File(["x"], "clip.mp4", { type: "video/mp4" }))).toBe(
      "video",
    );
    expect(matrixMediaKindForFile(new File(["x"], "song.mp3", { type: "audio/mpeg" }))).toBe(
      "audio",
    );
    expect(
      matrixMediaKindForFile(new File(["x"], "archive.zip", { type: "application/zip" })),
    ).toBe("file");
  });

  it("builds Matrix voice audio content without plaintext media URLs when encrypted", () => {
    const file = new File(["voice"], "voice-message.webm", { type: "audio/webm" });
    const content = buildMatrixMediaEventContent({
      durationMs: 1800,
      encryptedFile: {
        hashes: { sha256: "hash" },
        iv: "iv",
        key: {
          alg: "A256CTR",
          ext: true,
          k: "key",
          key_ops: ["decrypt", "encrypt"],
          kty: "oct",
        },
        url: "mxc://familychat.local/ciphertext",
        v: "v2",
      },
      file,
      isVoice: true,
    });

    expect(content).toEqual(
      expect.objectContaining({
        "org.familychat.voice": true,
        body: "Голосовое сообщение",
        file: expect.objectContaining({ url: "mxc://familychat.local/ciphertext" }),
        filename: "voice-message.webm",
        msgtype: "m.audio",
      }),
    );
    expect(content.info).toEqual(
      expect.objectContaining({
        duration: 1800,
        mimetype: "audio/webm",
        size: 5,
      }),
    );
    expect(content).not.toHaveProperty("url");
  });
});
