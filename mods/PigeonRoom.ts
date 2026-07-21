import {
  FORMAT_VERSION,
  type Message,
  type ReceivedTextMessage,
  type TextMessage,
} from "@circuitlab/pigeon-message";
import {
  type BinaryFrameHeader,
  buildBinaryFrame,
  type NoIndex,
  parseBinaryFrame,
  parseTextFrame,
  type ReceivedTextMessageV0,
  type TextMessageV0,
} from "../lib/util.ts";
import { Pigeon } from "./Pigeon.ts";

export type IncomingFrame =
  | {
    kind: "text";
    pigeon: Pigeon;
    msg: Message;
  }
  | {
    kind: "binary";
    pigeon: Pigeon;
    header: BinaryFrameHeader;
    payload: Uint8Array;
    ver: number;
  };

export type FrameHook = (frame: IncomingFrame) => void;

export class PigeonRoom {
  public pigeons: Pigeon[];
  #hooks: FrameHook[];

  constructor() {
    this.pigeons = [];
    this.#hooks = [];

    setInterval(() => {
      if (this.pigeons.length) {
        this.#ping();
      }
      const [alive, disconnection] = this.pigeons.reduce<Pigeon[][]>(
        ([keep, drop], currentPigeon) => {
          return Date.now() - currentPigeon.lastMessageTime <= 75000
            ? [[currentPigeon, ...keep], drop]
            : [keep, [currentPigeon, ...drop]];
        },
        [[], []],
      );
      this.pigeons = alive;
      disconnection.forEach((pigeon) => pigeon.socket.close());
    }, 30000);
  }

  /**
   * Register a hook fired for every parsed incoming frame (text or binary),
   * regardless of routing target. Used by in-process consumers (e.g. the
   * archive-server bridge that forwards upstream frames to downstream).
   */
  public onFrame(hook: FrameHook): void {
    this.#hooks.push(hook);
  }

  handleReqest(req: Request): Response {
    const url = new URL(req.url);

    const address = url.searchParams.get("address");
    const id = url.searchParams.get("initas") ||
      url.searchParams.get("staticid");
    if (address) {
      if (id) {
        const pigeon = new Pigeon(req, id);
        this.addPigeon(pigeon);
        return pigeon.res();
      }
      const pigeon = new Pigeon(req);
      this.addPigeon(pigeon);
      return pigeon.res();
    } else {
      const { response, socket } = Deno.upgradeWebSocket(req);
      socket.close(1001, "websocket path did not have address");
      return response;
    }
  }

