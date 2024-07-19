import { MsgFromServer, WsClient } from "./types.ts";

type PigeonRoomOptions = {
  port?: number;
  wsPath?: string;
};

export class PigeonRoom {
  public options: PigeonRoomOptions;
  public httpHandler: (req: Request) => Promise<Response> | Response =
    this.defaultHttpHandler;
  private wsClients: WsClient[];

  constructor(options?: PigeonRoomOptions) {
    this.options = options || {
      port: 443,
      wsPath: "./pigeon",
    };
    this.wsClients = [];

    setInterval(() => {
      if (this.wsClients.length) this.ping();
    }, 30000);
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
          // TODO: addressが任意なので、?address=allで接続されると困るのをどうにかする。
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

  private defaultHttpHandler(_request: Request): Response {
    const headers = new Headers();
    headers.set("Content-Type", "text/plain");
    headers.set("Charset", "UTF-8");
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(
      "welcome to pigeon room",
      {
        status: 200,
        headers,
      },
    );
  }
}
