import { PigeonRoom } from "./mods/PigeonRoom.ts";

const init = () => {
  const pR = new PigeonRoom();
  const port = parseInt(Deno.env.get("PORT") || "3001");
  const listenOptions = { port };

  pR.listenOptions = listenOptions;
  pR.start();
};

init();
