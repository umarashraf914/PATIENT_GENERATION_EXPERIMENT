#!/usr/bin/env python3
"""Render saved LLM consistency JSON runs as large annotated heatmap PNGs."""

from __future__ import annotations

import argparse
import json
import re
import statistics
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.font_manager as fm
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap


OUTPUT_ROOT = Path("outputs") / "llm_consistency"
MALGUN_FONT = Path("C:/Windows/Fonts/malgun.ttf")
MALGUN_BOLD_FONT = Path("C:/Windows/Fonts/malgunbd.ttf")


def find_project_root(start: Path) -> Path:
    current = start.resolve()
    if current.is_file():
        current = current.parent
    for candidate in (current, *current.parents):
        if (candidate / "package.json").exists() or (candidate / "outputs").exists():
            return candidate
    return current


def find_latest_session(root: Path) -> Path:
    sessions_root = root / OUTPUT_ROOT
    sessions = [path for path in sessions_root.iterdir() if path.is_dir()] if sessions_root.exists() else []
    valid = [path for path in sessions if (path / "runs").exists()]
    if not valid:
        raise FileNotFoundError(f"No consistency sessions found under {sessions_root}")
    return max(valid, key=lambda path: path.stat().st_mtime)


def load_run_files(session_dir: Path, limit: int | None) -> list[Path]:
    run_files = sorted((session_dir / "runs").glob("run_*.json"))
    run_files = [path for path in run_files if "_FAILED" not in path.name]
    if limit is not None:
        run_files = run_files[:limit]
    if not run_files:
        raise FileNotFoundError(f"No run_*.json files found in {session_dir / 'runs'}")
    return run_files


def korean_label(label: str) -> str:
    match = re.match(r"^([^\s(]+)", label)
    return match.group(1) if match else label


def pair_key(a: int, b: int) -> str:
    return f"{min(a, b)}-{max(a, b)}"


def matrix_from_correlations(
    symptoms: list[dict[str, object]],
    correlations: list[dict[str, object]],
    value_key: str,
) -> np.ndarray:
    n = len(symptoms)
    matrix = np.zeros((n, n), dtype=float)
    np.fill_diagonal(matrix, 1.0)
    for edge in correlations:
        a = int(edge["a"])
        b = int(edge["b"])
        value = float(edge[value_key])
        if 0 <= a < n and 0 <= b < n and a != b:
            matrix[a, b] = value
            matrix[b, a] = value
    return matrix


def average_runs(run_files: list[Path]) -> dict[str, object]:
    first = json.loads(run_files[0].read_text(encoding="utf-8"))
    symptoms = first["symptoms"]
    values: dict[str, list[float]] = {}

    for run_file in run_files:
        data = json.loads(run_file.read_text(encoding="utf-8"))
        for edge in data["correlations"]:
            key = pair_key(int(edge["a"]), int(edge["b"]))
            values.setdefault(key, []).append(float(edge["r"]))

    correlations = []
    n = len(symptoms)
    for a in range(n):
        for b in range(a + 1, n):
            vals = values.get(pair_key(a, b), [0.0])
            correlations.append(
                {
                    "a": a,
                    "b": b,
                    "meanR": round(statistics.fmean(vals), 6),
                    "populationSd": round(statistics.pstdev(vals), 6) if len(vals) > 1 else 0.0,
                    "sampleSd": round(statistics.stdev(vals), 6) if len(vals) > 1 else 0.0,
                    "minR": round(min(vals), 6),
                    "maxR": round(max(vals), 6),
                    "nonZeroRate": round(sum(abs(v) >= 0.001 for v in vals) / len(vals), 6),
                    "runs": len(vals),
                }
            )

    sd_values = [float(edge["populationSd"]) for edge in correlations]
    return {
        "metadata": {
            "createdAt": datetime.now().isoformat(timespec="seconds"),
            "runCount": len(run_files),
            "symptomCount": n,
            "pairCount": len(correlations),
            "meanPopulationSd": round(statistics.fmean(sd_values), 6) if sd_values else 0.0,
            "maxPopulationSd": round(max(sd_values), 6) if sd_values else 0.0,
        },
        "symptoms": symptoms,
        "correlations": correlations,
    }


