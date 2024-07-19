# Pigeon room 🕊️

🕊️ _pigeons are flying around the tower_

DEMO (wss) -> wss://pigeon-room.deno.dev/pigeon/?address=demo
DEMO (https) -> <https://pigeon-room.deno.dev/>

## 接続

`ws(s)://${hostname}/pigeon/?address=${address}`という形式のURLで接続する。`${address}`は任意の文字列を指定し、同じ`${address}`に別のクライアントが接続することで、クライアント同士はクライアントのIDや全員を指定してリアルタイムに通信ができる。

```JavaScript
const hostname = "hostname";
const address = "pipopi";
// connecting use wss protocol
const ws = new WebSocket(`wss://${hostname}/pigeon/?address=${address}`);
// or connecting by ws protocol
// const ws = new WebSocket(`ws://${hostname}/pigeon/?address=${address}`)
```

## 受信メッセージ

サーバーからは以下の形式のJSON文字列が送信されます。

TypeScriptで書いた場合:

```TypeScript
type msg = {
  readonly type:
    | "ping"
    | "pong"
    | "message"
    | "clientOpen"
    | "clientClose"
    | "init";
  readonly address: string;
  readonly from: string | "host";
  readonly to: ("all" | "others" | string)[];
  readonly body: any;
  readonly timestamp: number;
};
```

### `type: "ping" | "pong" | "message" | "clientOpen" | "clientClose" | "init"`

サーバーからは6種類のタイプのJSON文字列が送信されます。

#### `type: "init"`

websocketの接続に成功した時、以下の形式でサーバーからメッセージが届きます。

```JSONC
{
  "type": "init",
  "address": "pipopo",
  "from": "host",
  "to": ["id-0"],
  "body": {
    "id": "id-0", // my ID assigned by the websocket server
    "clients": ["id-0", "id-1", "id-3"] // the connecting clients' Id includes my ID
  },
  "timestamp": 1690352186179
}
```

#### `type: "ping"` / `type: "pong"`

サーバーは接続中のクライアントがいる場合、30秒おきに以下の形式でpingメッセージを送信します。
`"ping"`タイプのメッセージを受け取ったら`"pong"`タイプのメッセージの`"from"`に対してできる限りすぐに送信元に送信してください（後述）

```JSONC
{
  "type": "ping",
  "address": "pipopo",
  "from": "host",
  "to": ["all"],
  "body": "",
  "timestamp": 1690352186179
}
```

#### `type: "message"`

bodyの形式に決まりがない通常のメッセージ

#### `type: "clientOpen"`

新しいクライアントがサーバーに接続したとき、以下の形式でサーバーからメッセージが届きます。

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

#### `type: "clientClose"`

新しいクライアントがサーバーから切断したとき、サーバーは以下の形式でメッセージを接続中のクライアントに送信します。

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
  "timestamp": 1690343693291
}
```

### `to: ( string | "all" )[]`

メッセージの送信先のID、または、すべてのクライアントを示す`"all"`の配列です。
toの値が`"all"`を含む場合、他の接続中のクライアント全員に同じメッセージが送信されています。

### `body: any`

メッセージの内容です。

### `timestamp: number`

サーバーがメッセージを送信した日時。「ECMAScript 元期からの経過ミリ秒数」。

### `from: string | "host"`

メッセージの作成・送信元。
他のクライアントのIDか、サーバーが作成したメッセージを示す`"host"`

## 送信メッセージ

メッセージを送信する際はこの形式を使用し、JSON文字列をwebsocketのsend関数などで送信してください。

```TypeScript
type msg = {
  type: "ping" | "pong" | "message" | string;
  to: (string | "all" | "host")[];
  body: any;
};
```

例

```JavaScript
const message = {
  type: "message",
  to: ["id-3", "id-0"],
  body: {
    birds: ["crow", "goose", "hawk"],
  },
};
const stringMsg = JSON.stringify(message);

ws.send(stringMsg);
```

サーバーはメッセージタイプがmessageであるメッセージに以下の3つの情報をつけてtoへ送信します。

- `from`
  - サーバーはクライアントから受信したメッセージに、その送信元のIDをfromに付け加えます。
