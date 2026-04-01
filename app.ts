import { PigeonRoom } from "./mods/PigeonRoom.ts";

const init = () => {
  const pR = new PigeonRoom();
  const port = parseInt(Deno.env.get("PORT") || "3001");
  const listenOptions = { port };

  let entryPoint = "pigeon";

  Deno.serve(listenOptions, (req: Request) => {
    const url = new URL(req.url);
    entryPoint = encodeURIComponent(entryPoint);
    if (url.pathname.startsWith(`/${entryPoint}`)) {
      return pR.handleReqest(req);
    } else {
      return new Response("Not Found", {
        status: 404,
      });
    }
  });
};

init();
