export type ClientId = string;
export type Address = string;

export type Msg<T = string> = {
  type: "ping" | "pong" | "message" | "clientOpen" | "clientClose" | "init" | T;
  body: unknown;
  address: Address | "all";
  to: ("all" | "others" | ClientId)[];
  from?: ClientId | "host";
};

export type msgFromServer = Pick<Msg, "type" | "body" | "address" | "to"> & {
  from: ClientId | "host";
};

// ---------- Binary frame extension ----------
//
// Wire layout (big-endian):
//
//   +--------+----------------+--------------------------------+----------------------+
//   | ver(1) | hdrLen(2)      | header (UTF-8 JSON, hdrLen B)  | payload (任意 B)     |
//   +--------+----------------+--------------------------------+----------------------+
//
// `header` schema mirrors `Msg` (type/to/body/from). `address`/`timestamp` are
// authoritatively set by the host on relay, so senders SHOULD NOT include them.

export const BINARY_FRAME_VERSION = 0x01;

export type BinaryFrameHeader = Pick<Msg, "type" | "to" | "body"> & {
  from?: ClientId | "host";
};

// On relay the host authoritatively stamps `address` and `timestamp` into the
// header, so a received frame always carries them even though senders must not
// set them. This type reflects what a receiver actually sees.
export type ReceivedBinaryFrameHeader = BinaryFrameHeader & {
  address?: Address;
  timestamp?: number;
};

export type ParsedBinaryFrame = {
  version: number;
  header: ReceivedBinaryFrameHeader;
  payload: Uint8Array;
};

export function parseBinaryFrame(buf: ArrayBuffer): ParsedBinaryFrame {
  if (buf.byteLength < 3) {
    throw new Error("binary frame too short");
  }
  const view = new DataView(buf);
  const version = view.getUint8(0);
  const hdrLen = view.getUint16(1, false);
  if (3 + hdrLen > buf.byteLength) {
    throw new Error("binary frame header length exceeds buffer");
  }
  const headerBytes = new Uint8Array(buf, 3, hdrLen);
  const header = JSON.parse(new TextDecoder().decode(headerBytes));
  const payload = new Uint8Array(buf, 3 + hdrLen);
  return { version, header, payload };
}

export function buildBinaryFrame(
  header: BinaryFrameHeader & { address?: Address; timestamp?: number },
  payload: Uint8Array,
  version: number = BINARY_FRAME_VERSION,
): ArrayBuffer {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  if (headerBytes.length > 0xffff) {
    throw new Error(
      `binary frame header too large: ${headerBytes.length} > 65535`,
    );
  }
  const totalLen = 3 + headerBytes.length + payload.byteLength;
  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer);
  view.setUint8(0, version);
  view.setUint16(1, headerBytes.length, false);
  out.set(headerBytes, 3);
  out.set(payload, 3 + headerBytes.length);
  return out.buffer;
}
