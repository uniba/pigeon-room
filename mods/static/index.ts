/// <reference lib="dom" />

const { protocol, hostname, port, search } = window.location
type msg = {
  type: 'ping' | 'pong' | 'message' | 'clientOpen' | 'clientClose' | 'init',
  body: any,
  to: ( string | 'host' | 'all' | 'others' )[],
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

  ping = (to:( string | 'host' | 'all' | 'others' )[]) => {
    this.sendMsg({
      to,
      type: 'ping',
      body: ''
    })
  }
  pong = (to:( string | 'host' | 'all' | 'others' )[]) => {
    this.sendMsg({
      to,
      type: 'pong',
      body: ''
    })
  }

}

const params = new URLSearchParams(search);
const address = params.get("address");

const wsUrl =
  protocol === 'https:'
    ? `wss://${hostname}:${port}/pigeon/?address=${address}`
    // ? `wss://${hostname}:3000/ws/`
    : protocol === 'http:'
      ? `ws://${hostname}:${port}/pigeon/?address=${address}`
      // ? `ws://${hostname}:3000/ws/`
      : null
if (wsUrl === null) {
  throw new Error(`unknown protocol: "${protocol}"`)
}

let id: string
let othersids: string[]

addEventListener('load', () => {
  const ws = new superWS(wsUrl)
  ws.addEventListener('open', (e) => {
    console.log({open: e})
  })
  ws.addEventListener('close', (e) => {
    console.log({close: e})
  })
  if (document) {
    document.querySelector('#sndPipo')?.addEventListener('click', () => {
      ws.sendMsg({
        to: ['all'],
        body: 'pipo',
        type: 'message'
      })
    })
    document.querySelector('#clear')?.addEventListener('click', () => {
      const msgList = document.querySelector('#msgs') as HTMLElement
      if (msgList) {
        const msgListClone = msgList.cloneNode(false)
        msgList.parentNode?.replaceChild( msgListClone , msgList )
      }
    })
    document.querySelector('#sndMsg')?.addEventListener('click', () => {
      const inputs = document.querySelectorAll('#to_selector > li > input[name="to"]') as NodeListOf<HTMLInputElement>
      const to = Array.from(inputs).reduce((prev: string[], inputElement: HTMLInputElement) => {
        if (inputElement.checked) {
          prev.push(inputElement.value)
        }
        return prev
      }, [])
      const msgTypeInput = document.querySelector('#msgTypeInput') as HTMLInputElement
      const { value: msgType } = msgTypeInput 
      const msgBodyInput = document.querySelector('#msgBodyInput') as HTMLInputElement
      const { value: body } = msgBodyInput
      ws.sendMsg({
        to: [to].flat(),
        body,
        type: msgType || 'message'
      })
      msgTypeInput.value = 'message'
      msgBodyInput.value = ''
    })
    document.querySelector('#ping_to_host')?.addEventListener('click', () => {
      ws.ping(['host'])
    })
    document.querySelector('#ping_to_others')?.addEventListener('click', () => {
      ws.ping(['others'])
    })
    ws.addEventListener('message', (e) => {
      console.log(e)
      const receivedMsg = JSON.parse(e.data) as msg & { timestamp: number, from: string }
      writeReceiveLog(receivedMsg)
      const { to = undefined, body, type, from = undefined, timestamp } = receivedMsg
      if (type == 'ping') {
        if (from === undefined) ws.pong(['all'])
        else if (from === 'host') ws.pong(['host'])
        else ws.pong([from])
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
      const addressElem = document.querySelector('p#address') as HTMLElement
      const myIdElem = document.querySelector('p#myid') as HTMLElement
      const othersElem = document.querySelector('p#othersid') as HTMLElement
      addressElem.innerText = `address: ${address}`;
      try {
        msg = JSON.parse(e.data) as msg
        const { type } = msg
        console.log(type)
        if (
          type == 'init' ||
          type == 'clientOpen' ||
          type == 'clientClose'
        ) {
          if (type == 'init') {
            id = msg.body.id
            myIdElem.innerText = `my id: ${id}`
            const titleElement = document.querySelector('title') as HTMLElement
            if (titleElement) {
              titleElement.innerText = `${id} | ${titleElement.innerText}`
            }
          }
          othersids = (msg.body.clients as string[]).filter(otherId => otherId !== id)
          const selectElement = document.querySelector('ul#to_selector') as HTMLElement
          selectElement.innerHTML = ''
          Array.from(['all', 'others', id, ...othersids]).forEach(targetId => {
            const optionElement = document.createElement('li')
            const inputElement = document.createElement('input')
            inputElement.innerText = targetId
            inputElement.setAttribute('type', 'checkbox')
            inputElement.setAttribute('value', targetId)
            inputElement.setAttribute('id', `selection_${targetId}`)
            inputElement.setAttribute('name', 'to')
            const labelElement = document.createElement('label')
            labelElement.setAttribute('for', `selection_${targetId}`)
            labelElement.innerHTML = targetId == id ? 'me' : targetId
            optionElement.append(inputElement, labelElement)
            selectElement.append(optionElement)
          })
          othersElem.innerText = `others ids: ${JSON.stringify(othersids)}`
        }
      } catch (error) {
        console.log(e)
      }
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
  msgLi.innerHTML = `<div class="message_type ${type} trans">
    <header>
      <span>▲ ${to} &lt;&lt;&lt; ${id}</span>
      <span>${type} @ ${timestamp}</span>
    </header>
    <p class="message_body ${bodyString == "\"\"" && 'empty'}">
      ${bodyString == "\"\"" ? 'this message has no body' : bodyString }
    </p>
  </div>`
  document.querySelector('#msgs')?.append(msgLi)
  msgLi.scrollIntoView();
}

const writeReceiveLog = (
  targetMsg: msg & { timestamp: number, from: string }
) => {
  const { to = undefined, body, type, from = undefined, timestamp } = targetMsg
  const bodyString = JSON.stringify(body)
  const msgLi = document.createElement('li')
  msgLi.innerHTML = `<div class="message_type ${type} receive">
    <header>
      <span>▼ ${from} &gt;&gt;&gt; ${to}</span>
      <span>${type} @ ${timestamp}</span>
    </header>
    <p class="message_body ${bodyString == "\"\"" && 'empty'}">
      ${bodyString == "\"\"" ? 'this message has no body' : bodyString }
    </p>
  </div>`
  document.querySelector('#msgs')?.append(msgLi)
  msgLi.scrollIntoView();
}