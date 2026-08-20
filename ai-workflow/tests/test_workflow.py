from __future__ import annotations

import json
import sys
from pathlib import Path


WORKFLOW_ROOT = Path(__file__).resolve().parents[1]
SRC = WORKFLOW_ROOT / "src"
sys.path.insert(0, str(SRC))

from aquaivolt_langgraph_backend import build_workflow  # noqa: E402


def run_once(output_dir: Path) -> dict:
    sample = json.loads(
        (WORKFLOW_ROOT / "sample_input.json").read_text(encoding="utf-8")
    )
    return build_workflow().invoke(
        {
            "run_id": "reproducibility-test",
            "started_at": "2026-08-20T00:00:00+00:00",
            "input": sample,
            "trace": [],
            "output_dir": str(output_dir),
        }
    )


def main() -> int:
    output_dir = WORKFLOW_ROOT / "test-evidence"
    first = run_once(output_dir)
    second = run_once(output_dir)
    assert first["metrics"] == second["metrics"], "Identical inputs must return identical model metrics"
    assert first["selected_model"] == "gradient_boosting_anchor"
    assert first["recommendation"]["searched_candidates"] == 400
    assert len(first["trace"]) == 9
    print("PASS: identical inputs produced identical outputs")
    print(json.dumps(first["metrics"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
