/* global WebSocket */
let socket;
let context;
let actionUuid;
let actionSettings = {};
let globalSettings = {};

window.connectElgatoStreamDeckSocket = function (port, propertyInspectorUuid, registerEvent, _info, rawActionInfo) {
  context = propertyInspectorUuid;
  const actionInfo = JSON.parse(rawActionInfo);
  actionUuid = actionInfo.action;
  actionSettings = actionInfo.payload?.settings || {};
  socket = new WebSocket(`ws://127.0.0.1:${Number(port)}`);
  socket.onopen = () => {
    send({ event: registerEvent, uuid: context });
    send({ event: "getGlobalSettings", context });
    sendToPlugin({ op: "query" });
    document.getElementById("display-name").value = actionSettings.displayName || "";
  };
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.event === "didReceiveGlobalSettings") {
      globalSettings = message.payload.settings || {};
      document.getElementById("codex-path").value = globalSettings.codexPath || "/Applications/Codex.app/Contents/Resources/codex";
      document.getElementById("email-sender").value = globalSettings.completionEmailSender || "codex@haldanconsulting.com";
      document.getElementById("email-recipient").value = globalSettings.completionEmailRecipient || "ehansen@haldanconsulting.com";
      document.getElementById("email-enabled").checked = globalSettings.completionEmailEnabled === true;
      updateActiveTarget(globalSettings.activeThreadId || "");
    }
    if (message.event === "sendToPropertyInspector") receive(message.payload || {});
  };
};

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendToPlugin(payload) {
  send({ event: "sendToPlugin", action: actionUuid, context, payload });
}

function updateActiveTarget(threadId) {
  const active = document.getElementById("active-target");
  active.textContent = threadId ? `Active target: ${threadId}` : "No active target";
}

function receive(payload) {
  if (payload.type === "result") {
    const result = document.getElementById("result");
    result.textContent = payload.message || "Done";
    return;
  }
  if (payload.type !== "state") return;
  document.getElementById("connection").textContent = String(payload.connection || "starting").toUpperCase();
  document.getElementById("dot").className = payload.connection || "";
  document.getElementById("error").textContent = payload.lastError || "";
  updateActiveTarget(payload.activeThreadId || "");
  if (!document.getElementById("codex-path").value) document.getElementById("codex-path").value = payload.codexPath || "";
  const select = document.getElementById("session");
  const selected = actionSettings.threadId || payload.selectedThreadId || "";
  select.replaceChildren(new Option("Choose a session…", ""));
  for (const session of payload.sessions || []) {
    const folder = session.cwd ? ` — ${session.cwd.split(/[\\/]/).pop()}` : "";
    select.add(new Option(`${session.name}${folder}`, session.id));
  }
  select.value = selected;
}

document.getElementById("session").addEventListener("change", (event) => {
  actionSettings.threadId = event.target.value;
  send({ event: "setSettings", context, payload: actionSettings });
});

document.getElementById("display-name").addEventListener("input", (event) => {
  actionSettings.displayName = event.target.value;
  send({ event: "setSettings", context, payload: actionSettings });
});

document.getElementById("codex-path").addEventListener("change", (event) => {
  globalSettings.codexPath = event.target.value;
  send({ event: "setGlobalSettings", context, payload: globalSettings });
});

document.getElementById("refresh").addEventListener("click", () => sendToPlugin({ op: "refresh" }));
document.getElementById("clear-active").addEventListener("click", () => sendToPlugin({ op: "clearActive" }));
document.getElementById("test").addEventListener("click", () => sendToPlugin({ op: "test" }));
document.getElementById("email-sender").addEventListener("change", (event) => {
  globalSettings.completionEmailSender = event.target.value;
  send({ event: "setGlobalSettings", context, payload: globalSettings });
});
document.getElementById("email-recipient").addEventListener("change", (event) => {
  globalSettings.completionEmailRecipient = event.target.value;
  send({ event: "setGlobalSettings", context, payload: globalSettings });
});
document.getElementById("email-enabled").addEventListener("change", (event) => {
  globalSettings.completionEmailEnabled = event.target.checked;
  send({ event: "setGlobalSettings", context, payload: globalSettings });
});
document.getElementById("validate-email").addEventListener("click", () => sendToPlugin({ op: "validateEmail" }));
