import { serve, type ServeInit } from 'https://deno.land/std@0.190.0/http/server.ts'
import { serveDir } from 'https://deno.land/std@0.182.0/http/file_server.ts'
import { v4 as uuidV4 } from 'https://deno.land/std@0.95.0/uuid/mod.ts'
import { type msg, type msgFromServer, superWS } from './lib/util.ts'
import { load } from 'https://deno.land/std@0.194.0/dotenv/mod.ts'

let wsClients: {
  client: WebSocket,
  id: string
}[] = []

let listenOptions: ServeInit = {}

const init = async () => {
  console.log('hello')
  const env = await load();
  const port = parseInt(env['PORT']) || 443
  listenOptions = { port }
  setInterval(() => {
    if (wsClients.length) {
      ping()
    }
  }, 10000)
}
await init()

const wsHandler = (req: Request): Response => {
  const { response, socket: client } = Deno.upgradeWebSocket(req)
  const id = uuidV4.generate().slice(0, 8)
  wsClients.push({
    client,
    id
  })

  client.addEventListener('open', () => {
    sendMsg(
      {
        type: 'init',
        body: {
          id,
          others: wsClients.map(c=>c.id)
        },
        to: [id],
        from: 'host'
      }
    )
    sendMsg(
      {
        type: 'newClientComing',
        body: {
          id,
          others: wsClients.map(c=>c.id)
        },
        to: [...wsClients.filter(wc => wc.id !== id).map(wc => wc.id)],
        from: 'host'
      },
    )
  })

  client.addEventListener('message', e => {
    const { to = undefined, body, type } = JSON.parse(e.data) as msg
    console.log(`${id}からmsgきた`)
    if (type === "ping") {
      pong([id])
      return
    }
    if (type === "pong") {
      wsClients = [
        ...wsClients.filter(c => {
          return c.id !== id
        }),
        {
          client,
          id
        }
      ]
      return
    }
    if (to) {
      console.log({to})
      sendMsg(
        {
          type: 'message',
          body,
          to,
          from: id
        }
      )
      return
    }
    sendMsg(
      {
        type: 'message',
        body,
        to: 'all',
        from: id
      }
    )
  })
  client.addEventListener('close', () => {
    wsClients = [
      ...wsClients.filter(c => {
        return c.id !== id
      })
    ]
    sendMsg(
      {
        type: 'newClientComing',
        body: {
          id,
          others: wsClients.map(c=>c.id)
        },
        to: [...wsClients.filter(wc => wc.id !== id).map(wc => wc.id)],
        from: 'host'
      },
    )
  })
  
  return response
}

const sendMsg = (
  msg: msgFromServer,
) => {
  const { to, body, type } = msg
  try {
    const msgBody = JSON.stringify({
      ...msg,
      timestamp: new Date().getTime(),
    })
    console.log(msg)
    wsClients.filter(socket => {
      if (to === 'all') {
        return true
      } else {
        return to.includes(socket.id)
      }
    }).forEach(socket => {
      socket.client.send(msgBody)
    })
  } catch (_) {
    return false
  }
}

const ping = () => {
  sendMsg({
    to: 'all',
    type: 'ping',
    body: '',
    from: 'host'
  })
}

const pong = (to: string[]) => {
  console.log(`${to}へpongした。`)
  sendMsg({
    to,
    type: 'pong',
    body: '',
    from: 'host'
  })
}


const httpHandler = async (request: Request): Promise<Response> => {
  const topPage = new URLPattern({ pathname: "/" })
  const topPageMatch = topPage.exec(request.url)

  const { pathname } = new URL(request.url) 

  if (pathname.startsWith("/static")) {
    return await serveDir(request, {
      fsRoot: 'static',
      urlRoot: 'static',
      enableCors: true
    })
  }
  if (pathname.startsWith("/static_use_npm")) {
    return await serveDir(request, {
      fsRoot: 'static_use_npm',
      urlRoot: 'static_use_npm',
      enableCors: true
    })
  }

  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  headers.set('Charset', 'UTF-8')
  headers.set('Access-Control-Allow-Origin', '*')

  if (topPageMatch) {
    headers.set('Content-Type', 'text/html')
    const htmlFile = await Deno.readFile('./index.html');
    const decoder = new TextDecoder()
    return new Response(
      decoder.decode(htmlFile),
      {
        status: 200,
        headers,
      }
    )
  }
  return new Response(
    JSON.stringify('not found'),
    {
      status: 404,
      headers,
    }
  )
}

serve(async (req) => {
  const url = new URL(req.url)
  if (url.pathname === "/ws/") {
    return wsHandler(req)
  } else {
    return await httpHandler(req)
  }
}, listenOptions )