/**
 * Vendors the draw.io webapp into `public/drawio/` so diagram editing works
 * air-gapped: the app image serves the editor same-origin, with no runtime
 * dependency on embed.diagrams.net (PRD §8 self-hosted; decision log
 * 2026-07-15). Runs via the `prebuild`/`predev` hooks and exits immediately
 * once the files exist, so only the first run (and the Docker build stage,
 * which has network) ever downloads.
 *
 * The pinned `draw.war` release asset is a plain zip of the static webapp —
 * no Java involved; WEB-INF/META-INF servlet metadata is skipped.
 *
 * Escape hatch: DRAWIO_SKIP_FETCH=1 skips entirely (e.g. building offline
 * while pointing NEXT_PUBLIC_DRAWIO_URL at an external editor).
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import JSZip from "jszip";

const DRAWIO_VERSION = "30.3.11";
const WAR_URL = `https://github.com/jgraph/drawio/releases/download/v${DRAWIO_VERSION}/draw.war`;
// sha256 of the pinned draw.war — refuse a tampered or truncated download.
const WAR_SHA256 = "8fd2efb34c2a4792ba24c2583500d6e9e0b893b02f288f4ab9da545a7aaeb076";
const DEST = join(process.cwd(), "public", "drawio");
const STAMP = join(DEST, ".version");

async function main(): Promise<void> {
  if (process.env.DRAWIO_SKIP_FETCH === "1") {
    console.log("fetch-drawio: skipped (DRAWIO_SKIP_FETCH=1)");
    return;
  }
  if (existsSync(STAMP) && existsSync(join(DEST, "index.html"))) {
    if ((await readFile(STAMP, "utf8")).trim() === DRAWIO_VERSION) return; // already vendored
  }

  console.log(`fetch-drawio: downloading draw.io v${DRAWIO_VERSION} …`);
  const res = await fetch(WAR_URL, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `fetch-drawio: download failed (${res.status} ${res.statusText}). ` +
        "Offline builds can set DRAWIO_SKIP_FETCH=1 and point NEXT_PUBLIC_DRAWIO_URL elsewhere.",
    );
  }
  const bytes = Buffer.from(await res.arrayBuffer());

  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== WAR_SHA256) {
    throw new Error(
      `fetch-drawio: checksum mismatch for draw.war\n  expected ${WAR_SHA256}\n  got      ${digest}`,
    );
  }

  const zip = await JSZip.loadAsync(bytes);
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });

  let files = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    // Servlet metadata is useless to a static deployment.
    if (entry.name.startsWith("WEB-INF/") || entry.name.startsWith("META-INF/")) continue;
    // Zip-slip guard: never write outside DEST.
    const target = join(DEST, entry.name);
    if (!target.startsWith(`${DEST}/`)) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await entry.async("nodebuffer"));
    files++;
  }
  await writeFile(STAMP, `${DRAWIO_VERSION}\n`);
  console.log(`fetch-drawio: vendored ${files} files into public/drawio`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
