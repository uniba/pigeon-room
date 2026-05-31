// deno-lint-ignore-file no-window
/// <reference lib="dom" />
import { Pigeon } from "@circuitlab/pigeon-link";
import { buildBinaryFrame, parseBinaryFrame } from "../../../lib/util.ts";
import "./enter-console.ts";
import { formatDate } from "./lib.ts";

const { protocol, hostname, port, search } = window.location;

const params = new URLSearchParams(search);
const address = params.get("address");
const staticid = params.get("staticid");

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

const getSelectedTo = (): string[] => {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    '#to_selector > li > input[name="to"]',
  );
  return Array.from(inputs).reduce((prev: string[], el) => {
    if (el.checked) prev.push(el.value);
    return prev;
  }, []);
};

addEventListener("load", () => {
  const pigeon = new Pigeon({
    address: address || "",
    ...(
      staticid ? { staticId: staticid } : {}
    ),
    baseUrl,
  });
  const ws = pigeon.socket;
  // Receive binary frames as ArrayBuffer (matching server-side binaryType).
  ws.binaryType = "arraybuffer";

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

  ws.addEventListener("message", (event) => {
    if (!(event.data instanceof ArrayBuffer)) return;
    try {
      const { header, payload } = parseBinaryFrame(event.data);
      writeReceiveLog(header, payload);
    } catch (e) {
      console.warn("Failed to parse binary frame:", e);
    }
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
        msgList.querySelectorAll<HTMLAnchorElement>("a.download_link").forEach(
          (a) => URL.revokeObjectURL(a.href),
        );
        const msgListClone = msgList.cloneNode(false);
        msgList.parentNode?.replaceChild(msgListClone, msgList);
      }
    });

    document.querySelector("#sndMsg")?.addEventListener("click", async () => {
      const to = getSelectedTo();
      const msgTypeInput = document.querySelector<HTMLInputElement>(
        "#msgTypeInput",
      );
      const msgBodyInput = document.querySelector<HTMLInputElement>(
        "#msgBodyInput",
      );
      const binFileInput = document.querySelector<HTMLInputElement>(
        "#binFileInput",
      );
      if (!msgTypeInput || !msgBodyInput) return;

      const type = msgTypeInput.value || "message";
      const body = msgBodyInput.value;
      const file = binFileInput?.files?.[0];

      if (file) {
        const payload = new Uint8Array(await file.arrayBuffer());
        const fileMeta: FileMeta = {
          name: file.name,
          size: file.size,
          mimeType: file.type,
        };
        const frame = buildBinaryFrame({ type, to, body, payloadMeta: fileMeta }, payload);
        ws.send(frame);
        writeSentLog({ type, to, body, payloadMeta: fileMeta }, { payloadMeta: fileMeta, byteLength: file.size });
        binFileInput.value = "";
      } else {
        const msg = { to: [to].flat(), body, type };
        pigeon.send(msg);
        writeSentLog(msg);
      }

      msgTypeInput.value = "message";
      msgBodyInput.value = "";
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

    pigeon.onReceiveMessage<{
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

    pigeon.onReceiveMessage<{
      id: string;
      clients: string[];
    }>({ type: /clientOpen|clientClose/ }, (msg) => {
      writeReceiveLog(msg);
      othersids = msg.body.clients.filter((otherId) => otherId !== myId);
      setOthers([myId, ...othersids]);
    });

    pigeon.onReceiveMessage<"">({ type: /ping|pong/ }, (msg) => {
      writeReceiveLog(msg);
      document.querySelector("#flash")?.classList.add("ping");
      setTimeout(() => {
        document.querySelector("#flash")?.classList.remove("ping");
      }, 1000);
    });

    pigeon.onReceiveMessage({
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

type FileMeta = { name: string; size: number; mimeType: string };

const writeSentLog = (
  msg: { type: string; to?: unknown; body?: unknown; payloadMeta?: unknown },
  attachment?: { payloadMeta: FileMeta; byteLength: number },
) => {
  const { to, body, type } = msg;
  const timestamp = Date.now();
  const bodyString = JSON.stringify(body);
  const attachmentHtml = attachment
    ? `<p class="message_body payload_line">payload: ${attachment.payloadMeta.name} &nbsp;<span class="file_meta">${attachment.payloadMeta.mimeType} · ${attachment.byteLength.toLocaleString()}B</span></p>`
    : "";
  const msgLi = document.createElement("li");
  msgLi.innerHTML = `<div class="message_type ${type} trans">
  <header>
  <span>▲ [SENT] type: ${type}</span>
  <span>to: ${to} &lt;&lt;&lt; from: ${myId}</span>
  <span>${formatDate(new Date(timestamp))} (${timestamp})</span>
  </header>
  <p class="message_body${bodyString == '""' ? " empty" : ""}">
    ${bodyString == '""' ? "this message has no body" : bodyString}
  </p>
  ${attachmentHtml}
  </div>`;
  appendLog(msgLi);
};

const writeReceiveLog = (
  msg: { type: string; from?: unknown; to?: unknown; body?: unknown; timestamp?: number; payloadMeta?: unknown } & Record<string, unknown>,
  payload?: Uint8Array,
) => {
  const { type, from, to, body, timestamp, payloadMeta } = msg;
  const ts = typeof timestamp === "number" ? timestamp : Date.now();
  const bodyString = JSON.stringify(body);

  let attachmentHtml = "";
  if (payload && payloadMeta && typeof payloadMeta === "object" && "name" in payloadMeta) {
    const meta = payloadMeta as Partial<FileMeta>;
    const fileName = meta.name ?? "download";
    const mimeType = meta.mimeType ?? "application/octet-stream";
    const blob = new Blob([payload.slice()], { type: mimeType });
    const url = URL.createObjectURL(blob);
    attachmentHtml = `<p class="message_body payload_line">payload: <a class="download_link" href="${url}" download="${fileName}">⬇ ${fileName}</a> &nbsp;<span class="file_meta">${mimeType} · ${payload.byteLength.toLocaleString()}B</span></p>`;
  }

  const msgLi = document.createElement("li");
  msgLi.innerHTML = `<div class="message_type ${type} receive">
  <header>
  <span>▼ [RECEIVED] type: ${type}</span>
  <span>from: ${from} &gt;&gt;&gt; to: ${to}</span>
  <span>${formatDate(new Date(ts))} (${ts})</span>
  </header>
  <p class="message_body${bodyString == '""' ? " empty" : ""}">
    ${bodyString == '""' ? "this message has no body" : bodyString}
  </p>
  ${attachmentHtml}
  </div>`;
  appendLog(msgLi);
};
