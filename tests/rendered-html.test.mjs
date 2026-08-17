import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds the simplified before-and-after production dashboard", async () => {
  const [page, layout, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);

  assert.match(page, /Biogas production dashboard/);
  assert.match(page, /Only real quantities: before, after and the extra amount/);
  assert.match(page, /before and after/);
  assert.match(page, /Methane/);
  assert.match(page, /Electricity/);
  assert.match(page, /Every field below is used by the calculation/);
  assert.match(page, /Hour-scale sheets are research projections/);
  assert.match(page, /No placeholder numbers are shown/);
  assert.match(page, /Nothing runs until you click Calculate/);
  assert.match(page, /Values beyond the supplied rows are estimated from the nearest data patterns/);
  assert.match(page, /Virtual monitoring/);
  assert.match(page, /NO PHYSICAL DEVICE CONNECTED/);
  assert.match(page, /Run Calculate production to populate the virtual monitoring screen/);
  assert.match(page, /Wastewater tank/);
  assert.match(page, /Gas and energy/);
  assert.match(page, /m³ CH₄\/day/);
  assert.doesNotMatch(page, /Optimization Gain|Scenario Coverage|Overall Benefit|Prototype Readiness|6-METRIC|Readiness Score/);
  assert.doesNotMatch(page, /outside the normal model range|Check highlighted values|issues\.length>0/);
  assert.match(layout, /Aquaivolt AI Biogas Command Center/);
  assert.equal(JSON.parse(hosting).d1, "DB");
  await access(new URL("app/api/model/route.ts", root));
});

test("packages the Vercel-compatible Next.js application and social card", async () => {
  await Promise.all([
    access(new URL(".next/BUILD_ID", root)),
    access(new URL(".next/server/app/page.js", root)),
    access(new URL("public/og.png", root)),
  ]);
});
