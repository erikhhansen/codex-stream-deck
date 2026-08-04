import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import streamDeck from "@elgato/streamdeck";

import { svgDataUrl } from "./renderer.js";

const execFileAsync = promisify(execFile);
const imageCache = new Map<string, Promise<string>>();
const rasterDirectory = join(tmpdir(), "codex-agent-keys-streamdock-images");
let rasterQueue: Promise<void> = Promise.resolve();

export function isStreamDock(): boolean {
  const major = Number.parseInt(streamDeck.info.application.version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major < 7;
}

async function rasterizeSvg(svg: string): Promise<string> {
  const hash = createHash("sha256").update(svg).digest("hex").slice(0, 24);
  const svgPath = join(rasterDirectory, `${hash}.svg`);
  const pngPath = `${svgPath}.png`;
  await mkdir(rasterDirectory, { recursive: true });

  // Quick Look treats explicit SVG dimensions as points on Retina displays.
  // The viewBox alone produces the required full-size 144 × 144 PNG.
  const scalableSvg = svg.replace(/\swidth="144"\sheight="144"/, "");
  await writeFile(svgPath, scalableSvg);
  try {
    await execFileAsync("/usr/bin/qlmanage", ["-t", "-s", "144", "-o", rasterDirectory, svgPath], {
      timeout: 5000
    });
    const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const width = Number(viewBox?.[1]);
    const height = Number(viewBox?.[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > height) {
      const croppedHeight = Math.max(1, Math.min(144, Math.round(144 * height / width)));
      await execFileAsync("/usr/bin/sips", ["--cropToHeightWidth", String(croppedHeight), "144", pngPath], {
        timeout: 5000
      });
    }
    return `data:image/png;base64,${(await readFile(pngPath)).toString("base64")}`;
  } finally {
    await Promise.allSettled([unlink(svgPath), unlink(pngPath)]);
  }
}

function queuedRasterizeSvg(svg: string): Promise<string> {
  const pending = rasterQueue.then(() => rasterizeSvg(svg));
  rasterQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

export async function hostImageDataUrl(svg: string): Promise<string> {
  if (!isStreamDock() || streamDeck.info.application.platform !== "mac") return svgDataUrl(svg);

  let pending = imageCache.get(svg);
  if (!pending) {
    pending = queuedRasterizeSvg(svg)
      .catch(async (firstError) => {
        streamDeck.logger.warn(`Retrying Stream Dock key image: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
        await new Promise((resolve) => setTimeout(resolve, 120));
        return queuedRasterizeSvg(svg);
      })
      .catch((error) => {
        imageCache.delete(svg);
        streamDeck.logger.warn(`Could not rasterize Stream Dock key image: ${error instanceof Error ? error.message : String(error)}`);
        return svgDataUrl(svg);
      });
    imageCache.set(svg, pending);
  }
  return pending;
}
