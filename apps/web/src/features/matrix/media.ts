import type { MatrixEncryptedFile, MatrixMediaKind } from "./types";

export const matrixMediaMaxBytes = 100 * 1024 * 1024;

export type MatrixMediaValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export type MatrixMediaEventContent = {
  body: string;
  filename?: string;
  msgtype: "m.image" | "m.video" | "m.audio" | "m.file";
  info: {
    duration?: number;
    mimetype?: string;
    size?: number;
    w?: number;
    h?: number;
  };
  "org.familychat.voice"?: boolean;
  "org.familychat.video_note"?: boolean;
  "org.familychat.album"?: {
    items: MatrixMediaEventContent[];
  };
  url?: string;
  file?: MatrixEncryptedFile;
};

type EncryptedAttachmentLike = {
  encryptedData: Uint8Array;
  mediaEncryptionInfo?: string;
  free?: () => void;
};

type EncryptedAttachmentConstructor = new (
  encryptedData: Uint8Array,
  mediaEncryptionInfo: string,
) => { free?: () => void };

type AttachmentCryptoModule = {
  Attachment: {
    encrypt: (bytes: Uint8Array) => EncryptedAttachmentLike;
    decrypt: (attachment: InstanceType<EncryptedAttachmentConstructor>) => Uint8Array;
  };
  EncryptedAttachment: EncryptedAttachmentConstructor;
  initAsync?: () => Promise<void>;
};

let attachmentCryptoPromise: Promise<AttachmentCryptoModule> | null = null;

function attachmentCrypto(): Promise<AttachmentCryptoModule> {
  attachmentCryptoPromise ??= import("@matrix-org/matrix-sdk-crypto-wasm").then(
    async (module) => {
      await module.initAsync?.();
      return module as unknown as AttachmentCryptoModule;
    },
  );
  return attachmentCryptoPromise;
}

export function validateMatrixMediaFile(file: File): MatrixMediaValidationResult {
  if (file.size > matrixMediaMaxBytes) {
    return { ok: false, message: "Files must be 100 MB or smaller." };
  }
  return { ok: true };
}

export function matrixMediaKindForFile(file: Pick<File, "name" | "type">): MatrixMediaKind {
  const mimetype = file.type.toLowerCase();
  if (mimetype.startsWith("image/")) {
    return "image";
  }
  if (mimetype.startsWith("video/")) {
    return "video";
  }
  if (mimetype.startsWith("audio/")) {
    return "audio";
  }
  const name = file.name.toLowerCase();
  if (/\.(avif|gif|heic|heif|jpe?g|png|webp)$/.test(name)) {
    return "image";
  }
  if (/\.(mov|m4v|mp4|webm)$/.test(name)) {
    return "video";
  }
  if (/\.(aac|m4a|mp3|oga|ogg|opus|wav|webm)$/.test(name)) {
    return "audio";
  }
  return "file";
}

export function matrixMsgtypeForMediaKind(
  kind: MatrixMediaKind,
): MatrixMediaEventContent["msgtype"] {
  if (kind === "image") {
    return "m.image";
  }
  if (kind === "video") {
    return "m.video";
  }
  if (kind === "audio") {
    return "m.audio";
  }
  return "m.file";
}

export function formatMatrixMediaSize(size?: number): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

export function safeMatrixMediaName(fileName?: string): string {
  const trimmed = fileName?.trim();
  return trimmed || "Attachment";
}

export function buildMatrixMediaEventContent({
  caption,
  durationMs,
  encryptedFile,
  file,
  info,
  isVoice,
  isVideoNote,
  url,
}: {
  caption?: string;
  durationMs?: number;
  encryptedFile?: MatrixEncryptedFile;
  file: File;
  info?: { width?: number; height?: number };
  isVoice?: boolean;
  isVideoNote?: boolean;
  url?: string;
}): MatrixMediaEventContent {
  const kind = matrixMediaKindForFile(file);
  const name = safeMatrixMediaName(file.name);
  const voiceMessage = Boolean(isVoice && kind === "audio");
  const videoNote = Boolean(isVideoNote && kind === "video");
  const body = caption?.trim() || (voiceMessage ? "Голосовое сообщение" : videoNote ? "Кружок" : name);
  const safeDuration =
    typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
      ? Math.round(durationMs)
      : undefined;

  const content: MatrixMediaEventContent = {
    body,
    filename: name,
    info: {
      duration: safeDuration,
      h: info?.height,
      mimetype: file.type || undefined,
      size: file.size,
      w: info?.width,
    },
    msgtype: matrixMsgtypeForMediaKind(kind),
  };

  if (encryptedFile) {
    content.file = encryptedFile;
  } else if (url) {
    content.url = url;
  }

  if (voiceMessage) {
    content["org.familychat.voice"] = true;
  }
  if (videoNote) {
    content["org.familychat.video_note"] = true;
  }

  return content;
}

export async function encryptMatrixAttachment(file: File): Promise<{
  encryptedBytes: Uint8Array;
  encryptedFile: Omit<MatrixEncryptedFile, "url">;
}> {
  const { Attachment } = await attachmentCrypto();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encryptedAttachment = Attachment.encrypt(bytes);

  try {
    if (!encryptedAttachment.mediaEncryptionInfo) {
      throw new Error("Encrypted attachment metadata is unavailable");
    }

    return {
      encryptedBytes: encryptedAttachment.encryptedData,
      encryptedFile: JSON.parse(encryptedAttachment.mediaEncryptionInfo) as Omit<
        MatrixEncryptedFile,
        "url"
      >,
    };
  } finally {
    encryptedAttachment.free?.();
  }
}

export async function decryptMatrixAttachment(
  encryptedBytes: ArrayBuffer,
  encryptedFile: MatrixEncryptedFile,
): Promise<Uint8Array> {
  const { Attachment, EncryptedAttachment } = await attachmentCrypto();
  const encryptedAttachment = new EncryptedAttachment(
    new Uint8Array(encryptedBytes),
    JSON.stringify(encryptedFile),
  );

  try {
    return Attachment.decrypt(encryptedAttachment);
  } finally {
    encryptedAttachment.free?.();
  }
}
