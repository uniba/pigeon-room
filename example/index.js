const { protocol, hostname, port } = location;

class superWS extends WebSocket {
  sendMsg(
    _msg,
  ) {
    const msg = _msg;
    try {
      const msgString = JSON.stringify(msg);
      this.send(msgString);
      console.log({ sentMessage: msg });
      writeTransLog({
        ...msg,
        timestamp: new Date().getTime(),
      });
    } catch (_) {
      return false;
    }
  }

  ping(to) {
    this.sendMsg({
      to,
      type: "ping",
      body: "",
    });
  }
  pong(to) {
    this.sendMsg({
      to,
      type: "pong",
      body: "",
    });
  }
}

const wsUrl = `ws${
  protocol === "https:" ? "s" : ""
}://${hostname}:${port}/pigeon/?address=all`;

let id;
let othersids;

addEventListener("load", () => {
  const ws = new superWS(wsUrl);
  ws.addEventListener("open", (e) => {
    console.log({ open: e });
  });
  ws.addEventListener("close", (e) => {
    console.log({ close: e });
  });
  if (document) {
    document.querySelector("#sndPipo")?.addEventListener("click", () => {
      ws.sendMsg({
        to: ["all"],
        body: "pipo",
        type: "message",
      });
    });
    document.querySelector("#clear")?.addEventListener("click", () => {
      const msgList = document.querySelector("#msgs");
      if (msgList) {
        const msgListClone = msgList.cloneNode(false);
        msgList.parentNode?.replaceChild(msgListClone, msgList);
      }
    });
    document.querySelector("#sndMsg")?.addEventListener("click", () => {
      const inputs = document.querySelectorAll(
        '#to_selector > li > input[name="to"]',
      );
      const to = Array.from(inputs).reduce(
        (prev, inputElement) => {
          if (inputElement.checked) {
            prev.push(inputElement.value);
          }
          return prev;
        },
        [],
      );
      const msgBodyInput = document.querySelector(
        "#msgBodyInput",
      );
      const { value: body } = msgBodyInput;
      ws.sendMsg({
        to: [to].flat(),
        body,
        type: "message",
      });
      msgBodyInput.value = "";
    });
    document.querySelector("#ping_to_host")?.addEventListener("click", () => {
      ws.ping(["host"]);
    });
    document.querySelector("#ping_to_others")?.addEventListener("click", () => {
      ws.ping(["others"]);
    });
    ws.addEventListener("message", (e) => {
      const receivedMsg = JSON.parse(e.data);
      writeReceiveLog(receivedMsg);
      console.log({ receivedMessage: receivedMsg });
      const { _to = undefined, _body, type, from = undefined, _timestamp } =
        receivedMsg;
      if (type == "ping") {
        if (from === undefined) ws.pong(["all"]);
        else if (from === "host") ws.pong(["host"]);
        else ws.pong([from]);
        document.querySelector("#flash")?.classList.add("ping");
        setTimeout(() => {
          document.querySelector("#flash")?.classList.remove("ping");
        }, 1000);
      }
      if (type == "pong") {
        document.querySelector("#flash")?.classList.add("pong");
        setTimeout(() => {
          document.querySelector("#flash")?.classList.remove("pong");
        }, 500);
      }
      let msg;
      const myIdElem = document.querySelector("p#myid");
      const othersElem = document.querySelector("p#othersid");
      try {
        msg = JSON.parse(e.data);
        const { type } = msg;
        if (
          type == "init" ||
          type == "clientOpen" ||
          type == "clientClose"
        ) {
          if (type == "init") {
            id = msg.body.id;
            myIdElem.innerText = `my id: ${id}`;
            const titleElement = document.querySelector("title");
            if (titleElement) {
              titleElement.innerText = `${id} | ${titleElement.innerText}`;
            }
          }
          othersids = msg.body.clients.filter((otherId) => otherId !== id);
          const selectElement = document.querySelector(
            "ul#to_selector",
          );
          selectElement.innerHTML = "";
          Array.from(["all", "others", id, ...othersids]).forEach(
            (targetId) => {
              const optionElement = document.createElement("li");
              const inputElement = document.createElement("input");
              inputElement.innerText = targetId;
              inputElement.setAttribute("type", "checkbox");
              inputElement.setAttribute("value", targetId);
              inputElement.setAttribute("id", `selection_${targetId}`);
              inputElement.setAttribute("name", "to");
              const labelElement = document.createElement("label");
              labelElement.setAttribute("for", `selection_${targetId}`);
              labelElement.innerHTML = targetId == id ? "me" : targetId;
              optionElement.append(inputElement, labelElement);
              selectElement.append(optionElement);
            },
          );
          othersElem.innerText = `others ids: ${JSON.stringify(othersids)}`;
        }
      } catch (error) {
        console.error(error);
        console.error(e);
      }
    });
  }
});

const writeTransLog = (
  targetMsg,
) => {
  const { to = undefined, body, type, timestamp } = targetMsg;
  const bodyString = JSON.stringify(body);
  const msgLi = document.createElement("li");
  const time = new Date(timestamp);
  const timeString = `${time.getFullYear()}/${
    `0${time.getMonth() + 1}`.slice(-2)
  }/${time.getDate()} ${`0${time.getHours()}`.slice(-2)}:${
    `0${time.getMinutes()}`.slice(-2)
  }:${`0${time.getSeconds()}`.slice(-2)}.${time.getMilliseconds()}`;
  msgLi.innerHTML = `<div class="message_type ${type} trans">
    <header>
      <span>▲ message sent</span>
      <span>${to} &lt;&lt;&lt; ${id}</span>
      <span>${type} @ ${timeString}</span>
    </header>
    <p class="message_body ${bodyString == '""' && "empty"}">
      ${bodyString == '""' ? "this message has no body" : bodyString}
    </p>
  </div>`;
  document.querySelector("#msgs")?.prepend(msgLi);
};

const writeReceiveLog = (
  targetMsg,
) => {
  const { to = undefined, body, type, from = undefined, timestamp } = targetMsg;
  const bodyString = JSON.stringify(body);
  const msgLi = document.createElement("li");
  const time = new Date(timestamp);
  const timeString = `${time.getFullYear()}/${
    `0${time.getMonth() + 1}`.slice(-2)
  }/${time.getDate()} ${`0${time.getHours()}`.slice(-2)}:${
    `0${time.getMinutes()}`.slice(-2)
  }:${`0${time.getSeconds()}`.slice(-2)}.${time.getMilliseconds()}`;
  msgLi.innerHTML = `<div class="message_type ${type} receive">
    <header>
      <span>▼ message received</span>
      <span>${from} &gt;&gt;&gt; ${to}</span>
      <span>${type} @ ${timeString}</span>
    </header>
    <p class="message_body ${bodyString == '""' && "empty"}">
      ${bodyString == '""' ? "this message has no body" : bodyString}
    </p>
  </div>`;
  document.querySelector("#msgs")?.prepend(msgLi);
};
