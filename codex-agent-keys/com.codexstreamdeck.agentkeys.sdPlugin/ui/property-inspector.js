/* global WebSocket */
let socket;
let context;
let actionUuid;
let actionSettings = {};
let globalSettings = {};
let sessionOptions = [];

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
      document.getElementById("sound-enabled").checked = globalSettings.completionSoundEnabled !== false;
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

function sessionLabel(session) {
  if (!session) return "Choose a session…";
  const folder = session.cwd ? ` — ${session.cwd.split(/[\\/]/).pop()}` : "";
  const archived = session.archived ? " — ARCHIVED" : "";
  return `${session.name}${folder}${archived}`;
}

function closeSessionMenu() {
  document.getElementById("session-menu").hidden = true;
  document.getElementById("session-button").setAttribute("aria-expanded", "false");
}

function chooseSession(threadId) {
  actionSettings.threadId = threadId;
  send({ event: "setSettings", context, payload: actionSettings });
  const selected = sessionOptions.find((session) => session.id === threadId);
  document.getElementById("session-button").textContent = selected ? sessionLabel(selected) : "Choose a session…";
  for (const option of document.querySelectorAll(".session-option")) {
    option.setAttribute("aria-selected", option.dataset.threadId === threadId ? "true" : "false");
  }
  closeSessionMenu();
}

function renderSessionPicker(payload) {
  const selectedId = actionSettings.threadId || payload.selectedThreadId || "";
  sessionOptions = Array.isArray(payload.sessions) ? [...payload.sessions] : [];
  if (payload.selectedSession && !sessionOptions.some((session) => session.id === payload.selectedSession.id)) {
    sessionOptions.unshift(payload.selectedSession);
  }
  const selected = sessionOptions.find((session) => session.id === selectedId);
  document.getElementById("session-button").textContent = selected
    ? sessionLabel(selected)
    : selectedId ? "Unavailable session" : "Choose a session…";
  const menu = document.getElementById("session-menu");
  menu.replaceChildren();
  const choices = [{ id: "", name: "Choose a session…", cwd: "" }, ...sessionOptions];
  for (const session of choices) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "session-option";
    option.dataset.threadId = session.id;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", session.id === selectedId ? "true" : "false");
    option.textContent = sessionLabel(session);
    option.addEventListener("click", () => chooseSession(session.id));
    menu.append(option);
  }
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
  renderSessionPicker(payload);
}

document.getElementById("session-button").addEventListener("click", () => {
  const menu = document.getElementById("session-menu");
  menu.hidden = !menu.hidden;
  document.getElementById("session-button").setAttribute("aria-expanded", menu.hidden ? "false" : "true");
});

document.addEventListener("click", (event) => {
  if (!document.getElementById("session-picker").contains(event.target)) closeSessionMenu();
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
document.getElementById("sound-enabled").addEventListener("change", (event) => {
  globalSettings.completionSoundEnabled = event.target.checked;
  send({ event: "setGlobalSettings", context, payload: globalSettings });
});
document.getElementById("test-sound").addEventListener("click", () => sendToPlugin({ op: "testCompletionSound" }));
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
