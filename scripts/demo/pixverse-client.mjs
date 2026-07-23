import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const API_ROOT = "https://app-api.pixverse.ai/openapi/v2";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class PixVerseClient {
  constructor({ apiKey, fetchImpl = fetch }) {
    if (!apiKey) throw new Error("PIXVERSE_API_KEY is required for cinematic generation");
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async request(endpoint, options = {}, attempts = 4) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const traceId = randomUUID();
      try {
        const response = await this.fetch(`${API_ROOT}${endpoint}`, {
          ...options,
          headers: { "API-KEY": this.apiKey, "Ai-trace-id": traceId, ...options.headers },
        });
        if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
          await sleep(2 ** attempt * 1_000);
          continue;
        }
        const payload = await response.json();
        if (!response.ok || payload.ErrCode !== 0) {
          throw new Error(`PixVerse request failed (${response.status}): ${payload.ErrMsg || payload.message || "unknown error"}`);
        }
        return { payload, traceId };
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await sleep(2 ** attempt * 1_000);
      }
    }
    throw lastError;
  }

  async uploadImage(file) {
    const form = new FormData();
    form.append("image", new Blob([await readFile(file)]), path.basename(file));
    const { payload, traceId } = await this.request("/image/upload", { method: "POST", body: form });
    return { imageId: payload.Resp.img_id, traceId };
  }

  async createTransition({ prompt, firstFrameImageId, lastFrameImageId, model, quality, duration, seed }) {
    const body = {
      prompt,
      model,
      quality,
      duration,
      first_frame_img: firstFrameImageId,
      last_frame_img: lastFrameImageId,
      generate_audio_switch: false,
      ...(seed === undefined ? {} : { seed }),
    };
    const { payload, traceId } = await this.request("/video/transition/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { videoId: payload.Resp.video_id, traceId };
  }

  async waitForVideo(videoId, { timeoutMs = 20 * 60_000, intervalMs = 5_000, onStatus } = {}) {
    const deadline = Date.now() + timeoutMs;
    const traceIds = [];
    while (Date.now() < deadline) {
      const { payload, traceId } = await this.request(`/video/result/${videoId}`);
      traceIds.push(traceId);
      const result = payload.Resp;
      onStatus?.(result.status);
      if (result.status === 1) return { url: result.url, result, traceIds };
      if ([6, 7, 8].includes(result.status)) throw new Error(`PixVerse generation ended with status ${result.status}`);
      await sleep(intervalMs);
    }
    throw new Error(`PixVerse generation ${videoId} timed out`);
  }
}
