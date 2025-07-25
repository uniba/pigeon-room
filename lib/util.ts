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
