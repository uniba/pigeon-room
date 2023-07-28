
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

export type msg = {
  type: 'ping' | 'pong' | 'message' | 'clientOpen' | 'clientClose' | 'init',
  body: any,
  address: string | 'all',
  to: string[] | 'all',
  from?: string | 'host'
}
export type msgFromServer = msg & {
  from: string | 'host'
}