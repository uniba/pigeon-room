export type ClientId = string;
export type Address = string;

export type Msg = {
  type: "ping" | "pong" | "message" | "clientOpen" | "clientClose" | "init";
  body: any;
  address: Address | "all";
  to: ("all" | "others" | ClientId)[];
  from?: ClientId | "host";
};

export type MsgFromServer = Pick<Msg, "type" | "body" | "address" | "to"> & {
  from: ClientId | "host";
};

export type WsClient = {
  client: WebSocket;
  address: Address;
  id: ClientId;
};
