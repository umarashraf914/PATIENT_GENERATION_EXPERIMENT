#!/usr/bin/env python3
"""Run repeated Open WebUI symptom-correlation extractions and aggregate them.

This script mirrors the app's compact batched extraction prompt, saves each run
as a separate JSON file, then writes an averaged correlation dataset with
variation statistics.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path


DEFAULT_SYMPTOMS = [
    "오한 (Chills)",
    "발열 (Fever)",
    "두통 (Headache)",
    "콧물 (Runny Nose)",
    "목아픔 (Sore Throat)",
    "기침 (Cough)",
    "가래 (Phlegm)",
    "갈증 (Thirst)",
    "소화불량 (Dyspepsia)",
    "구역구토 (Nausea/Vomiting)",
    "복통 (Abdominal Pain)",
    "설사 (Diarrhea)",
    "변비 (Constipation)",
    "피로 (Fatigue)",
    "무기력 (Lethargy)",
    "불면 (Insomnia)",
    "다몽 (Vivid Dreams)",
    "심계 (Palpitations)",
    "흉민 (Chest Tightness)",
    "숨참 (Dyspnea)",
    "자한 (Spontaneous Sweating)",
    "도한 (Night Sweating)",
    "어지러움 (Dizziness)",
    "이명 (Tinnitus)",
    "요통 (Low Back Pain)",
    "관절통 (Joint Pain)",
    "부종 (Edema)",
    "식욕부진 (Poor Appetite)",
    "구건 (Dry Mouth)",
    "안면홍조 (Facial Flushing)",
]

DEFAULT_BATCH_SIZE = 10
DEFAULT_OUTPUT_ROOT = Path("outputs") / "llm_consistency"


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        values[key.strip()] = value
    return values


def find_project_root(start: Path) -> Path:
    current = start.resolve()
    if current.is_file():
        current = current.parent

    for candidate in (current, *current.parents):
        if (candidate / ".env").exists() or (candidate / "package.json").exists():
            return candidate
    return current


def get_config_value(args_value: str | None, env: dict[str, str], *keys: str) -> str:
    if args_value:
        return args_value
    for key in keys:
        if os.environ.get(key):
            return os.environ[key]
        if env.get(key):
            return env[key]
    return ""


def build_openwebui_chat_url(base_url: str) -> str:
    trimmed = base_url.strip().rstrip("/")
    if not trimmed:
        return ""
    if trimmed.endswith("/api/chat/completions"):
        return trimmed
    if trimmed.endswith("/api"):
        return f"{trimmed}/chat/completions"
    return f"{trimmed}/api/chat/completions"


def pair_key(a: int, b: int) -> str:
    return f"{min(a, b)}-{max(a, b)}"


def build_extraction_batches(symptom_count: int, batch_size: int) -> list[dict[str, object]]:
    chunks = []
    for start in range(0, symptom_count, batch_size):
        end = min(start + batch_size, symptom_count)
        chunks.append(list(range(start, end)))

    batches: list[dict[str, object]] = []
    for i, left_indices in enumerate(chunks):
        for j, right_indices in enumerate(chunks[i:], start=i):
            same_batch = i == j
            expected_pairs = (
                len(left_indices) * (len(left_indices) - 1) // 2
                if same_batch
                else len(left_indices) * len(right_indices)
            )
            if expected_pairs > 0:
                batches.append(
                    {
                        "left_indices": left_indices,
                        "right_indices": right_indices,
                        "same_batch": same_batch,
                        "expected_pairs": expected_pairs,
                    }
                )
    return batches


def build_compact_batch_prompt(
    symptoms: list[str],
    left_indices: list[int],
    right_indices: list[int],
    same_batch: bool,
    expected_pairs: int,
) -> str:
    left_lines = "\n".join(f"{idx}. {symptoms[idx]}" for idx in left_indices)
    right_lines = "\n".join(f"{idx}. {symptoms[idx]}" for idx in right_indices)
    pair_rule = (
        "Required pairs: every unique pair inside the single batch below where a < b."
        if same_batch
        else "Required pairs: every cross-batch pair where a comes from LEFT BATCH and b comes from RIGHT BATCH."
    )
    right_block = "" if same_batch else f"RIGHT BATCH:\n{right_lines}\n\n"

    return f"""You are a Traditional Korean Medicine (TKM) / Traditional Chinese Medicine (TCM) clinical expert.

Estimate symptom-to-symptom correlation coefficients for the required symptom pairs only.

Return ONLY a valid JSON array.
Each element must be:
{{"a": <global_symptom_index>, "b": <global_symptom_index>, "r": <correlation_between_-1_and_1>}}

