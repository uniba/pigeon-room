import { PigeonRoom } from "./PigeonRoom.ts";
import type { Pigeon } from "./Pigeon.ts";

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
