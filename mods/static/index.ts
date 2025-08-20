// deno-lint-ignore-file no-window
/// <reference lib="dom" />
import { Pigeon, RecievedMessage, SendMessage } from "@circuitlab/pigeon-link";
import "./enter-console.ts";
import { formatDate } from "./lib.ts";

const { protocol, hostname, port, search } = window.location;

const params = new URLSearchParams(search);
const address = params.get("address");

const baseUrl = protocol === "https:"
  ? `wss://${hostname}:${port}/pigeon`
  : protocol === "http:"
  ? `ws://${hostname}:${port}/pigeon`
  : null;

if (baseUrl === null) {
  throw new Error(`unknown protocol: "${protocol}"`);
}

let myId: string = "";
let othersids: string[] = [];

addEventListener("load", () => {
  const pigeon = new Pigeon({
    address: address || "",
    baseUrl,
  });
  const ws = pigeon.socket;

  ws.addEventListener("open", (e) => {
    console.log({ open: e });
    const disconnectedMsg = document.createElement("li");
    const currentTime = Date.now();
    disconnectedMsg.innerHTML = `<p class="connected-msg">CONNECTED at ${
      formatDate(new Date(currentTime))
    } (${currentTime})</p>
    `;
    appendLog(disconnectedMsg);
  });

  ws.addEventListener("close", (e) => {
    console.log({ close: e });
    const disconnectedMsg = document.createElement("li");
    const currentTime = Date.now();
    disconnectedMsg.innerHTML = `<p class="disconnected-msg">DISCONNECTED at ${
      formatDate(new Date(currentTime))
    } (${currentTime})</p>
    `;
    appendLog(disconnectedMsg);
  });

  if (document) {
    document.querySelector("#sndPipo")?.addEventListener("click", () => {
      const msg = {
        to: ["all"],
        body: "pipo",
        type: "message",
      };
      pigeon.send(msg);
      writeSentLog(msg);
    });

    document.querySelector("#clear")?.addEventListener("click", () => {
      const msgList = document.querySelector<HTMLUListElement>("#msgs");
      if (msgList) {
        const msgListClone = msgList.cloneNode(false);
        msgList.parentNode?.replaceChild(msgListClone, msgList);
      }
    });

    document.querySelector("#sndMsg")?.addEventListener("click", () => {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        '#to_selector > li > input[name="to"]',
      );
      const to = Array.from(inputs).reduce(
        (prev: string[], inputElement: HTMLInputElement) => {
          if (inputElement.checked) {
            prev.push(inputElement.value);
          }
          return prev;
        },
        [],
      );
      const msgTypeInput = document.querySelector<HTMLInputElement>(
        "#msgTypeInput",
      );
      const msgBodyInput = document.querySelector<HTMLInputElement>(
        "#msgBodyInput",
      );
      if (msgTypeInput && msgBodyInput) {
        const { value: msgType } = msgTypeInput;
        const { value: body } = msgBodyInput;

        const msg = {
          to: [to].flat(),
          body,
          type: msgType || "message",
        };
        pigeon.send(msg);
        writeSentLog(msg);
        msgTypeInput.value = "message";
        msgBodyInput.value = "";
      }
    });

    document.querySelector("#ping_to_host")?.addEventListener("click", () => {
      pigeon.ping(["host"]);
      const msg = {
        to: ["host"],
        body: "",
        type: "ping",
      };
      writeSentLog(msg);
      document.querySelector("#flash")?.classList.add("ping");
      setTimeout(() => {
        document.querySelector("#flash")?.classList.remove("ping");
      }, 1000);
    });

    document.querySelector("#ping_to_others")?.addEventListener("click", () => {
      pigeon.ping(["others"]);
      const msg = {
        to: ["others"],
        body: "",
        type: "ping",
      };
      writeSentLog(msg);
    });

    pigeon.onRecieveMessage<{
      id: string;
      clients: string[];
    }>({ type: "init" }, (msg) => {
      writeReceiveLog(msg);
      const addressElem = document.querySelector<HTMLParagraphElement>(
        "p#address",
      );
      if (addressElem) addressElem.innerText = `address: ${address}`;
      const myIdElem = document.querySelector<HTMLParagraphElement>("p#myid");
      myId = msg.body.id;
      othersids = msg.body.clients.filter((otherId) => otherId !== myId);
      setOthers([myId, ...othersids]);
      if (myIdElem) myIdElem.innerText = `my id: ${myId}`;
      const titleElement = document.querySelector<HTMLTitleElement>("title");
      if (titleElement) {
        titleElement.innerText = `${myId} | ${titleElement.innerText}`;
      }
    }, { once: true });

    pigeon.onRecieveMessage<{
      id: string;
      clients: string[];
    }>({ type: /clientOpen|clientClose/ }, (msg) => {
      writeReceiveLog(msg);
      othersids = msg.body.clients.filter((otherId) => otherId !== myId);
      setOthers([myId, ...othersids]);
    });

    pigeon.onRecieveMessage<"">({ type: /ping|pong/ }, (msg) => {
      writeReceiveLog(msg);
      document.querySelector("#flash")?.classList.add("ping");
      setTimeout(() => {
        document.querySelector("#flash")?.classList.remove("ping");
      }, 1000);
    });

    pigeon.onRecieveMessage({
      type: /^(?!(init|clientOpen|clientClose|ping|pong)$).+$/,
    }, (msg) => {
      writeReceiveLog(msg);
    });

    pigeon.onSendMessage<"">({ type: "pong" }, (msg) => {
      writeSentLog(msg);
    });
  }
});

