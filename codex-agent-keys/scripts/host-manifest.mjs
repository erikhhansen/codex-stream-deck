export const HOSTS = ["streamdeck", "streamdock"];

export function manifestForHost(source, host) {
  if (!HOSTS.includes(host)) throw new Error(`Unknown Agent Keys host: ${host}`);
  const manifest = structuredClone(source);
  manifest.Name = "Codex Agent Keys";
  manifest.Description = "Shared Stream Deck and Stream Dock controls for pinned Codex sessions.";

  if (host === "streamdeck") {
    manifest.SDKVersion = 3;
    manifest.CodePath = manifest.CodePath ?? manifest.CodePathMac ?? manifest.CodePathWin;
    delete manifest.CodePathMac;
    delete manifest.CodePathWin;
    manifest.Nodejs = { ...manifest.Nodejs, Version: "24" };
    manifest.Software = { ...manifest.Software, MinimumVersion: "7.1" };
  } else {
    const codePath = manifest.CodePath ?? manifest.CodePathMac ?? manifest.CodePathWin;
    manifest.SDKVersion = 1;
    manifest.CodePathMac = codePath;
    manifest.CodePathWin = codePath;
    delete manifest.CodePath;
    manifest.Nodejs = { ...manifest.Nodejs, Version: "20" };
    manifest.Software = { ...manifest.Software, MinimumVersion: "3.10.188.226" };
  }

  for (const action of manifest.Actions ?? []) {
    if (!Array.isArray(action.Controllers)) continue;
    action.Controllers = action.Controllers.map((controller) => {
      if (host === "streamdock" && controller === "Encoder") return "Knob";
      if (host === "streamdeck" && controller === "Knob") return "Encoder";
      return controller;
    });
  }
  return manifest;
}
