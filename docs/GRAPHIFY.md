# Biogas code graph

[Graphify](https://github.com/Graphify-Labs/graphify) maps this project's source files, functions, imports and calls into a local knowledge graph. This is developer tooling; the dashboard does not call Graphify at runtime.

## Setup and refresh

Use Python 3.10+ and install the official package, `graphifyy` (two y's):

```powershell
uv tool install graphifyy
graphify --version
```

From this project folder (the one containing `package.json`), run:

```powershell
pnpm graphify
```

If pnpm is unavailable, `node scripts/graphify.mjs` runs the same command. The script runs code extraction with two workers, then generates the report and browser view. It uses `--code-only` and `--no-label`, so it needs no model API key or semantic model calls. The initial integration was verified with Graphify 0.9.93.

Open these generated files:

- `graphify-out/graph.html`: interactive graph with search and filters.
- `graphify-out/GRAPH_REPORT.md`: graph statistics, communities and architectural hubs.
- `graphify-out/graph.json`: graph data for local queries.

Run the same refresh command after editing source. Graphify reuses its extraction cache. The generated output is ignored by Git and excluded from Vercel deployments.

## Query the project

Run from the project folder:

```powershell
graphify query "trained model inference" --seed app/lib/ml-runtime.ts --budget 800
graphify query "audit storage" --seed app/lib/audit.ts --budget 800
graphify query "Python workflow" --seed ai-workflow/src/aquaivolt_langgraph_backend.py --budget 800
graphify god-nodes --top 10
```

Queries match symbol and filename keywords; `--seed` starts at a specific file or symbol. Use the exact labels or IDs returned by a query with `graphify explain` or `graphify path`. Paths describe static code relationships, not proof that a runtime workflow executes.

To register Graphify with Codex for this project:

```powershell
graphify install --project --platform codex
```

The project already includes the installed skill at `.codex/skills/graphify/SKILL.md`, the companion references, and guidance in `AGENTS.md`. The command above refreshes that registration. The CLI and npm script work independently of skill discovery.

## Scope

The graph covers the dashboard's source and APIs, Python workflow source, scripts and tests. `.graphifyignore` excludes local environment files, deployment metadata, dependencies, generated builds, audit run records, model binaries, datasets and public media. The extraction also respects `.gitignore`.

This setup uses Graphify's local code extraction. It does not perform semantic analysis of documents or media, or validate model accuracy. Consult [Audit Trail](AUDIT_TRAIL.md) for the deployed workflow and its limitations.

See the official [CLI quickstart](https://docs.graphify.com/open-source/cli-quickstart) for additional query commands.