def make_font_properties() -> tuple[fm.FontProperties, fm.FontProperties]:
    regular = fm.FontProperties(fname=str(MALGUN_FONT)) if MALGUN_FONT.exists() else fm.FontProperties()
    bold = fm.FontProperties(fname=str(MALGUN_BOLD_FONT)) if MALGUN_BOLD_FONT.exists() else regular
    plt.rcParams["axes.unicode_minus"] = False
    return regular, bold


def draw_heatmap(
    *,
    symptoms: list[dict[str, object]],
    matrix: np.ndarray,
    title: str,
    subtitle: str,
    output_path: Path,
    cell_px: int,
    dpi: int,
    value_decimals: int,
) -> None:
    font_regular, font_bold = make_font_properties()
    labels = [korean_label(str(item["label"])) for item in symptoms]
    n = len(labels)

    matrix_px = n * cell_px
    left_px = 190
    top_px = 310
    right_px = 230
    bottom_px = 100
    width_px = left_px + matrix_px + right_px
    height_px = top_px + matrix_px + bottom_px

    fig = plt.figure(figsize=(width_px / dpi, height_px / dpi), dpi=dpi, facecolor="#f8fafc")
    fig.subplots_adjust(left=0, right=1, bottom=0, top=1)

    ax_left = left_px / width_px
    ax_bottom = bottom_px / height_px
    ax_width = matrix_px / width_px
    ax_height = matrix_px / height_px
    ax = fig.add_axes([ax_left, ax_bottom, ax_width, ax_height])

    cmap = LinearSegmentedColormap.from_list(
        "tkm_corr",
        [
            (0.0, "#ef4444"),
            (0.42, "#fecaca"),
            (0.5, "#ffffff"),
            (0.58, "#c7d2fe"),
            (1.0, "#6366f1"),
        ],
    )
    image = ax.imshow(matrix, cmap=cmap, vmin=-1, vmax=1, interpolation="nearest")

    ax.set_xticks([])
    ax.set_yticks(np.arange(n))
    ax.set_yticklabels(labels, fontproperties=font_bold, fontsize=12)
    ax.tick_params(left=True, right=False, labelleft=True, length=0, pad=12)

    for col, label in enumerate(labels):
        ax.text(
            col,
            -1.65,
            label,
            rotation=90,
            ha="center",
            va="bottom",
            fontsize=12,
            fontproperties=font_bold,
            color="#0f172a",
            clip_on=False,
        )

    ax.set_xticks(np.arange(-0.5, n, 1), minor=True)
    ax.set_yticks(np.arange(-0.5, n, 1), minor=True)
    ax.grid(which="minor", color="#eef2f7", linestyle="-", linewidth=0.9)
    ax.tick_params(which="minor", bottom=False, left=False)
    for spine in ax.spines.values():
        spine.set_color("#dbe4ef")
        spine.set_linewidth(1.0)

    annotation_size = max(5, min(9, cell_px * 0.19))
    for row in range(n):
        for col in range(n):
            value = matrix[row, col]
            text_color = "white" if abs(value) >= 0.48 else "#0f172a"
            ax.text(
                col,
                row,
                f"{value:.{value_decimals}f}",
                ha="center",
                va="center",
                fontsize=annotation_size,
                fontproperties=font_bold,
                color=text_color,
            )

    title_x = 34 / width_px
    fig.text(title_x, 0.965, title, fontproperties=font_bold, fontsize=21, color="#0f172a", va="top")
    fig.text(title_x, 0.928, subtitle, fontproperties=font_regular, fontsize=13, color="#64748b", va="top")

    cbar_left = (left_px + matrix_px + 62) / width_px
    cbar_bottom = (bottom_px + matrix_px * 0.08) / height_px
    cbar_height = matrix_px * 0.84 / height_px
    cbar_ax = fig.add_axes([cbar_left, cbar_bottom, 0.028, cbar_height])
    cbar = fig.colorbar(image, cax=cbar_ax, ticks=[1, 0.5, 0, -0.5, -1])
    cbar.outline.set_edgecolor("#e2e8f0")
    cbar.outline.set_linewidth(1)
    cbar_ax.tick_params(labelsize=10, colors="#64748b", length=0, pad=8)
    for tick in cbar_ax.get_yticklabels():
        tick.set_fontproperties(font_regular)

    fig.text(cbar_left, cbar_bottom + cbar_height + 0.03, "상관계수", fontproperties=font_bold, fontsize=12, color="#64748b")
    fig.text(cbar_left, cbar_bottom - 0.045, "파랑 = 양의 상관\n빨강 = 음의 상관", fontproperties=font_regular, fontsize=9, color="#94a3b8")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=dpi, facecolor=fig.get_facecolor(), bbox_inches=None)
    plt.close(fig)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render LLM consistency runs as annotated Korean heatmap PNG files.")
    parser.add_argument("--session-dir", type=Path, default=None, help="Session directory containing runs/. Defaults to latest.")
    parser.add_argument("--out-dir", type=Path, default=None, help="Output directory. Defaults to <session>/heatmaps.")
    parser.add_argument("--limit", type=int, default=None, help="Only render the first N run files.")
    parser.add_argument("--cell-px", type=int, default=42, help="Pixel size of each heatmap cell.")
    parser.add_argument("--dpi", type=int, default=160, help="PNG DPI.")
    parser.add_argument("--value-decimals", type=int, default=1, help="Decimals printed inside each cell.")
    parser.add_argument("--skip-run-pngs", action="store_true", help="Only render the average heatmap.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = find_project_root(Path.cwd())
    session_dir = args.session_dir
    if session_dir is None:
        session_dir = find_latest_session(root)
    elif not session_dir.is_absolute():
        session_dir = root / session_dir

    out_dir = args.out_dir
    if out_dir is None:
        out_dir = session_dir / "heatmaps"
    elif not out_dir.is_absolute():
        out_dir = root / out_dir

    run_files = load_run_files(session_dir, args.limit)
    average_data = average_runs(run_files)
    average_json = out_dir / "average_heatmap_data.json"
    average_json.parent.mkdir(parents=True, exist_ok=True)
    average_json.write_text(json.dumps(average_data, ensure_ascii=False, indent=2), encoding="utf-8")

    if not args.skip_run_pngs:
        run_png_dir = out_dir / "runs"
        for index, run_file in enumerate(run_files, start=1):
            data = json.loads(run_file.read_text(encoding="utf-8"))
            symptoms = data["symptoms"]
            matrix = matrix_from_correlations(symptoms, data["correlations"], "r")
            run_number = int(data.get("metadata", {}).get("runNumber", index))
            title = f"LLM 증상 상관관계 히트맵 Run {run_number:04d}"
            subtitle = f"{data.get('metadata', {}).get('model', 'model')} | 증상 {len(symptoms)}개 | 개별 추출 결과"
            output_path = run_png_dir / f"run_{run_number:04d}.png"
            draw_heatmap(
                symptoms=symptoms,
                matrix=matrix,
                title=title,
                subtitle=subtitle,
                output_path=output_path,
                cell_px=args.cell_px,
                dpi=args.dpi,
                value_decimals=args.value_decimals,
            )
            print(f"[{index}/{len(run_files)}] saved {output_path}")

    avg_matrix = matrix_from_correlations(average_data["symptoms"], average_data["correlations"], "meanR")
    avg_png = out_dir / "average_heatmap.png"
    draw_heatmap(
        symptoms=average_data["symptoms"],
        matrix=avg_matrix,
        title=f"평균 증상 상관관계 히트맵 ({len(run_files)}회 평균)",
        subtitle=f"{len(run_files)}개 LLM 추출 결과의 평균 r 값",
        output_path=avg_png,
        cell_px=args.cell_px,
        dpi=args.dpi,
        value_decimals=args.value_decimals,
    )
    print(f"Average data saved: {average_json}")
    print(f"Average heatmap saved: {avg_png}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