Rules:
- Include EVERY required pair exactly once.
- Use the global 0-based indices exactly as provided below.
- Do not include note_ko, note_en, explanations, markdown, or extra text.
- Keep the output compact and numeric.
- Use exact 0.00 only when the pair is truly independent or there is no clinically meaningful association.
- For weak but still plausible associations, prefer small non-zero values such as +/-0.02 to +/-0.08 instead of defaulting to 0.00.
- Avoid overusing 0.00 across the matrix.

{pair_rule}
Expected pair count: {expected_pairs}

LEFT BATCH:
{left_lines}

{right_block}Return ONLY the JSON array."""


def extract_chat_completion_text(data: dict) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    content = (choices[0].get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
        return "\n".join(parts)
    return ""


def request_openwebui_text(
    *,
    url: str,
    api_key: str,
    model: str,
    prompt: str,
    temperature: float,
    max_tokens: int,
    timeout: int,
) -> str:
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail[:1000]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Connection error: {exc}") from exc

    data = json.loads(response_body)
    text = extract_chat_completion_text(data)
    if not text.strip():
        raise RuntimeError("No text content found in model response")
    return text


def parse_edges_from_response(text: str, symptom_count: int) -> list[dict[str, object]]:
    json_str = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", json_str)
    if fenced:
        json_str = fenced.group(1).strip()

    arr_start = json_str.find("[")
    arr_end = json_str.rfind("]")
    if arr_start >= 0 and arr_end > arr_start:
        json_str = json_str[arr_start : arr_end + 1]

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError:
        parsed = []
        pattern = re.compile(
            r'\{\s*"a"\s*:\s*(\d+)\s*,\s*"b"\s*:\s*(\d+)\s*,\s*"r"\s*:\s*(-?[\d.]+)\s*\}'
        )
        for match in pattern.finditer(json_str):
            parsed.append(
                {
                    "a": int(match.group(1)),
                    "b": int(match.group(2)),
                    "r": float(match.group(3)),
                }
            )
        if not parsed:
            raise

    edges: list[dict[str, object]] = []
    for item in parsed:
        if isinstance(item, list) and len(item) >= 3:
            a, b, r = item[0], item[1], item[2]
        elif isinstance(item, dict):
            a, b, r = item.get("a"), item.get("b"), item.get("r")
        else:
            continue

        if not isinstance(a, int) or not isinstance(b, int) or not isinstance(r, (int, float)):
            continue
        if a == b or a < 0 or b < 0 or a >= symptom_count or b >= symptom_count:
            continue
        lo, hi = sorted((a, b))
        edges.append({"a": lo, "b": hi, "r": max(-1.0, min(1.0, float(r)))})

    return edges


def ensure_full_edge_coverage(
    symptom_count: int, edges: list[dict[str, object]]
) -> tuple[list[dict[str, object]], int]:
    edge_map: dict[str, dict[str, object]] = {}
    for edge in edges:
        a = int(edge["a"])
        b = int(edge["b"])
        r = float(edge["r"])
        lo, hi = sorted((a, b))
        edge_map[pair_key(lo, hi)] = {"a": lo, "b": hi, "r": r}

    completed = []
    missing = 0
    for a in range(symptom_count):
        for b in range(a + 1, symptom_count):
            key = pair_key(a, b)
            if key in edge_map:
                completed.append(edge_map[key])
            else:
                completed.append({"a": a, "b": b, "r": 0.0})
                missing += 1
    return completed, missing


def load_symptoms(path: Path | None) -> list[str]:
    if path is None:
        return DEFAULT_SYMPTOMS
    symptoms = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(symptoms) < 3:
        raise ValueError("symptoms file must contain at least 3 non-empty lines")
    return symptoms


def run_single_extraction(
    *,
    run_number: int,
    symptoms: list[str],
    batches: list[dict[str, object]],
    url: str,
    api_key: str,
    model: str,
    temperature: float,
    max_tokens: int,
    timeout: int,
    retries: int,
    save_raw: bool,
) -> dict[str, object]:
    collected_edges: list[dict[str, object]] = []
    batch_meta = []
    raw_blocks = []

    for batch_index, batch in enumerate(batches, start=1):
        prompt = build_compact_batch_prompt(
            symptoms,
            batch["left_indices"],  # type: ignore[arg-type]
            batch["right_indices"],  # type: ignore[arg-type]
            bool(batch["same_batch"]),
            int(batch["expected_pairs"]),
        )

        last_error = None
        for attempt in range(1, retries + 2):
            try:
                text = request_openwebui_text(
                    url=url,
                    api_key=api_key,
                    model=model,
                    prompt=prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=timeout,
                )
                edges = parse_edges_from_response(text, len(symptoms))
                collected_edges.extend(edges)
                batch_meta.append(
                    {
                        "batchIndex": batch_index,
                        "expectedPairs": batch["expected_pairs"],
                        "returnedPairs": len(edges),
                        "attempts": attempt,
                    }
                )
                if save_raw:
                    raw_blocks.append(
                        {
                            "batchIndex": batch_index,
                            "expectedPairs": batch["expected_pairs"],
                            "text": text,
                        }
                    )
                break
            except Exception as exc:  # noqa: BLE001 - keep long runs alive and report failures in JSON.
                last_error = str(exc)
                if attempt <= retries:
                    time.sleep(min(2 * attempt, 10))
                    continue
                raise RuntimeError(f"run {run_number}, batch {batch_index} failed: {last_error}") from exc

    completed_edges, filled_missing_pairs = ensure_full_edge_coverage(len(symptoms), collected_edges)
    result: dict[str, object] = {
        "metadata": {
            "runNumber": run_number,
            "model": model,
            "temperature": temperature,
            "batchCount": len(batches),
            "expectedPairs": len(symptoms) * (len(symptoms) - 1) // 2,
            "edgeCount": len(completed_edges),
            "filledMissingPairs": filled_missing_pairs,
            "createdAt": datetime.now().isoformat(timespec="seconds"),
        },
        "symptoms": [{"index": idx, "label": label} for idx, label in enumerate(symptoms)],
        "correlations": completed_edges,
        "batches": batch_meta,
    }
    if save_raw:
        result["rawResponses"] = raw_blocks
    return result


def aggregate_run_files(run_files: list[Path], symptoms: list[str]) -> dict[str, object]:
    values: dict[str, list[float]] = {}
    for run_file in run_files:
        data = json.loads(run_file.read_text(encoding="utf-8"))
        for edge in data.get("correlations", []):
            key = pair_key(int(edge["a"]), int(edge["b"]))
            values.setdefault(key, []).append(float(edge["r"]))

    correlations = []
    for a in range(len(symptoms)):
        for b in range(a + 1, len(symptoms)):
            vals = values.get(pair_key(a, b), [])
            if not vals:
                vals = [0.0]
            mean = statistics.fmean(vals)
            population_sd = statistics.pstdev(vals) if len(vals) > 1 else 0.0
            sample_sd = statistics.stdev(vals) if len(vals) > 1 else 0.0
            correlations.append(
                {
                    "a": a,
                    "b": b,
                    "meanR": round(mean, 6),
                    "populationSd": round(population_sd, 6),
                    "sampleSd": round(sample_sd, 6),
                    "minR": round(min(vals), 6),
                    "maxR": round(max(vals), 6),
                    "nonZeroRate": round(sum(abs(v) >= 0.001 for v in vals) / len(vals), 6),
                    "runs": len(vals),
                }
            )

    sd_values = [edge["populationSd"] for edge in correlations]
    return {
        "metadata": {
            "aggregatedAt": datetime.now().isoformat(timespec="seconds"),
            "runCount": len(run_files),
            "symptomCount": len(symptoms),
            "pairCount": len(correlations),
            "meanPopulationSd": round(statistics.fmean(sd_values), 6) if sd_values else 0.0,
            "maxPopulationSd": round(max(sd_values), 6) if sd_values else 0.0,
        },
        "symptoms": [{"index": idx, "label": label} for idx, label in enumerate(symptoms)],
        "correlations": correlations,
    }


def existing_run_files(runs_dir: Path) -> list[Path]:
    return sorted(runs_dir.glob("run_*.json"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run repeated Open WebUI symptom-correlation extraction and aggregate mean/std values."
    )
    parser.add_argument("--runs", type=int, default=100, help="Number of completed run JSON files to produce.")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT, help="Root output directory.")
    parser.add_argument("--session-dir", type=Path, default=None, help="Existing or new session directory to use/resume.")
    parser.add_argument("--symptoms-file", type=Path, default=None, help="Optional one-symptom-per-line input file.")
    parser.add_argument("--base-url", default=None, help="Open WebUI base URL. Defaults to .env VITE_OPENWEBUI_BASE_URL.")
    parser.add_argument("--api-key", default=None, help="Open WebUI API key. Defaults to env or .env.")
    parser.add_argument("--model", default=None, help="Open WebUI model id. Defaults to .env VITE_OPENWEBUI_MODEL.")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Symptom batch size.")
    parser.add_argument("--temperature", type=float, default=0.1, help="Sampling temperature.")
    parser.add_argument("--max-tokens", type=int, default=12000, help="Max output tokens per batch request.")
    parser.add_argument("--timeout", type=int, default=900, help="HTTP timeout in seconds per batch request.")
    parser.add_argument("--retries", type=int, default=2, help="Retries per failed batch.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Seconds to pause between completed runs.")
    parser.add_argument("--save-raw", action="store_true", help="Store raw model text in each run file.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.runs < 1:
        raise ValueError("--runs must be at least 1")
    if args.batch_size < 2:
        raise ValueError("--batch-size must be at least 2")

    repo_root = find_project_root(Path.cwd())
    env_path = repo_root / ".env"
    env = read_env_file(env_path)
    base_url = get_config_value(args.base_url, env, "OPENWEBUI_BASE_URL", "VITE_OPENWEBUI_BASE_URL")
    api_key = get_config_value(args.api_key, env, "OPENWEBUI_API_KEY", "VITE_OPENWEBUI_API_KEY")
    model = get_config_value(args.model, env, "OPENWEBUI_MODEL", "VITE_OPENWEBUI_MODEL")
    chat_url = build_openwebui_chat_url(base_url)

    missing = [
        name
        for name, value in [
            ("Open WebUI base URL", chat_url),
            ("Open WebUI API key", api_key),
            ("Open WebUI model", model),
        ]
        if not value
    ]
    if missing:
        print("Missing required setting(s): " + ", ".join(missing), file=sys.stderr)
        print("Set them in .env or pass --base-url, --api-key, and --model.", file=sys.stderr)
        return 2

    symptoms = load_symptoms(args.symptoms_file)
    batches = build_extraction_batches(len(symptoms), args.batch_size)
    expected_pairs = len(symptoms) * (len(symptoms) - 1) // 2

    output_root = args.output_root if args.output_root.is_absolute() else repo_root / args.output_root
    session_dir = args.session_dir
    if session_dir is None:
        session_name = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_dir = output_root / session_name
    elif not session_dir.is_absolute():
        session_dir = repo_root / session_dir
    runs_dir = session_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)

    config = {
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "baseUrl": base_url,
        "chatUrl": chat_url,
        "model": model,
        "runsTarget": args.runs,
        "temperature": args.temperature,
        "maxTokens": args.max_tokens,
        "timeout": args.timeout,
        "batchSize": args.batch_size,
        "batchCount": len(batches),
        "symptomCount": len(symptoms),
        "expectedPairsPerRun": expected_pairs,
        "saveRaw": args.save_raw,
    }
    (session_dir / "config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    (session_dir / "symptoms.json").write_text(
        json.dumps([{"index": idx, "label": label} for idx, label in enumerate(symptoms)], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Session: {session_dir}")
    print(f"Env file: {env_path if env_path.exists() else 'not found'}")
    print(f"Model: {model}")
    print(f"Runs target: {args.runs}")
    print(f"Batches per run: {len(batches)}")
    print(f"Pairs per run: {expected_pairs}")

    completed_files = existing_run_files(runs_dir)
    completed_numbers = {
        int(match.group(1))
        for file in completed_files
        if (match := re.search(r"run_(\d+)\.json$", file.name))
    }

    for run_number in range(1, args.runs + 1):
        run_path = runs_dir / f"run_{run_number:04d}.json"
        if run_number in completed_numbers and run_path.exists():
            print(f"[{run_number}/{args.runs}] already exists, skipping")
            continue

        started = time.time()
        print(f"[{run_number}/{args.runs}] running...", flush=True)
        try:
            result = run_single_extraction(
                run_number=run_number,
                symptoms=symptoms,
                batches=batches,
                url=chat_url,
                api_key=api_key,
                model=model,
                temperature=args.temperature,
                max_tokens=args.max_tokens,
                timeout=args.timeout,
                retries=args.retries,
                save_raw=args.save_raw,
            )
        except Exception as exc:  # noqa: BLE001 - write failure file and keep the long job inspectable.
            failure_path = runs_dir / f"run_{run_number:04d}_FAILED.json"
            failure = {
                "runNumber": run_number,
                "failedAt": datetime.now().isoformat(timespec="seconds"),
                "error": str(exc),
            }
            failure_path.write_text(json.dumps(failure, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[{run_number}/{args.runs}] FAILED: {exc}", file=sys.stderr)
            return 1

        run_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        elapsed = time.time() - started
        missing_pairs = result["metadata"]["filledMissingPairs"]  # type: ignore[index]
        print(f"[{run_number}/{args.runs}] saved {run_path.name} in {elapsed:.1f}s, missing filled={missing_pairs}")

        if args.sleep and run_number < args.runs:
            time.sleep(args.sleep)

    run_files = existing_run_files(runs_dir)[: args.runs]
    aggregate = aggregate_run_files(run_files, symptoms)
    aggregate_path = session_dir / "aggregate_mean_sd.json"
    aggregate_path.write_text(json.dumps(aggregate, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Aggregate saved: {aggregate_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
