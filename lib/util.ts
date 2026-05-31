import {
  BINARY_FRAME_VERSION,
  MAX_HEADER_BYTES,
  type BinaryFrameHeader,
  type ParsedBinaryFrame,
} from "@circuitlab/pigeon-message";

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
  payloadMeta?: unknown;
};

export { BINARY_FRAME_VERSION, MAX_HEADER_BYTES };
export type { BinaryFrameHeader, ParsedBinaryFrame };
/** @deprecated Use {@link BinaryFrameHeader} instead. */
export type { BinaryFrameHeader as ReceivedBinaryFrameHeader };

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
