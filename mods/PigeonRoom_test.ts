import { PigeonRoom } from "./PigeonRoom.ts";
import type { Pigeon } from "./Pigeon.ts";
import { parseBinaryFrame } from "../lib/util.ts";

/** Serve a room on an ephemeral port and hand back its ws:// base URL. */
function serveRoom(): {
  room: PigeonRoom;
  url: string;
  shutdown: () => Promise<void>;
} {
  const room = new PigeonRoom();
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    (req) => room.handleReqest(req),
  );
  const { port } = server.addr as Deno.NetAddr;
  return {
    room,
    url: `ws://localhost:${port}/pigeon`,
    shutdown: () => server.shutdown(),
  };
}

function connect(base: string, address: string, id: string): WebSocket {
  const url = new URL(base);
  url.searchParams.set("address", address);
  url.searchParams.set("staticid", id);
  return new WebSocket(url);
}

function awaitType(ws: WebSocket, type: string): Promise<void> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      if ((JSON.parse(ev.data) as { type?: string }).type === type) resolve();
    });
  });
}

/**
 * A stand-in for a peer whose socket cannot receive. Delivery only touches
 * id / address / socket.readyState / socket.send, and `send()` throws exactly
 * like a real non-OPEN socket does.
 */
function stubPigeon(id: string, address: string, readyState: number): Pigeon {
  return {
    id,
    address,
    lastMessageTime: Date.now(),
    socket: {
      readyState,
      send() {
        throw new Error("'readyState' not OPEN");
      },
      close() {},
    },
  } as unknown as Pigeon;
}

// A pigeon joins `room.pigeons` at upgrade time, so it is a delivery target
// while its socket is still CONNECTING — and `send()` on a non-OPEN socket
// throws. Delivery must skip such a peer rather than fail the whole fan-out.
// Undeliverable peers are injected as stubs (a real localhost handshake
// completes too quickly to hold a socket in CONNECTING deterministically) and
// placed BEFORE the live peer, so an aborted fan-out would demonstrably
// silence it.
Deno.test({
  name: "delivery skips non-OPEN sockets and survives a throwing send",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { room, url, shutdown } = serveRoom();

    const a = connect(url, "room-1", "peer-a");
    await awaitType(a, "init");

    // Ahead of peer-a in delivery order: one socket still CONNECTING (must be
    // skipped) and one that reports OPEN but throws on send (a socket can
    // close between the readyState check and the send — must be caught).
    room.pigeons.unshift(
      stubPigeon("peer-connecting", "room-1", WebSocket.CONNECTING),
      stubPigeon("peer-dead", "room-1", WebSocket.OPEN),
    );

    // Before the fix the first stub threw `'readyState' not OPEN`, aborting
    // delivery to every peer after it — peer-a never got the message.
    const delivered = awaitType(a, "custom");
    room.sendMsg({
      ver: 1,
      type: "custom",
      address: "room-1",
      body: "hello",
      to: ["all"],
      from: "host",
    });
    await delivered;

    a.close();
    await shutdown();
  },
});

// The same hazard, as it actually reaches production: every client `open`
// broadcasts `clientOpen` to the other peers of its address. When clients
// connect together, that fan-out targets sockets still in CONNECTING. The
// throw escapes a WebSocket event listener, so it is an uncaught exception
// that takes the whole host process down.
Deno.test({
  name: "simultaneous connects on one address do not kill the host",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { room, url, shutdown } = serveRoom();

    const peers = Array.from(
      { length: 8 },
      (_, i) => connect(url, "room-2", `peer-${i}`),
    );
    await Promise.all(peers.map((ws) => awaitType(ws, "init")));

    if (room.pigeons.length !== 8) {
      throw new Error(`expected 8 pigeons, got ${room.pigeons.length}`);
    }

    for (const ws of peers) ws.close();
    await shutdown();
  },
});

// --- an id held by more than one connection --------------------------------
//
// A client that reconnects under its staticid while the room still holds its
// previous connection, or two clients configured with the same id.

