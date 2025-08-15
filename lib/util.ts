export type clientId = string;
export type address = string;

export type Msg<T = string> = {
  type: "ping" | "pong" | "message" | "clientOpen" | "clientClose" | "init" | T;
  body: any;
  address: address | "all";
  to: ("all" | "others" | clientId)[];
  from?: clientId | "host";
};

export type msgFromServer = Pick<Msg, "type" | "body" | "address" | "to"> & {
  from: clientId | "host";
};
