import { type Msg, type MsgFromServer, WsClient } from "./types.ts";
import { generateRandomString as randomId } from "https://deno.land/x/random_string_generator@v0.0.1/mod.ts";

type PigeonRoomOptions = {
  pingInterval: number;
  reservedAddress: string[];
};

export class PigeonRoom {
  public options: PigeonRoomOptions;
  private wsClients: WsClient[];

  constructor(options?: Partial<PigeonRoomOptions>) {
    if (!options) options = {};

    this.options = {
      pingInterval: 30000,
      reservedAddress: ["all"],
      ...options,
    };

    if (!this.options.reservedAddress.includes("all")) {
      this.options.reservedAddress.push("all");
    }

    this.wsClients = [];
    if (this.options.pingInterval > 0) {
      setInterval(() => {
        if (this.wsClients.length) this.ping();
      }, this.options.pingInterval);
    }
  }

  public open(req: Request, address: string | null): Response {
    const { response, socket: client } = Deno.upgradeWebSocket(req);
    if (!address) address = "";

    const id = randomId(8);
    this.wsClients.push({
      client,
      address,
      id,
    });

    client.addEventListener("open", () => {
      if (address === "") {
        client.close(
          1008,
          `Error: An address was not provided. Please specify an address.`,
        );
        return;
      } else if (this.options.reservedAddress.includes(address)) {
        console.log({ client });
        client.close(
          1008,
          `Error: The address '${address}' is a reserved word and cannot be used as an address.`,
        );
        console.log({ client });
        return;
      }
      this.sendMessage(
        {
          type: "init",
          address,
          body: {
            id,
            clients: this.wsClients.map((wc) => wc.id),
          },
          to: [id],
          from: "host",
        },
      );
      this.sendMessage(
        {
          type: "clientOpen",
          address,
          body: {
            id,
            clients: this.wsClients.map((wc) => wc.id),
          },
          to: this.wsClients.filter((wc) => wc.id !== id).map((wc) => wc.id),
          from: "host",
        },
      );
    });

    client.addEventListener("message", (e) => {
      const { body, type } = JSON.parse(e.data) as Msg;
      let { to = [] } = JSON.parse(e.data) as Msg;
      to = [to].flat();
      if (to.every((to) => to === "host")) {
        if (type === "ping") {
          this.pong([id]);
          return;
        }
        if (type === "pong") {
          this.wsClients = [
            ...this.wsClients.filter((c) => {
              return c.id !== id;
            }),
            {
              client,
              address,
              id,
            },
          ];
          return;
        }
      }
      if (!to.every((to) => to === "host")) {
        this.sendMessage(
          {
            type,
            body,
            address,
            to,
            from: id,
          },
        );
      }
      return;
    });

    client.addEventListener("close", (e) => {
      if (e) {
        console.log({ e });
      }
      this.wsClients = [
        ...this.wsClients.filter((c) => {
          return c.id !== id;
        }),
      ];
      this.sendMessage(
        {
          type: "clientClose",
          body: {
            id,
            clients: this.wsClients.map((c) => c.id),
          },
          address,
          to: this.wsClients.filter((wc) => wc.id !== id).map((wc) => wc.id),
          from: "host",
        },
      );
    });

    return response;
  }

  public sendMessage(message: MsgFromServer) {
    const { address, from, to } = message;
    let clientsForSend: WsClient[] = [];
    try {
      const msgBody = JSON.stringify({
        ...message,
        timestamp: new Date().getTime(),
      });
      const clientsInTargetAddress: WsClient[] = this.wsClients.filter(
        (socket) => {
          // TODO: to: [`${id}@${address}`]などで送信できるようにする
          return socket.address === address || address === "all";
        },
      );

      if (to.includes("all") || to.includes("others")) {
        if (to.includes("all") || to.includes(from)) {
          clientsForSend.push(...clientsInTargetAddress);
        } else if (to.includes("others")) {
          clientsForSend.push(
            ...clientsInTargetAddress.filter((client) => client.id !== from),
          );
        }
      } else {
        clientsForSend.push(
          ...clientsInTargetAddress.filter((client) => to.includes(client.id)),
        );
      }

      clientsForSend = clientsForSend.reduce((
        previousClients: WsClient[],
        targetClient: WsClient,
      ) => {
        const isUniqueClient = !(previousClients.map((ws) =>
          ws.id
        ).includes(targetClient.id));
        if (isUniqueClient) previousClients.push(targetClient);
        return previousClients;
      }, []);

      clientsForSend.forEach((socket) => {
        socket.client.send(msgBody);
      });
    } catch (_) {
      return false;
    }
  }

  private ping() {
    this.sendMessage({
      to: ["all"],
      address: "all",
      type: "ping",
      body: "",
      from: "host",
    });
  }

  private pong(to: string[]) {
    this.sendMessage({
      to,
      type: "pong",
      address: "all",
      body: "",
      from: "host",
    });
  }
}
