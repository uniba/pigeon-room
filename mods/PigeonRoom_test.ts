import { PigeonRoom } from "./PigeonRoom.ts";

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

// A pigeon joins `room.pigeons` at upgrade time, so it is a delivery target
// while its socket is still CONNECTING — and `send()` on a non-OPEN socket
// throws. Delivery must skip such a peer rather than fail the whole fan-out.
Deno.test({
  name: "sendMsg skips a target whose socket is not OPEN",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { room, url, shutdown } = serveRoom();

    const a = connect(url, "room-1", "peer-a");
    await awaitType(a, "init");

    // peer-b is registered on upgrade but its socket has not opened yet.
    const b = connect(url, "room-1", "peer-b");
    while (room.pigeons.length < 2) await new Promise((r) => setTimeout(r, 1));

    // Before the fix this threw `'readyState' not OPEN`, aborting delivery to
    // every peer after the CONNECTING one.
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
    b.close();
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
