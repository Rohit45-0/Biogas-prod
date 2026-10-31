import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const commands = [
  ["extract", ".", "--code-only", "--max-workers", "2"],
  ["cluster-only", ".", "--no-label"],
];

for (const args of commands) {
  const result = spawnSync("graphify", args, {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  });
  if (result.error) {
    console.error(
      result.error.code === "ENOENT"
        ? "Graphify is missing from PATH. Install it with: uv tool install graphifyy"
        : result.error.message,
    );
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Open graphify-out/graph.html to explore the Biogas code graph.");