- `timestamp`
  - サーバーはクライアントから受信したメッセージに、メッセージをtoに送信する時の時刻をtimestampに付け加えます。
- `address`
  - サーバーはクライアントから受信したメッセージに、その送信元のアドレスをfromに付け加えます。

### `type: "ping" | "pong" | "message" | string,`

サーバーへは3種類のタイプと3種類のタイプ以外のタイプのJSON文字列を送信できます。

#### `type: "ping"` / `type: "pong"`

`"ping"`タイプのメッセージを受け取ったら`"pong"`タイプのメッセージの`"from"`に対して以下の形式のオブジェクトをJSON文字列にしてできる限りすぐに送信する必要があります。

```JSONC
{
  "to": "host", // received ping type message's 'to'
  "type": "pong",
  "body": ""
}
```

```JavaScript
// When the ping is received, the recipient must send back a pong as soon as possible.
ws.addEventListener("message", (e) => {
  const { type, from } = JSON.parse(e.data);
  if (type == "ping") {
    ws.send(JSON.stringify({
      to: [...pingTypeMsg.from], // received ping type message's 'to'
      type: "pong",
      body: "",
    }));
  }
});
```

サーバーにクライアントから`"ping"`タイプのメッセージを送ると`"pong"`タイプのメッセージが返ってきます。
また、サーバーは`"body"`の内容を無視します。

```JavaScript
ws.send(JSON.stringify({
  to: ["host"], // host is websocket server
  type: "ping",
  body: "", // server ignores body contents
}));
```

#### `type: "message"`

bodyの形式に決まりがない通常のメッセージ

#### `type: "ping"`, `type: "pong"`, `type: "message"` 以外

typeには任意の文字列を割り当てることができ、実装に応じて自由にタイプを決めることができます。
ただし、サーバーはそのメッセージをtypeの値が`"message"`であるメッセージとして認識して処理します。

### `to: ( string | "all" | "others" | "host" )[]`

メッセージの送信先です。
接続中のクライアントへメッセージを送る場合、メッセージタイプが`"init","clientOpen","clientClose"`であるメッセージの`"body"`オプジェクトの`"clients"`に含まれる0個以上のID (文字列)、または、`"all"`、`"others"`、 `"host"`を配列で指定して送信します。重複するIDに対しては1回の送信につき1通のメッセージが送信されます。（n個の同じIDやパラメータを指定してもn通送られるわけではない。）

IDの配列を指定した場合、それぞれのIDへメッセージを送信します。IDが重複していた場合、クライアントには1通のメッセージのみが送信されます。

```JSONC
// example
{
  // ...
  "to": ["id_01", "id_03", "id_01"]
  // ...
}
```

`"all"`を含む配列を指定した場合、同じ`address`で接続中の送信元を含む全クライアントへメッセージを送信します。
配列内に`"all"`の他、IDや`"others"`などが含まれる場合、クライアントには1通のメッセージのみが送信されます。

```JSONC
// example
{
  // ...
  "to": ["all"]
  // ...
}
```

`"others"`を含む配列を指定した場合、同じ`address`で接続中の送信元以外のクライアントへメッセージを送信します。
配列内に`"others"`の他、`"all"`が含まれる場合、`"all"`を含む配列を指定したメッセージとして、クライアントには1通のメッセージのみが送信されます。
配列内に`"others"`の他、IDが含まれる場合、クライアントには1通のメッセージのみが送信されます。
配列内に`"others"`の他、自分に割り当てられたIDが含まれる場合、送信元を含む全クライアントへメッセージを送信します。

`to`が`["host"]`である場合、`"ping"`タイプのメッセージであればサーバーから`"pong"`タイプのメッセージが届きます。それ以外では何も起こりません。
`"host"`を含む配列を指定した場合、同じ`address`で接続中の送信元以外のクライアントへメッセージを送信します。

### `body: any`

メッセージの内容です。サーバーでは何もせず、直ちに`body`の内容を`to`へ送信します。
`to`が`["host"]`だった場合、`"ping"`タイプのメッセージであればサーバーから`"pong"`タイプのメッセージが届きます。それ以外では何も起こりません。
文字列だけではなく、オブジェクトや配列などの値も設定可能です。
