"use strict";
const { protocol, hostname } = window.location;
class superWS extends WebSocket {
    constructor() {
        super(...arguments);
        this.sendMsg = (_msg) => {
            const msg = _msg;
            try {
                const msgString = JSON.stringify(msg);
                this.send(msgString);
                writeTransLog({
                    ...msg,
                    timestamp: new Date().getTime()
                });
            }
            catch (_) {
                return false;
            }
        };
        this.ping = (to) => {
            this.sendMsg({
                to,
                type: 'ping',
                body: ''
            });
        };
        this.pong = (to) => {
            this.sendMsg({
                to,
                type: 'pong',
                body: ''
            });
        };
    }
}
const wsUrl = protocol === 'https:'
    ? `wss://${hostname}/pigeon/pipo?address=demo`
    // ? `wss://${hostname}:3000/ws/`
    : protocol === 'http:'
        ? `ws://${hostname}:3000/pigeon/?address=demo`
        // ? `ws://${hostname}:3000/ws/`
        : null;
if (wsUrl === null) {
    throw new Error(`unknown protocol: "${protocol}"`);
}
let id;
let othersids;
addEventListener('load', () => {
    const ws = new superWS(wsUrl);
    ws.addEventListener('open', (e) => {
        console.log({ open: e });
    });
    if (document) {
        document.querySelector('#sndPipo')?.addEventListener('click', () => {
            ws.sendMsg({
                to: ['all'],
                body: 'pipo',
                type: 'message'
            });
        });
        document.querySelector('#clear')?.addEventListener('click', () => {
            const msgList = document.querySelector('#msgs');
            if (msgList) {
                const msgListClone = msgList.cloneNode(false);
                msgList.parentNode?.replaceChild(msgListClone, msgList);
            }
        });
        document.querySelector('#sndMsg')?.addEventListener('click', () => {
            const inputs = document.querySelectorAll('#to_selector > li > input[name="to"]');
            const to = Array.from(inputs).reduce((prev, inputElement) => {
                if (inputElement.checked) {
                    prev.push(inputElement.value);
                }
                return prev;
            }, []);
            const msgBodyInput = document.querySelector('#msgBodyInput');
            const { value: body } = msgBodyInput;
            ws.sendMsg({
                to: [to].flat(),
                body,
                type: 'message'
            });
            msgBodyInput.value = '';
        });
        document.querySelector('#ping_to_host')?.addEventListener('click', () => {
            ws.ping(['host']);
        });
        document.querySelector('#ping_to_others')?.addEventListener('click', () => {
            ws.ping(['others']);
        });
        ws.addEventListener('message', (e) => {
            const receivedMsg = JSON.parse(e.data);
            writeReceiveLog(receivedMsg);
            const { to = undefined, body, type, from = undefined, timestamp } = receivedMsg;
            if (type == 'ping') {
                if (from === undefined)
                    ws.pong(['all']);
                else if (from === 'host')
                    ws.pong(['host']);
                else
                    ws.pong([from]);
                document.querySelector('#flash')?.classList.add('ping');
                setTimeout(() => {
                    document.querySelector('#flash')?.classList.remove('ping');
                }, 1000);
            }
            if (type == 'pong') {
                document.querySelector('#flash')?.classList.add('pong');
                setTimeout(() => {
                    document.querySelector('#flash')?.classList.remove('pong');
                }, 500);
            }
            let msg;
            const myIdElem = document.querySelector('p#myid');
            const othersElem = document.querySelector('p#othersid');
            try {
                msg = JSON.parse(e.data);
                const { type } = msg;
                console.log(type);
                if (type == 'init' || type == 'clientOpen') {
                    if (type == 'init') {
                        id = msg.body.id;
                        othersids = msg.body.clients.filter(otherId => otherId !== id);
                        myIdElem.innerText = `my id: ${id}`;
                        const titleElement = document.querySelector('title');
                        if (titleElement) {
                            titleElement.innerText = `${id} | ${titleElement.innerText}`;
                        }
                    }
                    if (type == 'clientOpen') {
                        othersids = msg.body.clients.filter(otherId => otherId !== id);
                    }
                    const selectElement = document.querySelector('ul#to_selector');
                    selectElement.innerHTML = '';
                    Array.from(['all', 'others', id, ...othersids]).forEach(targetId => {
                        const optionElement = document.createElement('li');
                        const inputElement = document.createElement('input');
                        inputElement.innerText = targetId;
                        inputElement.setAttribute('type', 'checkbox');
                        inputElement.setAttribute('value', targetId);
                        inputElement.setAttribute('id', `selection_${targetId}`);
                        inputElement.setAttribute('name', 'to');
                        const labelElement = document.createElement('label');
                        labelElement.setAttribute('for', `selection_${targetId}`);
                        labelElement.innerHTML = targetId == id ? 'me' : targetId;
                        optionElement.append(inputElement, labelElement);
                        selectElement.append(optionElement);
                    });
                    othersElem.innerText = `others ids: ${JSON.stringify(othersids)}`;
                }
            }
            catch (error) {
                console.log(e);
            }
        });
    }
});
const writeTransLog = (targetMsg) => {
    const { to = undefined, body, type, timestamp } = targetMsg;
    const bodyString = JSON.stringify(body);
    console.log(JSON.stringify(body));
    const msgLi = document.createElement('li');
    msgLi.innerHTML = `<div class="message_type ${type} trans">
    <header>
      <span>▲ ${to} &lt;&lt;&lt; ${id}</span>
      <span>${type} @ ${timestamp}</span>
    </header>
    <p class="message_body ${bodyString == "\"\"" && 'empty'}">
      ${bodyString == "\"\"" ? 'this message has no body' : bodyString}
    </p>
  </div>`;
    document.querySelector('#msgs')?.append(msgLi);
};
const writeReceiveLog = (targetMsg) => {
    const { to = undefined, body, type, from = undefined, timestamp } = targetMsg;
    const bodyString = JSON.stringify(body);
    const msgLi = document.createElement('li');
    msgLi.innerHTML = `<div class="message_type ${type} receive">
        <header>
          <span>▼ ${from} &gt;&gt;&gt; ${to}</span>
          <span>${type} @ ${timestamp}</span>
        </header>
        <p class="message_body ${bodyString == "\"\"" && 'empty'}">
          ${bodyString == "\"\"" ? 'this message has no body' : bodyString}
        </p>
      </div>`;
    document.querySelector('#msgs')?.append(msgLi);
};
