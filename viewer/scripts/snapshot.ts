import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
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
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
});
page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const shots: { name: string; setup?: () => Promise<void> }[] = [
  { name: "01-dashboard" },
  {
    name: "01b-dashboard-middle",
    setup: async () => {
      await page.evaluate(() => {
        const m = document.querySelector(".main") as HTMLElement;
        if (m) m.scrollTop = Math.floor(m.scrollHeight * 0.50);
      });
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "01c-dashboard-controversial",
    setup: async () => {
      await page.evaluate(() => {
        const el = document.getElementById("dash-controversial");
        el?.scrollIntoView({ block: "start" });
      });
      await new Promise((r) => setTimeout(r, 250));
    },
  },
  {
    name: "01d-dashboard-patterns",
    setup: async () => {
      await page.evaluate(() => {
        const el = document.getElementById("dash-patterns");
        el?.scrollIntoView({ block: "start" });
      });
      await new Promise((r) => setTimeout(r, 250));
    },
  },
  {
    name: "01e-dashboard-bottom",
    setup: async () => {
      await page.evaluate(() => {
        const m = document.querySelector(".main") as HTMLElement;
        if (m) m.scrollTop = m.scrollHeight;
      });
      await new Promise((r) => setTimeout(r, 250));
    },
  },
  {
    name: "02-artifact-detail",
    setup: async () => {
      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll(".artifact-item")) as HTMLElement[];
        const t = items.find((e) => e.textContent?.includes("Observation")) ?? items[0];
        t?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => {
        const m = document.querySelector(".main") as HTMLElement;
        if (m) m.scrollTop = 0;
      });
      await new Promise((r) => setTimeout(r, 100));
    },
  },
  {
    name: "02b-artifact-detail-mid",
    setup: async () => {
      await page.evaluate(() => {
        const m = document.querySelector(".main") as HTMLElement;
        if (m) m.scrollTop = Math.floor(m.scrollHeight * 0.5);
      });
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "02c-artifact-findings",
    setup: async () => {
      // scroll directly to findings list panel
      await page.evaluate(() => {
        const list = document.querySelector(".list-panel");
        list?.scrollIntoView({ block: "start" });
      });
      await new Promise((r) => setTimeout(r, 250));
    },
  },
  {
    name: "03-findings-browser",
    setup: async () => {
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll(".nav-tab")) as HTMLElement[];
        const t = tabs.find((e) => e.textContent?.trim() === "Narrative");
        t?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => { const m = document.querySelector(".main") as HTMLElement; if (m) m.scrollTop = 0; });
      await new Promise((r) => setTimeout(r, 150));
    },
  },
  {
    name: "04-findings-filtered-critical",
    setup: async () => {
      await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll(".chip")) as HTMLElement[];
        chips.find((c) => c.textContent?.trim().startsWith("Critical"))?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "06-quick-action-critical-from-dashboard",
    setup: async () => {
      // navigate to dashboard via Overview tab
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll(".nav-tab")) as HTMLElement[];
        tabs.find((e) => e.textContent?.includes("Overview"))?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      // click the "N Critical →" quick action
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll(".quick-action")) as HTMLElement[];
        btns.find((b) => b.textContent?.includes("Critical"))?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
    },
  },
  {
    name: "07-triage-default",
    setup: async () => {
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll(".nav-tab")) as HTMLElement[];
        tabs.find((e) => e.textContent?.trim() === "Triage")?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
    },
  },
  // 09-shortcuts-help is captured last (see bottom of array) because
  // it opens a modal that persists across subsequent steps.
  {
    name: "07g-examples-md-open",
    setup: async () => {
      // expand first example details element
      await page.evaluate(() => {
        const det = document.querySelector(".fc-example") as HTMLDetailsElement;
        if (det) det.open = true;
      });
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "07h-specdiff",
    setup: async () => {
      // Clear filters, then navigate to Triage and select an artifact known to have semantic text on both sides.
      await page.evaluate(() => {
        document.querySelectorAll<HTMLElement>(".filter-clear").forEach((b) => b.click());
      });
      await new Promise((r) => setTimeout(r, 200));
      // Set URL to triage filter on HumanName via store action (set artifact filter via toggleArtifact)
      await page.evaluate(() => {
        // open the artifact dropdown chip and toggle HumanName
        const chip = Array.from(document.querySelectorAll<HTMLElement>(".chip")).find((c) =>
          c.textContent?.includes("Any artifact"));
        chip?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll<HTMLElement>(".dropdown-item"));
        const match = items.find((el) => el.textContent?.trim() === "HumanName");
        const cb = match?.querySelector("input") as HTMLInputElement | null;
        cb?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => { const m = document.querySelector(".main") as HTMLElement; if (m) m.scrollTop = 0; });
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "07f-narrative-modal",
    setup: async () => {
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll(".fc-narrative-link")) as HTMLElement[];
        links[0]?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
    },
  },
  {
    name: "07e-similar-popover",
    setup: async () => {
      await page.evaluate(() => {
        document.querySelectorAll<HTMLElement>(".seg-btn").forEach((b) => {
          if (b.textContent?.trim() === "cards") b.click();
          if (b.textContent?.trim() === "comfy") b.click();
        });
      });
      await new Promise((r) => setTimeout(r, 200));
      // hover the first similar pill (real CSS hover)
      const handle = await page.$(".similar-pill.similar-clickable");
      if (handle) {
        const box = await handle.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "07d-triage-pattern-drill",
    setup: async () => {
      // click the first +N similar badge
      await page.evaluate(() => {
        const sims = Array.from(document.querySelectorAll(".similar-pill.similar-clickable")) as HTMLElement[];
        sims[0]?.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => {
        const m = document.querySelector(".main") as HTMLElement;
        if (m) m.scrollTop = 0;
      });
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "07c-triage-compact",
    setup: async () => {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll(".seg-btn")) as HTMLElement[];
        btns.find((b) => b.textContent?.trim() === "compact")?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
    },
  },
  {
    name: "07b-triage-themes-open",
    setup: async () => {
      await page.evaluate(() => {
        const disc = Array.from(document.querySelectorAll(".chip")).find((c) => c.textContent?.includes("Justification & category")) as HTMLElement;
        disc?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "07i-triage-delta-filter",
    setup: async () => {
      // Close any lingering narrative modal from earlier steps
      await page.evaluate(() => {
        const close = document.querySelector(".narrative-modal-close") as HTMLElement;
        close?.click();
      });
      await new Promise((r) => setTimeout(r, 150));
      // Dismiss any open dropdowns by clicking the page body
      await page.mouse.click(20, 20);
      await new Promise((r) => setTimeout(r, 150));
      // Clear all filters
      await page.evaluate(() => {
        document.querySelectorAll<HTMLElement>(".filter-clear").forEach((b) => b.click());
      });
      await new Promise((r) => setTimeout(r, 200));
      // Click the first delta-kind facet pill (real mouse click)
      const dkHandle = await page.$(".fs-pill-delta");
      if (dkHandle) await dkHandle.click();
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => { const m = document.querySelector(".main") as HTMLElement; if (m) m.scrollTop = 0; });
      await new Promise((r) => setTimeout(r, 150));
    },
  },
  {
    name: "08-triage-grouped-by-verdict",
    setup: async () => {
      // Hard-clear via store hash route, then set groupBy via React-friendly setter
      await page.evaluate(() => {
        // wipe all filters by clicking clear-all if present (multiple may exist; click them all)
        document.querySelectorAll<HTMLElement>(".filter-clear").forEach((b) => b.click());
        // clear pattern explicitly
        document.querySelectorAll<HTMLElement>("button").forEach((b) => {
          if (b.textContent?.trim() === "clear pattern") b.click();
        });
      });
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate(() => {
        const sel = document.querySelectorAll(".triage-select")[0] as HTMLSelectElement;
        if (!sel) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
        setter?.call(sel, "verdict");
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 500));
      await page.evaluate(() => { const m = document.querySelector(".main") as HTMLElement; if (m) m.scrollTop = 0; });
      // scroll the virtualized list to the top
      await page.evaluate(() => { document.querySelectorAll<HTMLElement>(".triage-panel > div, .triage-toolbar + div").forEach((el) => { if (el.scrollTop !== undefined) el.scrollTop = 0; }); });
      await new Promise((r) => setTimeout(r, 200));
    },
  },
  {
    name: "09-shortcuts-help",
    setup: async () => {
      // ensure any other modal is closed first
      await page.keyboard.press("Escape");
      await new Promise((r) => setTimeout(r, 100));
      await page.evaluate(() => {
        const trig = document.querySelector(".shortcuts-trigger") as HTMLElement;
        trig?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
    },
  },
  {
    name: "05-artifacts-grid",
    setup: async () => {
      // Close shortcuts-help modal left open by previous step
      await page.evaluate(() => {
        const close = document.querySelector(".narrative-modal-close") as HTMLElement;
        close?.click();
      });
      await new Promise((r) => setTimeout(r, 200));
      await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll(".chip")) as HTMLElement[];
        chips.find((c) => c.textContent?.trim().startsWith("Critical"))?.click(); // clear
        const tabs = Array.from(document.querySelectorAll(".nav-tab")) as HTMLElement[];
        tabs.find((e) => e.textContent?.includes("Artifacts"))?.click();
      });
      await new Promise((r) => setTimeout(r, 300));
    },
  },
];

await page.setCacheEnabled(false);
await page.goto(BASE, { waitUntil: "networkidle0", timeout: 15000 });
// Seed pins for the dashboard panel demo + simulate prior visit (24h ago) so freshness shows.
await page.evaluate(() => {
  localStorage.setItem("r6breaks:pinnedArtifacts", JSON.stringify(["Patient", "Observation", "MedicinalProduct"]));
  localStorage.setItem("r6breaks:lastVisitMs", String(Date.now() - 24 * 60 * 60 * 1000));
  // Seed reviewed findings — real Patient IDs so per-pin progress shows
  localStorage.setItem("r6breaks:reviewedFindings", JSON.stringify([
    "Patient:TERMINOLOGY_BINDING:Patient.communication.language:9c3f2d",
    "Patient:SEMANTIC_OR_CONFORMANCE_TEXT:Patient.contact.relationship:64b8aa",
    "Patient:ELEMENT_PRESENCE_OR_IDENTITY:Patient.contact.additionalName:1f7e42",
    "CatalogEntry:ARTIFACT_IDENTITY:root:4f3a21",
    "ChargeItem:ARTIFACT_IDENTITY:root:c1",
  ]));
});
await page.reload({ waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 600));

for (const shot of shots) {
  if (shot.setup) await shot.setup();
  const path = resolve(outDir, `${shot.name}.png`);
  await page.screenshot({ path: path as `${string}.png`, fullPage: true });
  console.log(`captured ${shot.name}`);
}

await writeFile(
  resolve(outDir, "errors.log"),
  errors.length ? errors.join("\n") : "(no errors)\n",
);
console.log(errors.length ? `⚠ ${errors.length} runtime issues — see errors.log` : "✓ no runtime errors");

await browser.close();
