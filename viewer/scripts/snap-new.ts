import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const outDir = resolve(import.meta.dir, "..", "screens");
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});

const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

await page.goto(BASE + "/#/", { waitUntil: "networkidle0", timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: resolve(outDir, "fhir-01-explore.png") as `${string}.png`, fullPage: false });
console.log("captured fhir-01-explore");

// jump to a finding — pick a real one with substantive text content
const fid = await page.evaluate(() => {
  const link = document.querySelector("a.ft-title[href*='#/f/']") as HTMLAnchorElement | null;
  return link?.getAttribute("href") ?? null;
});
if (fid) {
  await page.goto(BASE + "/" + fid, { waitUntil: "networkidle0", timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: resolve(outDir, "fhir-02-finding.png") as `${string}.png`, fullPage: false });
  console.log("captured fhir-02-finding");
}

// artifact
await page.goto(BASE + "/#/a/Patient", { waitUntil: "networkidle0", timeout: 15000 });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: resolve(outDir, "fhir-03-artifact.png") as `${string}.png`, fullPage: false });
console.log("captured fhir-03-artifact");

if (errors.length) console.log("errors:", errors.join("\n"));
await browser.close();
