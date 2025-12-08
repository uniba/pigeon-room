import { type ServeInit } from "https://deno.land/std@0.190.0/http/server.ts";
import { load } from "https://deno.land/std@0.194.0/dotenv/mod.ts";
import { PigeonRoom } from "./mods/PigeonRoom.ts";
import { Pigeon } from "./mods/Pigeon.ts";

let listenOptions: ServeInit = {};
const pigeonRoom = new PigeonRoom();
pigeonRoom.enableConsole();

const init = async () => {
  const certPath = new URL(`./certs/fullchain.pem`, import.meta.url);
  const keyPath = new URL(`./certs/key.pem`, import.meta.url);

  const cert = await Deno.readTextFile(certPath);
  const key = await Deno.readTextFile(keyPath);

  const env = await load();
  const port = parseInt(env["PORT"]) || 3001;
  listenOptions = { port, cert, key };
};
await init();

Deno.serve(listenOptions, async (req) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/pigeon")) {
    const address = url.searchParams.get("address");
    const id =
      url.searchParams.get("initas") || url.searchParams.get("staticid");
    if (address) {
      if (id) {
        const pigeon = new Pigeon(req, id);
        pigeonRoom.addPigeon(pigeon);
        return pigeon.res();
      }
      const pigeon = new Pigeon(req);
      pigeonRoom.addPigeon(pigeon);
      return pigeon.res();
    } else {
      const { response, socket } = Deno.upgradeWebSocket(req);
      socket.close(1001, "websocket path did not have address");
      return response;
    }
  } else {
    return await pigeonRoom.console(req);
  }
});
