import { Msg, msgFromServer } from "../lib/util.ts";
import { Pigeon } from "./Pigeon.ts";

export class PigeonRoom {
  public pigeons: Pigeon[];
  public listenOptions: Deno.ListenOptions;

  constructor() {
    this.pigeons = [];
    this.listenOptions = {
      port: 3000,
    };

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

  public start(entryPoint?: string) {
    Deno.serve(this.listenOptions, (req: Request) => {
      const url = new URL(req.url);
      entryPoint = encodeURIComponent(entryPoint || "pigeon");
      if (url.pathname.startsWith(`/${entryPoint}`)) {
        const address = url.searchParams.get("address");
        const id =
          url.searchParams.get("initas") || url.searchParams.get("staticid");
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
      } else {
        return new Response("Not Found", {
          status: 404,
        });
      }
    });
  }

  public addPigeon(pigeon: Pigeon) {
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
      let parsed: unknown;

      try {
        parsed = JSON.parse(event.data);
      } catch (e) {
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

  public sendMsg(msg: msgFromServer) {
    const { address, from, to } = msg;
    let targetPigeons: Pigeon[] = [];
    try {
      const msgBody = JSON.stringify({
        ...msg,
        timestamp: new Date().getTime(),
      });
      const clientsInTargetAddress: Pigeon[] = this.pigeons.filter((socket) => {
        // TODO: to: [`${id}@${address}`]などで送信できるようにする
        // TODO: addressが任意なので、?address=allで接続されると困るのをどうにかする。
        return socket.address === address || address === "all";
      });

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

      targetPigeons = targetPigeons.reduce(
        (previousClients: Pigeon[], targetClient: Pigeon) => {
          const isUniqueClient = !previousClients
            .map((ws) => ws.id)
            .includes(targetClient.id);
          if (isUniqueClient) previousClients.push(targetClient);
          return previousClients;
        },
        [],
      );
      targetPigeons.forEach((socket) => {
        socket.socket.send(msgBody);
      });
    } catch (_) {
      return false;
    }
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
