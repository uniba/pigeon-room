const { protocol, hostname } = window.location

type msg = {
  type: 'ping' | 'pong' | 'message' | 'newClientComing' | 'init',
  body: any,
  to: string[] | 'host' | 'all',
}

class superWS extends WebSocket {
  sendMsg = (
    _msg: msg,
  ) => {
    const msg = _msg as msg & { timestamp: Date }
    try {
      const msgString = JSON.stringify(msg)
      this.send(msgString)
      writeTransLog({
        ...msg,
        timestamp: new Date().getTime()
      })
    } catch (_) {
      return false
    }
  }

  ping = (to: string[] | 'host' | 'all') => {
    this.sendMsg({
      to,
      type: 'ping',
      body: ''
    })
  }
  pong = (to: string[] | 'host' | 'all') => {
    this.sendMsg({
      to,
      type: 'pong',
      body: ''
    })
  }

}

const wsUrl =
  protocol === 'https:'
    ? `wss://${hostname}:3000/ws/`
    : protocol === 'http:'
      ? `ws://${hostname}:3000/ws/`
      : null
if (wsUrl === null) {
  throw new Error(`unknown protocol: "${protocol}"`)
}
const ws = new superWS(wsUrl)

let id: string
let othersids: string[]
ws.addEventListener('open', (e) => {
  console.log({open: e})
})

addEventListener('load', () => {
  if (document) {
    document.querySelector('#sndPipo')?.addEventListener('click', () => {
      ws.sendMsg({
        to: 'all',
        body: 'pipo',
        type: 'message'
      })
    })
    document.querySelector('#sndMsg')?.addEventListener('click', () => {
      const { value: to } = document.querySelector('#to_selector') as HTMLSelectElement
      const msgBodyInput = document.querySelector('#msgBodyInput') as HTMLInputElement
      const { value: body } = msgBodyInput
      ws.sendMsg({
        to: to == 'all' ? to : [to],
        body,
        type: 'message'
      })
      msgBodyInput.value = ''
    })
    document.querySelector('#ping_to_server')?.addEventListener('click', () => {
      ws.ping('host')
    })
    ws.addEventListener('message', (e) => {
      const receivedMsg = JSON.parse(e.data) as msg & { timestamp: number, from: string }
      console.log(receivedMsg)
      writeReceiveLog(receivedMsg)
      const { to = undefined, body, type, from = undefined, timestamp } = receivedMsg
      console.log({
        from,
        type
      })
      if (type == 'ping') {
        if (from === undefined) ws.pong('all')
        if (from === 'host') ws.pong('host')
        document.querySelector('#flash')?.classList.add('ping')
        setTimeout(() => {
          document.querySelector('#flash')?.classList.remove('ping')
        }, 1000)  
      }
      if (type == 'pong') {
        document.querySelector('#flash')?.classList.add('pong')
        setTimeout(() => {
          document.querySelector('#flash')?.classList.remove('pong')
        }, 500)
      }
      let msg
      const myIdElem = document.querySelector('p#myid') as HTMLElement
      const othersElem = document.querySelector('p#others') as HTMLElement
      try {
        msg = JSON.parse(e.data) as msg
        const { type } = msg
        if (type == 'init' || type == 'newClientComing') {
          if (type == 'init') {
            id = msg.body.id
            othersids = (msg.body.others as string[]).filter(otherId => otherId !== id)
            myIdElem.innerText = `my id: ${id}`
          }
          if (type == 'newClientComing') {
            othersids = (msg.body.others as string[]).filter(otherId => otherId !== id)
          }
          const selectElement = document.querySelector('select') as HTMLElement
          const otherIdOptions = othersids.map((id: string) => `<option value=${id}>${id}</option>`)
          selectElement.innerHTML = `<option value=all>all</option>${otherIdOptions.join('')}`
          othersElem.innerText = `others ids: ${JSON.stringify(othersids)}`
        }
      } catch (error) {
        console.log(e)
      }
      
      // const li = document.createElement('li')
      // const msgBody = document.createElement('p')
      // msgBody.innerText = e.data
      // document.querySelector('#msgs')
    })
  }
})

const writeTransLog = (
  targetMsg: msg & { timestamp: number }
) => {
  const { to = undefined, body, type, timestamp } = targetMsg
  const bodyString = JSON.stringify(body)
  console.log(JSON.stringify(body))
  const msgLi = document.createElement('li')
  msgLi.innerHTML = `<div>
    <div>
      <span> ${to} &lt;&lt;&lt; ${id}</span>
      <span>${type}</span>
      <span>${timestamp}</span>
    </div>
    <span class="${bodyString == "\"\"" && 'empty'}">${bodyString == "\"\"" ? 'this message has no body' : bodyString }</span>
  </div>`
  document.querySelector('#msgs')?.append(msgLi)
}

const writeReceiveLog = (
  targetMsg: msg & { timestamp: number, from: string }
) => {
  const { to = undefined, body, type, from = undefined, timestamp } = targetMsg
  const bodyString = JSON.stringify(body)
  const msgLi = document.createElement('li')
      msgLi.innerHTML = `<div>
        <div>
          <span>${from} &gt;&gt;&gt; ${to}</span>
          <span>${type}</span>
          <span>${timestamp}</span>
        </div>
        <span class="${bodyString == "\"\"" && 'empty'}">${bodyString == "\"\"" ? 'this message has no body' : bodyString }</span>
      </div>`
      document.querySelector('#msgs')?.append(msgLi)
}

// const sndmsg = () => {
//   ws.send(JSON.stringify({msg: 'hello ws'}))
// }

// type msg = {
//   type: string,
//   body: any,
//   to: string[] | 'host' | 'all'
// }



// const ping = (to: string[], ws: superWS) => {
//   console.log('send ping')
//   ws.sendMsg({
//     to,
//     type: 'ping',
//     body: ''
//   })
// }
// const pong = (to: string[], ws: superWS) => {
//   console.log('send pong')
//   ws.sendMsg({
//     to,
//     type: 'pong',
//     body: ''
//   })
// }