const setOthers = (ids: string[]): void => {
  const selectElement = document.querySelector<HTMLUListElement>(
    "ul#to_selector",
  );
  const othersElem = document.querySelector<HTMLParagraphElement>(
    "p#othersid",
  );

  ids = ["all", "others", ...ids];

  if (selectElement && othersElem) {
    selectElement.innerHTML = "";
    ids.forEach(
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
        labelElement.innerHTML = targetId == myId ? "me" : targetId;
        optionElement.append(inputElement, labelElement);
        selectElement.append(optionElement);
      },
    );
    othersElem.innerText = `others ids: ${JSON.stringify(othersids)}`;
  }
};

const appendLog = (logElement: HTMLLIElement) => {
  const msgs = document.querySelector("#msgs");
  if (msgs) {
    msgs.append(logElement);
    const autoScroll = window.scrollY + window.innerHeight >
      document.body.scrollHeight - 60 - logElement.clientHeight;
    if (autoScroll) {
      logElement.scrollIntoView();
    }
  }
};

const writeSentLog = (
  targetMsg: SendMessage,
) => {
  const { to = undefined, body, type } = targetMsg;
  const timestamp = Date.now();
  const bodyString = JSON.stringify(body);
  console.log(JSON.stringify(body));
  const msgLi = document.createElement("li");
  msgLi.innerHTML = `<div class="message_type ${type} trans">
  <header>
  <span>▲ [SENT MESSAGE] type: ${type}</span>
  <span>to: ${to} &lt;&lt;&lt; from: ${myId}</span>
  <span>${formatDate(new Date(timestamp))} (${timestamp})</span>
  </header>
  <p class="message_body ${bodyString == '""' && "empty"}">
      ${bodyString == '""' ? "this message has no body" : bodyString}
    </p>
  </div>`;
  appendLog(msgLi);
};

const writeReceiveLog = (
  targetMsg: RecievedMessage,
) => {
  const { to = undefined, body, type, from = undefined, timestamp } = targetMsg;
  const bodyString = JSON.stringify(body);
  const msgLi = document.createElement("li");
  msgLi.innerHTML = `<div class="message_type ${type} receive">
  <header>
  <span>▼ [RECEIVED MESSAGE] type: ${type}</span>
  <span>from: ${from} &gt;&gt;&gt; to: ${to}</span>
  <span>${formatDate(new Date(timestamp))} (${timestamp})</span>
  </header>
    <p class="message_body${bodyString == '""' ? " empty" : ""}">
      ${bodyString == '""' ? "this message has no body" : bodyString}
    </p>
  </div>`;
  appendLog(msgLi);
};
