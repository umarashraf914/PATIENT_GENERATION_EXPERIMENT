# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Project Is

A client-side React research tool for exploring symptom correlations in Traditional Korean Medicine (TKM). It lets researchers:
1. Extract symptom correlation matrices from LLMs (Gemini API called directly from the browser)
2. Simulate conditional symptom probabilities using two models side-by-side (Multivariate Gaussian vs Naive Average)

The app is a pure SPA with no backend. All computation (matrix inversion, Gaussian conditionals, force-directed layout) happens in-browser.

## Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build to dist/
npm run preview  # Serve the production build locally
npm run lint     # ESLint (flat config, React hooks + refresh rules)
```

No test framework is configured.

## Architecture

**Data flow:** `ModelExtractionTab` extracts `{symptoms[], edges[]}` from an LLM → passes up to `App` via `onDataExtracted` → flows down to both `SymptomSimulator` (Gaussian) and `NaiveSimulator` (Naive) tabs. All three tabs stay mounted (hidden via CSS `display`) to preserve state when switching.

**Core data structures:**
- `symptoms`: string array of `"한국어 (English)"` formatted names — indices are the primary identifiers throughout
- `edges`: `{a, b, r, note_ko, note_en}` — `a`/`b` are symptom indices, `r` is correlation coefficient
- Hardcoded reference data lives in `src/data/symptomNetwork.js`: 38 symptoms, 51 correlations from a 400-patient chart review, plus Bagang (Eight Principles) associations

**Key math in SymptomSimulator (Gaussian tab):**
- Builds full NxN correlation matrix from sparse edges
- Given selected symptoms A, computes P(B|A) via: `R_AA` inversion (Gauss-Jordan), conditional mean/variance, then `normalCDF(mu/sigma)`
- Regularization parameter `lambda` scales with number of selected symptoms to stabilize the matrix inverse
- Each symptom row is expandable to show the full computation breakdown (contributions table, conditional distribution, bell curve SVG)

**NaiveSimulator** uses simple `P = (1 + avg_r) / 2` for comparison — intentionally limited to demonstrate why the Gaussian approach is better.

**ModelExtractionTab** calls Gemini API directly (`generativelanguage.googleapis.com`), parses JSON from LLM response with regex fallback for truncated outputs, and includes a force-directed graph layout with draggable nodes.

## Tech Stack

- React 19 (JSX, no TypeScript)
- Vite 8 with `@vitejs/plugin-react`
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin, imported as `@import "tailwindcss"` in index.css)
- lucide-react for icons
- No routing library, no state management library — just React useState/useMemo/useCallback

## Conventions

- UI text is bilingual Korean/English. Korean is primary for labels; English in parentheses. Use the pattern `한국어 (English)` for symptom names.
- Symptom names are parsed with regex: `getKorean(s)` extracts text before the first space/paren, `getEnglish(s)` extracts the parenthesized portion.
- Tailwind classes use very small text sizes (`text-[8px]`, `text-[9px]`, `text-[10px]`) for information-dense panels.
- SVG is used for all visualizations (circular network, bell curves) — no charting library.
- The Gemini API key can be set via `VITE_GEMINI_API_KEY` env var or entered in the UI at runtime.
