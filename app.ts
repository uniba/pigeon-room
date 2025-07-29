import { type ServeInit } from 'https://deno.land/std@0.190.0/http/server.ts'
import { load } from 'https://deno.land/std@0.194.0/dotenv/mod.ts'
import { PigeonRoom } from "./mods/PigeonRoom.ts";
import { Pigeon } from "./mods/Pigeon.ts";

let listenOptions: ServeInit = {}
const pigeonRoom = new PigeonRoom();
pigeonRoom.enableConsole();

const init = async () => {
  const env = await load()
  const port = parseInt(env['PORT']) || 3001
  listenOptions = { port }
}
await init()

Deno.serve(listenOptions, async (req) => {
  const url = new URL(req.url)
  if (url.pathname.startsWith("/pigeon")) {
    const address = url.searchParams.get('address')
    const e3 = url.searchParams.get('e3init')
    if (address) {
      if(e3 === "true") {
        const pigeon = new Pigeon(req, "e3spot");
        pigeonRoom.addPigeon(pigeon);
        return pigeon.res();
      }
      const pigeon = new Pigeon(req);
      pigeonRoom.addPigeon(pigeon);
      return pigeon.res();
    } else {
      const { response, socket } = Deno.upgradeWebSocket(req)
      socket.close(1001, 'websocket path did not have address')
      return response
    }
  } else {
    return await pigeonRoom.console(req)
  }
})