type Received = Record<string, unknown>;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertEquals(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected ${e}\n  actual   ${a}`);
}

/** Collect every text message a socket receives, parsed. */
function collect(ws: WebSocket): Received[] {
  const got: Received[] = [];
  ws.addEventListener("message", (ev) => {
    if (typeof ev.data === "string") got.push(JSON.parse(ev.data));
  });
  return got;
}

/** Collect the header of every binary frame a socket receives. */
function collectBinary(ws: WebSocket): Received[] {
  const got: Received[] = [];
  ws.binaryType = "arraybuffer";
  ws.addEventListener("message", (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      got.push(parseBinaryFrame(ev.data).header as Received);
    }
  });
  return got;
}

async function until(cond: () => boolean, label: string, ms = 3000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const count = (got: Received[], type: string) =>
  got.filter((m) => m.type === type).length;

const settle = () => new Promise((r) => setTimeout(r, 100));

/** Connect under `id`, collecting from the start, and wait for its init. */
async function join(url: string, address: string, id: string) {
  const ws = connect(url, address, id);
  const got = collect(ws);
  const bin = collectBinary(ws);
  await until(() => count(got, "init") > 0, `init for a connection as ${id}`);
  return { ws, got, bin };
}

Deno.test({
  name: "a second connection under an id already held receives its own init",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { url, shutdown } = serveRoom();
    const a = await join(url, "room-dup-1", "dup");
    const b = await join(url, "room-dup-1", "dup");
    await settle();

    const bInit = b.got.find((m) => m.type === "init")!;
    assertEquals(bInit.to, ["dup"], "b's init is addressed to its id");
    assertEquals(
      (bInit.body as { id: string }).id,
      "dup",
      "b's init carries its id",
    );
    assertEquals(count(a.got, "init"), 1, "a receives only its own init");

    a.ws.close();
    b.ws.close();
    await shutdown();
  },
});

Deno.test({
  name: "messages to an id, and broadcasts, reach every connection holding it",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { room, url, shutdown } = serveRoom();
    const a = await join(url, "room-dup-2", "dup");
    const b = await join(url, "room-dup-2", "dup");
    const c = await join(url, "room-dup-2", "other");

    c.ws.send(JSON.stringify({ ver: 1, type: "direct", to: ["dup"], body: 1 }));
    c.ws.send(
      JSON.stringify({ ver: 1, type: "everyone", to: ["all"], body: 2 }),
    );
    room.sendBinary(
      {
        type: "frame",
        to: ["dup"],
        body: 3,
        from: "host",
        address: "room-dup-2",
      },
      new Uint8Array([1, 2, 3]),
    );

    for (const [name, peer] of [["a", a], ["b", b]] as const) {
      await until(() => count(peer.got, "direct") > 0, `${name}: direct`);
      await until(() => count(peer.got, "everyone") > 0, `${name}: broadcast`);
      await until(() => count(peer.bin, "frame") > 0, `${name}: binary`);
    }
    await settle();
    for (const [name, peer] of [["a", a], ["b", b]] as const) {
      assertEquals(count(peer.got, "direct"), 1, `${name}: direct once`);
      assertEquals(count(peer.got, "everyone"), 1, `${name}: broadcast once`);
      assertEquals(count(peer.bin, "frame"), 1, `${name}: binary once`);
    }

    a.ws.close();
    b.ws.close();
    c.ws.close();
    await shutdown();
  },
});

Deno.test({
  name: "a pong goes back to the connection that pinged",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { url, shutdown } = serveRoom();
    const a = await join(url, "room-dup-3", "dup");
    const b = await join(url, "room-dup-3", "dup");

    b.ws.send(JSON.stringify({ ver: 1, type: "ping", to: ["host"], body: "" }));
    await until(() => count(b.got, "pong") > 0, "b's pong");
    await settle();
    assertEquals(count(a.got, "pong"), 0, "a does not receive b's pong");

    a.ws.close();
    b.ws.close();
    await shutdown();
  },
});

Deno.test({
  name: "a second connection under an id already held is logged",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { url, shutdown } = serveRoom();
    const warns: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => void warns.push(args.join(" "));
    try {
      const a = await join(url, "room-dup-4", "dup");
      assertEquals(warns.length, 0, "one connection is not a duplicate");
      const b = connect(url, "room-dup-4", "dup");
      await until(() => warns.length > 0, "a duplicate-id warning");
      assert(
        warns.some((w) => w.includes('"dup"') && w.includes("2 connections")),
        `expected a duplicate-id warning, got ${JSON.stringify(warns)}`,
      );
      a.ws.close();
      b.close();
    } finally {
      console.warn = realWarn;
    }
    await shutdown();
  },
});
