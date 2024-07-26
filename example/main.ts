import { PigeonRoom } from "../main_.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const pigeonRoom = new PigeonRoom({});

Deno.serve({ port: 3000 }, async (request) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/pigeon")) {
    const address = url.searchParams.get("address");
    return pigeonRoom.open(request, address);
  } else {
    return await serveDir(request, { quiet: true });
  }
});
