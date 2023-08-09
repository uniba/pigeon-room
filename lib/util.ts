
export class superWS extends WebSocket {

  constructor(ws: WebSocket) {
    console.log(ws.url)
    super(ws.url);
  }

  sendMsg = (
    msg: msgFromServer,
  ) => {
    const { to, body, type } = msg
    try {
      const msgBody = JSON.stringify(msg)
      this.send(msgBody)
      console.log(msgBody)
    } catch (_) { 
      return false
    }
  }
}

export type clientId = string
export type address = string

export type msg = {
  type: 'ping' | 'pong' | 'message' | 'clientOpen' | 'clientClose' | 'init',
  body: any,
  address: address | 'all',
  to: ( 'all' | 'others' | clientId )[],
  from?: clientId | 'host'
}

export type msgFromServer = Pick< msg, 'type' | 'body' | 'address' | 'to' > & {
  from: clientId | 'host'
}

export type WsClient = {
  client: WebSocket,
  address: address
  id: clientId
}