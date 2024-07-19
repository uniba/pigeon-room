import {
  serve,
  type ServeInit,
} from "https://deno.land/std@0.190.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.182.0/http/file_server.ts";
import { generateRandomString as randomId } from "https://deno.land/x/random_string_generator@v0.0.1/mod.ts";
import { type msg, type msgFromServer, WsClient } from "./util.ts";
import { load } from "https://deno.land/std@0.194.0/dotenv/mod.ts";
import { transpile } from "https://deno.land/x/emit@0.25.0/mod.ts";

// TODO: アプリケーションが止まると接続中のクライアントが全部飛ぶのでなんとかしたい。
// https://deno.land/api@v1.36.0?s=Deno.Kv を使ってみたい。

let wsClients: WsClient[] = [];

let listenOptions: ServeInit = {};

const init = async () => {
  console.log("hello");
  const env = await load();
  const port = parseInt(env["PORT"]) || 443;
  listenOptions = { port };
  setInterval(() => {
    if (wsClients.length) {
      ping();
    }
  }, 30000);
};
await init();

const wsHandler = (req: Request, address: string): Response => {
  const { response, socket: client } = Deno.upgradeWebSocket(req);
  const id = randomId(8);
  wsClients.push({
    client,
    address,
    id,
  });

  client.addEventListener("open", () => {
    sendMsg(
      {
        type: "init",
        address,
        body: {
          id,
          clients: wsClients.map((wc) => wc.id),
        },
        to: [id],
        from: "host",
      },
    );
    sendMsg(
      {
        type: "clientOpen",
        address,
        body: {
          id,
          clients: wsClients.map((wc) => wc.id),
        },
        to: wsClients.filter((wc) => wc.id !== id).map((wc) => wc.id),
        from: "host",
      },
    );
  });

  client.addEventListener("message", (e) => {
    const { body, type } = JSON.parse(e.data) as msg;
    let { to = [] } = JSON.parse(e.data) as msg;
    to = [to].flat();
    if (to.every((to) => to == "host")) {
      if (type === "ping") {
        pong([id]);
        return;
      }
      if (type === "pong") {
        wsClients = [
          ...wsClients.filter((c) => {
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
    if (!to.every((to) => to == "host")) {
      sendMsg(
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
  client.addEventListener("close", () => {
    wsClients = [
      ...wsClients.filter((c) => {
        return c.id !== id;
      }),
    ];
    sendMsg(
      {
        type: "clientClose",
        body: {
          id,
          clients: wsClients.map((c) => c.id),
        },
        address,
        to: wsClients.filter((wc) => wc.id !== id).map((wc) => wc.id),
        from: "host",
      },
    );
  });

  return response;
};

const sendMsg = (
  msg: msgFromServer,
) => {
  const { address, from, to } = msg;
  let clientsForSend: WsClient[] = [];
  try {
    const msgBody = JSON.stringify({
      ...msg,
      timestamp: new Date().getTime(),
    });
    const clientsInTargetAddress: WsClient[] = wsClients.filter((socket) => {
      // TODO: to: [`${id}@${address}`]などで送信できるようにする
      // TODO: addressが任意なので、?address=allで接続されると困るのをどうにかする。
      return socket.address === address || address === "all";
    });

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
};

const ping = () => {
  sendMsg({
    to: ["all"],
    address: "all",
    type: "ping",
    body: "",
    from: "host",
  });
};

const pong = (to: string[]) => {
  sendMsg({
    to,
    type: "pong",
    address: "all",
    body: "",
    from: "host",
  });
};

serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/pigeon")) {
    const address = url.searchParams.get("address");
    if (address) {
      return wsHandler(req, address);
    } else {
      const { response, socket } = Deno.upgradeWebSocket(req);
      socket.close(1001, "websocket path did not have address");
      return response;
    }
  } else {
    return await httpHandler(req);
  }
}, listenOptions);

const httpHandler = async (request: Request): Promise<Response> => {
  const topPage = new URLPattern({ pathname: "/" });
  const topPageMatch = topPage.exec(request.url);

  const { pathname } = new URL(request.url);

  if (pathname.startsWith("/static")) {
    if (pathname.match("/static/index.js")) {
      const url = new URL("./static/index.ts", import.meta.url);
      const result = await transpile(url, {
        cacheRoot: "/",
      });
      const headers = new Headers();
      headers.set("Content-Type", "application/javascript");
      headers.set("Charset", "UTF-8");
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(
        result.get(url.href),
        {
          status: 200,
          headers,
        },
      );
    }
    return await serveDir(request, {
      fsRoot: "static",
      urlRoot: "static",
      enableCors: true,
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Charset", "UTF-8");
  headers.set("Access-Control-Allow-Origin", "*");

  if (topPageMatch) {
    headers.set("Content-Type", "text/html");
    const htmlFile = await Deno.readFile("./static/index.html");
    const decoder = new TextDecoder();
    return new Response(
      decoder.decode(htmlFile),
      {
        status: 200,
        headers,
      },
    );
  }
  return new Response(
    JSON.stringify("not found"),
    {
      status: 404,
      headers,
    },
  );
};