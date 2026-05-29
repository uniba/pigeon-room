import {
  BinaryFrameHeader,
  buildBinaryFrame,
  Msg,
  msgFromServer,
  parseBinaryFrame,
} from "../lib/util.ts";
import { Pigeon } from "./Pigeon.ts";

export type IncomingFrame =
  | {
    kind: "text";
    pigeon: Pigeon;
    msg: Msg;
  }
  | {
    kind: "binary";
    pigeon: Pigeon;
    header: BinaryFrameHeader;
    payload: Uint8Array;
    version: number;
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
        type: "init",
        address: pigeon.address,
        body: {
          id: pigeon.id,
          clients: [
            ...this.pigeons
              .filter((p) => {
                return p.address === pigeon.address;
              })
              .map((p) => p.id),
          ],
        },
        to: [pigeon.id],
        from: "host",
      });

      this.sendMsg({
        type: "clientOpen",
        address: pigeon.address,
        body: {
          id: pigeon.id,
          clients: [
            ...this.pigeons
              .filter((p) => {
                return p.address === pigeon.address;
              })
              .map((p) => p.id),
          ],
        },
        to: [
          ...this.pigeons
            .filter((p) => {
              return p.id !== pigeon.id && p.address === pigeon.address;
            })
            .map((p) => p.id),
        ],
        from: "host",
      });
    });

    pigeon.on("message", (event) => {
      // Binary frame: parse header, fire hooks, then relay (unless host-only).
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
        const { header, payload, version } = parsed;

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
          version,
        });

        const to = [header.to ?? []].flat();
        // Suppress relay when the message is addressed only to the host.
        if (to.length > 0 && to.every((t) => t === "host")) {
          return;
        }
        this.sendBinary(
          {
            type: header.type,
            body: header.body,
            address: pigeon.address,
            to,
            from: pigeon.id,
          },
          payload,
          version,
        );
        return;
      }

      // Text frame: existing behavior.
      let parsed: unknown;

      try {
        parsed = JSON.parse(event.data);
      } catch (_e) {
        console.warn("Invalid JSON:", event.data);
        return;
      }

      if (!parsed || typeof parsed !== "object") {
        console.warn("Parsed data is not an object:", parsed);
        return;
      }

      const { body, type } = parsed as Msg;
      let { to = [] } = parsed as Msg;

      if (body === undefined || type === undefined) {
        console.warn("Missing required fields:", parsed);
        return;
      }

      to = [to].flat();

      this.#fireHooks({
        kind: "text",
        pigeon,
        msg: {
          type,
          body,
          to,
          from: pigeon.id,
          address: pigeon.address,
        },
      });

      if (to.every((to) => to == "host")) {
        if (type === "ping") {
          this.#pong([pigeon.id]);
          return;
        }
      }
      if (!to.every((to) => to == "host")) {
        this.sendMsg({
          type,
          body,
          address: pigeon.address,
          to,
          from: pigeon.id,
        });
      }
      return;
    });

    pigeon.on("close", () => {
      this.pigeons = [
        ...this.pigeons.filter((c) => {
          return c.id !== pigeon.id;
        }),
      ];
      this.sendMsg({
        type: "clientClose",
        body: {
          id: pigeon.id,
          clients: [
            ...this.pigeons
              .filter((p) => {
                return p.address === pigeon.address;
              })
              .map((p) => p.id),
          ],
        },
        address: pigeon.address,
        to: [
          ...this.pigeons
            .filter((p) => {
              return p.id !== pigeon.id && p.address === pigeon.address;
            })
            .map((p) => p.id),
        ],
        from: "host",
      });
    });

    return pigeon;
  }

  sendMsg(msg: msgFromServer): void {
    const { address, from, to } = msg;
    const targetPigeons = this.#resolveTargets(address, from, to);
    try {
      const msgBody = JSON.stringify({
        ...msg,
        timestamp: new Date().getTime(),
      });
      targetPigeons.forEach((socket) => {
        socket.socket.send(msgBody);
      });
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(e.message);
      } else {
        throw new Error("caught unknown error");
      }
    }
  }

  /**
   * Send a binary frame to recipients in `header.address`. The frame is
   * rebuilt so that header.from / header.address / header.timestamp are
   * authoritatively set by the host (mirrors sendMsg semantics).
   */
  sendBinary(
    msg: msgFromServer,
    payload: Uint8Array,
    version?: number,
  ): void {
    const { address, from, to } = msg;
    const targetPigeons = this.#resolveTargets(address, from, to);
    const frame = buildBinaryFrame(
      {
        type: msg.type,
        to,
        body: msg.body as BinaryFrameHeader["body"],
        from,
        address,
        timestamp: Date.now(),
      },
      payload,
      version,
    );
    targetPigeons.forEach((p) => p.socket.send(frame));
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

  #resolveTargets(
    address: string,
    from: string,
    to: ("all" | "others" | string)[],
  ): Pigeon[] {
    const clientsInTargetAddress: Pigeon[] = this.pigeons.filter((socket) => {
      // TODO: to: [`${id}@${address}`]などで送信できるようにする
      // TODO: addressが任意なので、?address=allで接続されると困るのをどうにかする。
      return socket.address === address || address === "all";
    });

    const targetPigeons: Pigeon[] = [];
    if (to.includes("all") || to.includes("others")) {
      if (to.includes("all") || to.includes(from)) {
        targetPigeons.push(...clientsInTargetAddress);
      } else if (to.includes("others")) {
        targetPigeons.push(
          ...clientsInTargetAddress.filter((client) => client.id !== from),
        );
      }
    } else {
      targetPigeons.push(
        ...clientsInTargetAddress.filter((client) => to.includes(client.id)),
      );
    }

    return targetPigeons.reduce<Pigeon[]>(
      (previousClients, targetClient) => {
        const isUniqueClient = !previousClients
          .map((ws) => ws.id)
          .includes(targetClient.id);
        if (isUniqueClient) previousClients.push(targetClient);
        return previousClients;
      },
      [],
    );
  }

  #ping() {
    this.sendMsg({
      to: ["all"],
      address: "all",
      type: "ping",
      body: "",
      from: "host",
    });
  }

  #pong(to: string[]) {
    this.sendMsg({
      to,
      type: "pong",
      address: "all",
      body: "",
      from: "host",
    });
  }
}
