# Pigeon room 🕊️

## development

The deno version for this project is managed using [asdf](https://asdf-vm.com/).

To develop this project, please check that the deno runtime is managed via the asdf plugin.

For more information, refer to the [asdf guide](https://asdf-vm.com/guide/getting-started.html) and the [asdf-deno plugin documentation](https://github.com/asdf-community/asdf-deno).

## Related modules

- [@circuitlab/pigeon-link](https://jsr.io/@circuitlab/pigeon-link)
    - helper module for connection pigeon room

## API Guide

### Connection

#### Get Params

Connect with following params.

- `address`
    - `address` specifies a string of one or more characters. By connecting to the same `address`, clients can communicate with each other in real time.
- `staticid`
    - Fix the ID assigned by the server.


### Messages received from the server

Pigeon room host will send messages in the following format.


- **type**: Message type. Predefined values `'message'`, `'ping'`, `'pong'`, `'clientOpen'`, `'clientClose'`, `'init'`, and custom value.
- **to**: Array of recipients ID, `'all'` (everyone) or `'others'` (other than the sender).
- **address**: Connected address.
- **from**: Sender ID or `'host'`.
- **body**: Any valid JSON value.
- **timestamp**: Time of sending. Unix milliseconds.  

#### `type`s

##### `'init'`

Pigeon room host will send when first time after success to connect pigeon room.

```JSONC
{
  "type": "init",
  "address": "pipopo",
  "from": "host",
  "to": ["id-0"],
  "body": {
    "id": "id-0", // your ID assigned by the websocket server,
    "clients": ["id-0", "id-1", "id-3"], // the connecting clients' IDs in same address
  },
  "timestamp": 1690352186179
}
```

##### `'ping'` / `'pong'`

Pigeon room host will send ping message every 30 seconds.

If receive `'ping'` type message, send `'pong'` type message to sender soon.

##### `'message'`

Defalut type of messege.

##### `'clientOpen'`

Notification of join new other pigeon to same address.

```JSONC
  {
    "type": "clientOpen",
    "address": "pipopi",
    "from": "host",
    "to": ["id-0", "id-1", "id-3"],
    "body": {
      "id": "id-2", // new client's ID
      "clients": ["id-0", "id-1", "id-2", "id-3"] // the connecting clients' Id includes my ID and new client's ID
    },
    "timestamp": 1690343693291
  }
```

##### `'clientClose'`

Notification of leave other pigeon to same address.

```JSONC
{
  "type": "clientClose",
  "address": "pipopi",
  "from": "host",
  "to": ["id-0", "id-1"],
  "body": {
    "id": "id-2", // disconnected client's ID
    "clients": ["id-0", "id-1", "id-3"] // the connecting clients' Id includes my ID
  },
  "timestamp": 1690343693291,
}
```

### message format for send

JSON string. Must contain the following properties and be correctly parsed.

- **type**: Message type. Predefined values `'message'`, `'ping'`, `'pong'` and custom value.
- **to**: Array of recipients ID, `'all'` (everyone) or `'others'` (other than the sender).
- **body**: Any valid JSON value.

Example:

```JavaScript
const message = {
  type: 'message',
  to: ['id-3', 'id-0'],
  body: {
    birds: ['crow', 'goose', 'hawk'],
  }
}
const stringMsg = JSON.stringify(message)

ws.send(stringMsg)
```

