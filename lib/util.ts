export type ClientId = string;
export type Address = string;

export type Msg<T = string> = {
  type: "ping" | "pong" | "message" | "clientOpen" | "clientClose" | "init" | T;
  body: unknown;
  address: Address | "all";
  to: ("all" | "others" | ClientId)[];
  from?: ClientId | "host";
};

export type msgFromServer = Pick<Msg, "type" | "body" | "address" | "to"> & {
  from: ClientId | "host";
};
