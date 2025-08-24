import { generateRandomString } from "@akisoqls/random-string";

export class Pigeon {
  public socket: WebSocket;
  public id: string;
  public address: string;
  public response: Response;

  constructor(request: Request, id?: string) {
    const url = new URL(request.url);
    this.address = url.searchParams.get("address") || "";
    if (!this.address) throw new Error("address is null");

    const { socket, response } = Deno.upgradeWebSocket(request);
    this.socket = socket;
    this.response = response;
    this.id = id || generateRandomString(8);
  }

  public res() {
    return this.response;
  }

  public on<K extends keyof WebSocketEventMap>(
    type: K,
    handler: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
  ) {
    this.socket.addEventListener(type, handler);
  }
}
