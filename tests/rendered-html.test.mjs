import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the Aquaivolt command center with production metadata", async () => {
  const [page, layout, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(page, /AI Command Center/);
  assert.match(page, /BASELINE → AI OPTIMIZATION EVIDENCE/);
  assert.match(page, /SIMULATION MODE/);
  assert.match(page, /DATA & AUDIT TRAIL/);
  assert.match(page, /6-METRIC BIOGAS OPTIMIZATION/);
  assert.match(page, /CH₄ \+ CO₂ \+ converted H₂S = 100%/);
  assert.doesNotMatch(page, /Maximum O₂|Four-gas|4 gases|4-in-1|H₂S \/ O₂/);
  assert.match(layout, /Aquaivolt AI Biogas Command Center/);
  assert.match(layout, /og\.png/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  assert.doesNotMatch(page + layout, /codex-preview|Your site is taking shape|SkeletonPreview/);
});

test("packages the server, social card, hosting metadata, and D1 migration", async () => {
  await Promise.all([
    access(new URL("dist/server/index.js", root)),
    access(new URL("dist/.openai/hosting.json", root)),
    access(new URL("dist/.openai/drizzle/0000_loose_infant_terrible.sql", root)),
    access(new URL("public/og.png", root)),
  ]);
});