  addPigeon(pigeon: Pigeon): Pigeon {
    this.pigeons.push(pigeon);

    pigeon.on("open", () => {
      this.sendMsg({
        ver: FORMAT_VERSION,
        type: "init",
        address: pigeon.address,
        body: {
          id: pigeon.id,
          clients: [
            ...this.pigeons
              .filter((p) => p.address === pigeon.address)
              .map((p) => p.id),
          ],
        },
        to: [pigeon.id],
        from: "host",
      });

      this.sendMsg({
        ver: FORMAT_VERSION,
        type: "clientOpen",
        address: pigeon.address,
        body: {
          id: pigeon.id,
          clients: [
            ...this.pigeons
              .filter((p) => p.address === pigeon.address)
              .map((p) => p.id),
          ],
        },
        to: [
          ...this.pigeons
            .filter((p) => p.id !== pigeon.id && p.address === pigeon.address)
            .map((p) => p.id),
        ],
        from: "host",
      });
    });

    pigeon.on("message", (event) => {
      // Binary frame (v1+): parse, fire hooks, relay.
      if (event.data instanceof ArrayBuffer) {
        let parsed;
        try {
          parsed = parseBinaryFrame(event.data);
        } catch (e) {
          console.warn(
            "Invalid binary frame from",
            pigeon.id,
            (e as Error).message,
          );
          return;
        }
        // Binary frames exist only from v1 onward (there is no v0 binary). The
        // leading ver byte is preserved on relay but always interpreted as v1:
        // v0 maps to the first binary implementation (= v1), and unknown future
        // versions fall back to the v1 baseline until this room learns to parse
        // them.
        const { header, payload, ver } = parsed;

        if (!header || header.type === undefined || header.body === undefined) {
          console.warn("Binary frame header missing required fields:", header);
          return;
        }

        this.#fireHooks({
          kind: "binary",
          pigeon,
          // Authoritatively set `from` to the sending pigeon's id, mirroring
          // the text path. The sender-supplied `header.from` is not trusted:
          // a peer could omit or spoof it, and a bridge keying off
          // `frame.header.from` would otherwise see inconsistent values
          // between the text and binary paths.
          header: { ...header, from: pigeon.id },
          payload,
          ver,
        });

        const to = [header.to ?? []].flat();
        // Suppress relay when the message is addressed only to the host.
        if (to.length > 0 && to.every((t) => t === "host")) return;

        this.sendBinary(
          {
            type: header.type,
            body: header.body,
            payloadMeta: header.payloadMeta,
            address: pigeon.address,
            to,
            from: pigeon.id,
          },
          payload,
          ver,
        );
        return;
      }

      // Text frame: parse with version-aware parser.
      let parsedMsg: TextMessageV0 | TextMessage;
      try {
        parsedMsg = parseTextFrame(JSON.parse(event.data));
      } catch (e) {
        console.warn(
          "Invalid text frame from",
          pigeon.id,
          (e as Error).message,
        );
        return;
      }

      const { body, type } = parsedMsg;
      const to = [parsedMsg.to ?? []].flat();

      if (body === undefined || type === undefined) {
        console.warn("Missing required fields:", parsedMsg);
        return;
      }

      this.#fireHooks({
        kind: "text",
        pigeon,
        msg: { ...parsedMsg, from: pigeon.id, address: pigeon.address },
      });

      if (to.every((t) => t === "host")) {
        if (type === "ping") {
          this.#pong([pigeon.id]);
          return;
        }
        return;
      }

      // Relay: preserve the sender's ver. v1 is relayed natively; v0 and any
      // unknown version are relayed best-effort as v0 (the original ver field,
      // if present, is preserved by the spread).
      const ver = "ver" in parsedMsg ? (parsedMsg as TextMessage).ver : 0;
      switch (ver) {
        case 1:
          this.sendMsg({
            ...(parsedMsg as TextMessage),
            address: pigeon.address,
            to,
            from: pigeon.id,
          });
          break;
        case 0:
          this.sendMsgV0({
            ...(parsedMsg as TextMessageV0),
            address: pigeon.address,
            to,
            from: pigeon.id,
          });
          break;
        default:
          this.sendMsgV0({
            ...(parsedMsg as TextMessageV0),
            address: pigeon.address,
            to,
            from: pigeon.id,
          });
      }
    });

    pigeon.on("close", () => {
      // Remove the specific pigeon instance that closed. Filtering by id
      // here was unsafe because clients can re-use an id across sessions
      // via the `staticid` query parameter: when an old pigeon closed,
      // every pigeon sharing that id (including a freshly-reconnected
      // one) was evicted from the list.
      this.pigeons = this.pigeons.filter((c) => c !== pigeon);
      this.sendMsg({
        ver: FORMAT_VERSION,
        type: "clientClose",
        body: {
          id: pigeon.id,
          clients: [
            ...this.pigeons
              .filter((p) => p.address === pigeon.address)
              .map((p) => p.id),
          ],
        },
        address: pigeon.address,
        to: [
          ...this.pigeons
            .filter((p) => p.id !== pigeon.id && p.address === pigeon.address)
            .map((p) => p.id),
        ],
        from: "host",
      });
    });

    return pigeon;
  }

  /**
   * Deliver to every target that can actually receive right now.
   *
   * A pigeon joins `this.pigeons` when its request is upgraded, which is
   * before its socket reaches OPEN, and it may close at any moment after.
   * `send()` on such a socket throws `'readyState' not OPEN`. Sends originate
   * inside WebSocket event listeners (a client's `open` fans `clientOpen` out
   * to its peers), so an escaping throw is an uncaught exception that takes
   * the whole host process down — two clients connecting at the same instant
   * are enough to do it.
   *
   * One unreachable peer must also never abort the fan-out to the others.
   */
  #deliver(targets: Pigeon[], data: string | ArrayBuffer): void {
    for (const pigeon of targets) {
      if (pigeon.socket.readyState !== WebSocket.OPEN) continue;
      try {
        pigeon.socket.send(data);
      } catch (e) {
        // The socket can close between the check and the send.
        console.warn(`send to pigeon ${pigeon.id} failed:`, e);
      }
    }
  }

  // Send a v1 text message. timestamp is always set by the room.
  sendMsg(msg: Omit<NoIndex<ReceivedTextMessage>, "timestamp">): void {
    const { address, from, to } = msg;
    const targetPigeons = this.#resolveTargets(address, from, to as string[]);
    this.#deliver(
      targetPigeons,
      JSON.stringify({ ...msg, timestamp: Date.now() }),
    );
  }

  // Send a v0 text message (no ver field). timestamp is always set by the room.
  sendMsgV0(msg: Omit<ReceivedTextMessageV0, "timestamp">): void {
    const { address, from, to } = msg;
    const targetPigeons = this.#resolveTargets(address, from, to);
    this.#deliver(
      targetPigeons,
      JSON.stringify({ ...msg, timestamp: Date.now() }),
    );
  }

  /**
   * Send a binary frame (v1+). The frame is rebuilt so that from / address /
   * timestamp are authoritatively set by the host.
   */
  sendBinary(
    msg: NoIndex<BinaryFrameHeader> & { from: string; address: string },
    payload: Uint8Array,
    version?: number,
  ): void {
    const { address, from, to } = msg;
    const targetPigeons = this.#resolveTargets(address, from, to as string[]);
    // Nothing to relay to — skip building the frame. The payload can be large
    // (e.g. ~100 KB depth frames at 30 Hz), so avoid the allocation + copy
    // when no recipient would receive it.
    if (targetPigeons.length === 0) return;
    const frame = buildBinaryFrame(
      {
        type: msg.type,
        to: msg.to,
        body: msg.body as BinaryFrameHeader["body"],
        payloadMeta: msg.payloadMeta,
        from,
        address,
      },
      payload,
      version,
    );
    this.#deliver(targetPigeons, frame);
  }

  #fireHooks(frame: IncomingFrame): void {
    for (const hook of this.#hooks) {
      try {
        hook(frame);
      } catch (e) {
        console.warn("frame hook threw:", e);
      }
    }
  }

  #resolveTargets(address: string, from: string, to: string[]): Pigeon[] {
    const clientsInTargetAddress = this.pigeons.filter(
      (p) => p.address === address || address === "all",
    );

    const targetPigeons: Pigeon[] = [];
    if (to.includes("all") || to.includes("others")) {
      if (to.includes("all") || to.includes(from)) {
        targetPigeons.push(...clientsInTargetAddress);
      } else if (to.includes("others")) {
        targetPigeons.push(
          ...clientsInTargetAddress.filter((c) => c.id !== from),
        );
      }
    } else {
      targetPigeons.push(
        ...clientsInTargetAddress.filter((c) => to.includes(c.id)),
      );
    }

    return targetPigeons.reduce<Pigeon[]>((prev, cur) => {
      if (!prev.map((p) => p.id).includes(cur.id)) prev.push(cur);
      return prev;
    }, []);
  }

  #ping() {
    this.sendMsg({
      ver: FORMAT_VERSION,
      to: ["all"],
      address: "all",
      type: "ping",
      body: "",
      from: "host",
    });
  }

  #pong(to: string[]) {
    this.sendMsg({
      ver: FORMAT_VERSION,
      to,
      type: "pong",
      address: "all",
      body: "",
      from: "host",
    });
  }
}
