import { PigeonRoom } from "../../mods/PigeonRoom.ts";
import { Context, Hono } from "@hono/hono";
import { serveStatic } from "@hono/hono/deno";

const app = new Hono();
const pigeonRoom = new PigeonRoom();

app.get("/pigeon", (ctx: Context) => {
  return pigeonRoom.handleReqest(ctx.req.raw);
});

app.get("/", async (ctx: Context) => {
  const headers = new Headers();
  headers.set("Charset", "UTF-8");
  headers.set("Content-Type", "text/html");
  const { address } = ctx.req.query();

  if (!address) {
    const htmlFile = await Deno.readFile("./static/enter-console.html");
    const decoder = new TextDecoder();
    return new Response(
      decoder.decode(htmlFile),
      {
        status: 200,
        headers,
      },
    );
  }

  const htmlFile = await Deno.readFile("./static/index.html");
  const decoder = new TextDecoder();
  return new Response(
    decoder.decode(htmlFile),
    {
      status: 200,
      headers,
    },
  );
});

app.get("/*", serveStatic({ root: "./static" }));

const init = () => {
  console.log(Deno.env.get("PORT"));
  const port = parseInt(Deno.env.get("PORT") || "3001");
  const listenOptions = { port };

  Deno.serve(listenOptions, app.fetch);
};

init();
