import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const demoDir = path.dirname(fileURLToPath(import.meta.url));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr.slice(-1500)}`)));
  });
}

export async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function normalizeImage(input, output) {
  await mkdir(path.dirname(output), { recursive: true });
  await run("ffmpeg", ["-y", "-i", input, "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black", "-frames:v", "1", output]);
}

export async function download(url, output) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Video download failed (${response.status})`);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
}

export async function extractFinalFrame(video, output) {
  await run("ffmpeg", ["-y", "-sseof", "-0.1", "-i", video, "-frames:v", "1", output]);
}

export async function masterVideo(input, output) {
  await mkdir(path.dirname(output), { recursive: true });
  await run("ffmpeg", ["-y", "-i", input, "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=60", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", output]);
}

export async function masterVideos(inputs, output) {
  if (inputs.length === 1) return masterVideo(inputs[0], output);
  await mkdir(path.dirname(output), { recursive: true });
  const inputArgs = inputs.flatMap((input) => ["-i", input]);
  const filters = inputs.map((_, index) =>
    `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setpts=PTS-STARTPTS[v${index}]`,
  );
  const concatInputs = inputs.map((_, index) => `[v${index}]`).join("");
  const filter = `${filters.join(";")};${concatInputs}concat=n=${inputs.length}:v=1:a=0,fps=60[outv]`;
  await run("ffmpeg", ["-y", ...inputArgs, "-filter_complex", filter, "-map", "[outv]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
}

function escapeXml(value = "") {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function createOverlaySvg(overlay, file) {
  const eyebrow = overlay.eyebrow
    ? `<text x="${overlay.x}" y="${overlay.y}" class="eyebrow">${escapeXml(overlay.eyebrow)}</text>`
    : "";
  const body = overlay.body
    ? `<text x="${overlay.x}" y="${overlay.y + 108}" class="body">${escapeXml(overlay.body)}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <style>
    .eyebrow { font: 24px 'Fira Sans'; fill: #a855f7; }
    .title { font: italic 900 52px 'Fira Sans Condensed'; fill: #ffffff; }
    .body { font: 27px 'Fira Sans'; fill: #e6e1ec; }
  </style>
  ${eyebrow}
  <text x="${overlay.x}" y="${overlay.y + 64}" class="title">${escapeXml(overlay.title)}</text>
  ${body}
</svg>`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, svg);
}

async function renderOverlayPng(svg, png) {
  const electronApp = await electron.launch({
    args: [path.join(demoDir, "overlay-harness.cjs"), svg],
    timeout: 30_000,
  });
  try {
    const page = await electronApp.firstWindow({ timeout: 30_000 });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: png, omitBackground: true });
  } finally {
    const electronProcess = electronApp.process();
    await Promise.race([electronApp.close(), new Promise((resolve) => setTimeout(resolve, 3_000))]);
    if (electronProcess.exitCode === null) electronProcess.kill("SIGKILL");
  }
}

export async function composeProductFilm({ reel, captureDir, segments, output, transition = 0.4 }) {
  await mkdir(path.dirname(output), { recursive: true });
  const inputArgs = ["-i", reel];
  const inputs = [];
  let nextInput = 1;
  for (const [index, segment] of segments.entries()) {
    if (segment.type !== "capture") {
      inputs[index] = {};
      continue;
    }
    const captureInput = nextInput++;
    inputArgs.push("-loop", "1", "-t", String(segment.duration), "-i", path.join(captureDir, `${segment.capture}.png`));
    let overlayInput = null;
    if (segment.overlay) {
      const overlayFile = path.join(path.dirname(output), ".overlays", `segment-${index + 1}.svg`);
      const overlayPng = path.join(path.dirname(output), ".overlays", `segment-${index + 1}.png`);
      await createOverlaySvg(segment.overlay, overlayFile);
      await renderOverlayPng(overlayFile, overlayPng);
      overlayInput = nextInput++;
      inputArgs.push("-loop", "1", "-t", String(segment.duration), "-i", overlayPng);
    }
    inputs[index] = { captureInput, overlayInput };
  }

  const filters = [];
  segments.forEach((segment, index) => {
    if (segment.type === "cinematic") {
      filters.push(`[0:v]trim=start=${segment.start}:duration=${segment.duration},setpts=PTS-STARTPTS,scale=1920:1080,fps=60,format=yuv420p[v${index}]`);
    } else {
      const emphasis = segment.emphasis
        ? `,drawbox=x=${segment.emphasis.x}:y=${segment.emphasis.y}:w=${segment.emphasis.width}:h=${segment.emphasis.height}:color=white@0.75:t=3:enable='between(t,${segment.emphasis.start},${segment.emphasis.end})'`
        : "";
      const { captureInput, overlayInput } = inputs[index];
      if (overlayInput !== null) {
        filters.push(`[${captureInput}:v]trim=duration=${segment.duration},setpts=PTS-STARTPTS,scale=1920:1080,fps=60,format=rgba[base${index}]`);
        filters.push(`[${overlayInput}:v]trim=duration=${segment.duration},setpts=PTS-STARTPTS,scale=1920:1080,fps=60,format=rgba[overlay${index}]`);
        filters.push(`[base${index}][overlay${index}]overlay=0:0:format=auto${emphasis},format=yuv420p[v${index}]`);
      } else {
        filters.push(`[${captureInput}:v]trim=duration=${segment.duration},setpts=PTS-STARTPTS,scale=1920:1080,fps=60,format=yuv420p${emphasis}[v${index}]`);
      }
    }
  });

  let current = "v0";
  let duration = segments[0].duration;
  for (let index = 1; index < segments.length; index += 1) {
    const outputLabel = `mix${index}`;
    const offset = duration - transition;
    filters.push(`[${current}][v${index}]xfade=transition=fade:duration=${transition}:offset=${offset.toFixed(3)}[${outputLabel}]`);
    duration += segments[index].duration - transition;
    current = outputLabel;
  }
  filters.push(`[0:a]atrim=start=0:duration=${duration.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, duration - 1.5).toFixed(3)}:d=1.5[aout]`);

  await run("ffmpeg", [
    "-y", ...inputArgs,
    "-filter_complex", filters.join(";"),
    "-map", `[${current}]`, "-map", "[aout]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", "-shortest", output,
  ]);
}

export function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const args = ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,codec_name:format=duration", "-of", "json", file];
    const child = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(`ffprobe failed: ${stderr}`)));
  });
}
