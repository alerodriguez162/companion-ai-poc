import httpx
import json
import os
import statistics
import time
from pathlib import Path

API_BASE = os.getenv("API_BASE", "http://localhost:3001").rstrip("/")
RESULTS_DIR = Path(__file__).resolve().parents[1] / "results"


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((q / 100) * (len(ordered) - 1)))))
    return ordered[index]


def load_scenario(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def send_message(client: httpx.Client, conversation_id: str, content: str) -> tuple[str, float]:
    started = time.perf_counter()
    with client.stream(
        "POST",
        f"{API_BASE}/api/conversations/{conversation_id}/messages",
        json={"content": content},
        timeout=180,
    ) as response:
        response.raise_for_status()
        text = []
        event = "message"
        for line in response.iter_lines():
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:") and event == "token":
                token = json.loads(line[5:].strip())
                if isinstance(token, str):
                    text.append(token)
            elif line.startswith("data:") and event == "error":
                raise RuntimeError(line[5:].strip())
        latency_ms = (time.perf_counter() - started) * 1000
        return "".join(text), latency_ms


def evaluate(scenario: dict) -> dict:
    latencies: list[float] = []
    answers: dict[str, str] = {}
    with httpx.Client() as client:
        created = client.post(f"{API_BASE}/api/characters", json=scenario["character"])
        created.raise_for_status()
        character_id = created.json()["id"]
        convo = client.post(f"{API_BASE}/api/characters/{character_id}/conversations")
        convo.raise_for_status()
        conversation_id = convo.json()["id"]

        for step in scenario["steps"]:
            reply, latency_ms = send_message(client, conversation_id, step["content"])
            latencies.append(latency_ms)
            if "expectContains" in step:
                answers[step["id"]] = reply

        debug = client.get(f"{API_BASE}/api/conversations/{conversation_id}/debug")
        debug.raise_for_status()
        debug_payload = debug.json()

    checks = []
    for step in scenario["steps"]:
        expected = step.get("expectContains")
        if not expected:
            continue
        reply = answers.get(step["id"], "")
        checks.append(expected.lower() in reply.lower())

    recall = sum(1 for item in checks if item) / len(checks) if checks else None
    result = {
        "scenario": scenario["id"],
        "messages": len(scenario["steps"]),
        "memoryRecall": recall,
        "contradictions": None,
        "averageLatencyMs": statistics.mean(latencies) if latencies else 0,
        "p50LatencyMs": percentile(latencies, 50),
        "p95LatencyMs": percentile(latencies, 95),
        "model": (debug_payload.get("lastDebug") or {}).get("metrics", {}).get("model"),
        "contextSize": (debug_payload.get("lastDebug") or {}).get("metrics", {}).get("extra", {}).get("contextSize"),
        "approximateContextChars": (debug_payload.get("lastDebug") or {}).get("approximateContextChars"),
        "metricNotes": {
            "memoryRecall": "Fraction of expectContains probes found in the assistant reply (case-insensitive substring).",
            "characterConsistency": "Not auto-scored. Inspect replies against the character card.",
            "storyContinuity": "Not auto-scored. Inspect debug.storyState.openThreads.",
            "contradictions": "Manual for this PoC; left null unless a checker is added.",
        },
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / f"{scenario['id']}.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> None:
    scenarios_dir = Path(__file__).resolve().parents[1] / "scenarios"
    for path in sorted(scenarios_dir.glob("*.json")):
        print(json.dumps(evaluate(load_scenario(path)), indent=2))


if __name__ == "__main__":
    main()
