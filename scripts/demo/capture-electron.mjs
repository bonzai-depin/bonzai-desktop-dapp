import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright";

async function runStep(page, step, captureDir) {
  if (step.action === "clickRole") {
    await page.getByRole(step.role, { name: step.name, exact: step.exact ?? true }).click();
  } else if (step.action === "clickText") {
    await page.getByText(step.text, { exact: step.exact ?? true }).first().click();
  } else if (step.action === "waitForText") {
    await page.getByText(step.text, { exact: step.exact ?? true }).waitFor({ state: "visible" });
  } else if (step.action === "scrollToText") {
    await page.getByText(step.text, { exact: step.exact ?? true }).first().scrollIntoViewIfNeeded();
  } else if (step.action === "loadDemoState") {
    const url = new URL(page.url());
    url.searchParams.set("demo", step.state);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  } else if (step.action === "wait") {
    await page.waitForTimeout(step.ms);
  } else if (step.action === "screenshot") {
    const brokenImages = await page.locator("img").evaluateAll((images) => images
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src));
    if (brokenImages.length) console.warn(`Broken capture images: ${brokenImages.slice(0, 5).join(", ")}`);
    await page.screenshot({ path: path.join(captureDir, `${step.name}.png`), animations: "disabled" });
  }
}

export async function captureDesktop({ repoRoot, manifest, runDir }) {
  const captureDir = path.join(runDir, "capture");
  const userDataDir = path.join(runDir, ".electron-profile");
  await mkdir(captureDir, { recursive: true });
  await rm(userDataDir, { recursive: true, force: true });

  const electronApp = await electron.launch({
    args: [path.join(repoRoot, "scripts/demo/electron-harness.cjs"), repoRoot, `--user-data-dir=${userDataDir}`],
    cwd: repoRoot,
    env: { ...process.env, BONZAI_DEMO_MODE: "1" },
    timeout: 60_000,
  });

  try {
    console.log("Electron launched; waiting for the main window...");
    const page = await electronApp.firstWindow({ timeout: 60_000 });
    console.log("Main window ready; applying the capture viewport...");
    page.setDefaultTimeout(20_000);
    await page.setViewportSize(manifest.viewport);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);
    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
    console.log(`Renderer text: ${bodyText.slice(0, 240) || "<empty>"}`);
    for (const [index, step] of manifest.capture.steps.entries()) {
      console.log(`Capture step ${index + 1}/${manifest.capture.steps.length}: ${step.action}`);
      try {
        await runStep(page, step, captureDir);
      } catch (error) {
        const currentText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
        await page.screenshot({ path: path.join(captureDir, "capture-failure.png"), animations: "disabled" });
        throw new Error(`${error.message}\nVisible renderer text: ${currentText.slice(0, 1200)}`);
      }
    }
    return captureDir;
  } finally {
    const electronProcess = electronApp.process();
    await Promise.race([
      electronApp.close(),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (electronProcess.exitCode === null) electronProcess.kill("SIGKILL");
    await rm(userDataDir, { recursive: true, force: true });
  }
}
