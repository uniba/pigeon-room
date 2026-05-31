import {
  BINARY_FRAME_VERSION,
  MAX_HEADER_BYTES,
  type BinaryFrameHeader,
  type ParsedBinaryFrame,
  type TextMessage,
} from "@circuitlab/pigeon-message";

export type ClientId = string;
export type Address = string;

/** Strips the index signature from T, leaving only explicitly declared properties. */
export type NoIndex<T> = {
  [K in keyof T as string extends K ? never : K]: T[K]
};

// v0 text message — no `ver` field; binary frames not supported in v0
export type TextMessageV0 = {
  type: string;
  to: string[];
  body: unknown;
  from?: string;
  address?: string;
  timestamp?: number;
};

export type ReceivedTextMessageV0 = TextMessageV0 & {
  from: string;
  address: string;
  timestamp: number;
};

export function parseTextFrameV0(parsed: unknown): TextMessageV0 {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("not an object");
  }
  const msg = parsed as Record<string, unknown>;
  if (typeof msg.type !== "string") throw new Error("missing type");
  if (!Array.isArray(msg.to)) throw new Error("missing to");
  return parsed as TextMessageV0;
}

export function parseTextFrameV1(parsed: unknown): TextMessage {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("not an object");
  }
  const msg = parsed as Record<string, unknown>;
  if (msg.ver !== 1) throw new Error("expected ver 1");
  if (typeof msg.type !== "string") throw new Error("missing type");
  if (!Array.isArray(msg.to)) throw new Error("missing to");
  return parsed as TextMessage;
}

export function parseTextFrame(parsed: unknown): TextMessageV0 | TextMessage {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("not an object");
  }
  const ver = (parsed as Record<string, unknown>).ver;
  switch (ver) {
    case 1:
      return parseTextFrameV1(parsed);
    case 0:
      // Explicit v0.
      return parseTextFrameV0(parsed);
    case undefined:
      // Absent ver ⇒ v0 (spec: "ver absent ⇒ v0").
      return parseTextFrameV0(parsed);
    default:
      // Unknown future version ⇒ best-effort fallback to v0. The routing
      // envelope (to/from/address) is shared across versions, so the room can
      // still relay even when it doesn't understand the sender's version.
      return parseTextFrameV0(parsed);
  }
}

export { BINARY_FRAME_VERSION, MAX_HEADER_BYTES };
export type { BinaryFrameHeader, ParsedBinaryFrame, TextMessage };

export function parseBinaryFrame(buf: ArrayBuffer): ParsedBinaryFrame {
  if (buf.byteLength < 3) {
    throw new Error("binary frame too short");
  }
  const view = new DataView(buf);
  const ver = view.getUint8(0);
  const hdrLen = view.getUint16(1, false);
  if (3 + hdrLen > buf.byteLength) {
    throw new Error("binary frame header length exceeds buffer");
  }
  const headerBytes = new Uint8Array(buf, 3, hdrLen);
  const header = JSON.parse(new TextDecoder().decode(headerBytes));
  const payload = new Uint8Array(buf, 3 + hdrLen);
  return { ver, header, payload };
}

export function buildBinaryFrame(
  header: BinaryFrameHeader & { address?: string; timestamp?: number },
  payload: Uint8Array,
  version: number = BINARY_FRAME_VERSION,
): ArrayBuffer {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  if (headerBytes.length > MAX_HEADER_BYTES) {
    throw new Error(
      `binary frame header too large: ${headerBytes.length} > ${MAX_HEADER_BYTES}`,
    );
  }
  const totalLen = 3 + headerBytes.length + payload.byteLength;
  const out = new Uint8Array(totalLen);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, version);
  dv.setUint16(1, headerBytes.length, false);
  out.set(headerBytes, 3);
  out.set(payload, 3 + headerBytes.length);
  return out.buffer;
}
