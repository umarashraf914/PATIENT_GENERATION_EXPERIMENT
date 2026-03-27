import React, { useState, useMemo, useCallback } from 'react';
import { Activity, RotateCcw, Zap, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#0ea5e9', '#f97316', '#14b8a6', '#a855f7', '#22c55e', '#e11d48',
  '#06b6d4', '#d97706', '#7c3aed', '#059669', '#dc2626', '#2563eb',
  '#ca8a04', '#9333ea', '#0d9488', '#db2777', '#65a30d', '#4f46e5',
  '#ea580c', '#16a34a', '#be185d', '#1d4ed8', '#b45309', '#7e22ce',
];

function getProbColor(prob) {
  if (prob >= 0.75) return '#16a34a';
  if (prob >= 0.6) return '#22c55e';
  if (prob >= 0.45) return '#94a3b8';
  if (prob >= 0.3) return '#f97316';
  return '#ef4444';
}

function getProbBg(prob) {
  if (prob >= 0.75) return '#f0fdf4';
  if (prob >= 0.6) return '#f0fdf4';
  if (prob >= 0.45) return '#f8fafc';
  if (prob >= 0.3) return '#fff7ed';
  return '#fef2f2';
}

// ─── Math: Normal distribution ───
function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function normalPDF(x, mean, std) {
  const z = (x - mean) / std;
  return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
}

// ─── Math: Build full correlation matrix ───
function buildCorrMatrix(n, edges) {
  const R = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
  );
  edges.forEach(e => {
    if (e.a >= 0 && e.a < n && e.b >= 0 && e.b < n) {
      R[e.a][e.b] = e.r;
      R[e.b][e.a] = e.r;
    }
  });
  return R;
}

// ─── Math: Matrix inverse via Gauss-Jordan ───
function invertMatrix(M) {
  const n = M.length;
  const aug = M.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < n; col++) {
    let maxVal = Math.abs(aug[col][col]), maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) { maxVal = Math.abs(aug[row][col]); maxRow = row; }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) return null;
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map(row => row.slice(n));
}

// ─── Math: Compute conditional probabilities ───
// Given full correlation matrix R and selected indices A (set to "present" = z=1),
// compute for each unselected symptom B:
//   μ_B|A = R_BA × R_AA⁻¹ × x_A   (x_A = [1,1,...,1])
//   σ²_B|A = diag(R_BB - R_BA × R_AA⁻¹ × R_AB)
//   P(B present) = Φ(μ / σ)
function computeConditional(corrMatrix, selectedIndices, n) {
  const selArr = Array.from(selectedIndices).sort((a, b) => a - b);
  const nSel = selArr.length;

  if (nSel === 0) return null;

  // Build R_AA with regularization
  const R_AA = selArr.map(i => selArr.map(j => corrMatrix[i][j] + (i === j ? 0.001 : 0)));
  const R_AA_inv = invertMatrix(R_AA);
  if (!R_AA_inv) return null;

  // x_A = [1, 1, ..., 1] — "present" means 1 SD above mean
  const xA = Array(nSel).fill(1);

  // weights = R_AA⁻¹ × x_A
  const weights = R_AA_inv.map(row => row.reduce((s, v, j) => s + v * xA[j], 0));

  // For each unselected symptom, compute conditional
  const results = [];
  for (let bIdx = 0; bIdx < n; bIdx++) {
    if (selectedIndices.has(bIdx)) {
      results.push({ idx: bIdx, selected: true, prob: 1.0 });
      continue;
    }

    // R_BA row for this symptom
    const rBA = selArr.map(aIdx => corrMatrix[bIdx][aIdx]);

    // Conditional mean: μ = rBA · weights
    const condMean = rBA.reduce((s, r, j) => s + r * weights[j], 0);

    // Conditional variance: σ² = 1 - rBA · R_AA⁻¹ · rBA^T
    // R_AA⁻¹ × rBA^T
    const RinvRab = R_AA_inv.map(row => row.reduce((s, v, j) => s + v * rBA[j], 0));
    const varReduction = rBA.reduce((s, r, j) => s + r * RinvRab[j], 0);
    const condVar = Math.max(0.01, 1 - varReduction);
    const condStd = Math.sqrt(condVar);

    // P(present) = Φ(μ/σ)
    const prob = Math.max(0.005, Math.min(0.995, normalCDF(condMean / condStd)));

    // Per-selected-symptom contributions for equation display
    const contributions = selArr.map((aIdx, j) => ({
      selectedIdx: aIdx,
      r: rBA[j],
      weight: weights[j],
      contribution: rBA[j] * weights[j],
    }));

    results.push({
      idx: bIdx,
      selected: false,
      prob,
      condMean,
      condStd,
      condVar,
      contributions,
      hasData: rBA.some(r => r !== 0),
    });
  }

  return { results, weights, selArr };
}

// ─── Component: Mini bell curve ───
function MiniDistribution({ mean, std, prob }) {
  const W = 130, H = 38;
  const xMin = -3, xMax = 3;
  const steps = 60;
  const toX = (x) => ((x - xMin) / (xMax - xMin)) * W;

  // Compute max PDF for scaling
  const peakY = normalPDF(mean, mean, std);

  const toY = (pdfVal) => H - 4 - (pdfVal / peakY) * (H - 8);

  // Full curve points
  const curvePts = [];
  for (let i = 0; i <= steps; i++) {
    const x = xMin + (xMax - xMin) * i / steps;
    curvePts.push(`${toX(x).toFixed(1)},${toY(normalPDF(x, mean, std)).toFixed(1)}`);
  }

  // Shaded area (right of 0 = "present")
  const shadePts = [];
  const x0 = Math.max(0, xMin);
  for (let i = 0; i <= 40; i++) {
    const x = x0 + (xMax - x0) * i / 40;
    shadePts.push(`${toX(x).toFixed(1)},${toY(normalPDF(x, mean, std)).toFixed(1)}`);
  }
  const shadeD = `M ${toX(x0).toFixed(1)},${(H - 4).toFixed(1)} L ${shadePts.join(' L ')} L ${toX(xMax).toFixed(1)},${(H - 4).toFixed(1)} Z`;

  const threshX = toX(0);
  const meanX = toX(mean);

  return (
    <svg width={W} height={H} className="flex-shrink-0">
      {/* Shaded area = probability */}
      <path d={shadeD} fill={prob > 0.5 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)'} />
      {/* Curve */}
      <polyline points={curvePts.join(' ')} fill="none" stroke="#6366f1" strokeWidth={1.5} />
      {/* Threshold at x=0 */}
      <line x1={threshX} y1={0} x2={threshX} y2={H} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="3 2" />
      {/* Mean marker */}
      <line x1={meanX} y1={H - 4} x2={meanX} y2={toY(peakY)} stroke="#6366f1" strokeWidth={1} opacity={0.5} />
      <circle cx={meanX} cy={toY(peakY)} r={2} fill="#6366f1" />
      {/* Labels */}
      <text x={threshX + 2} y={9} className="text-[7px]" fill="#94a3b8">0</text>
      <text x={meanX + 3} y={H - 6} className="text-[7px] font-bold" fill="#6366f1">
        {mean >= 0 ? '+' : ''}{mean.toFixed(2)}
      </text>
    </svg>
  );
}

// ─── Component: Equation breakdown ───
function EquationBreakdown({ item, symptoms, selArr }) {
  const { contributions, condMean, condStd, prob } = item;
  const getKorean = (s) => s.match(/^([^\s(]+)/)?.[1] || s.substring(0, 3);

  return (
    <div className="mt-2 p-3 bg-slate-50 rounded-xl text-[9px] space-y-2.5 border border-slate-200">
      {/* Step 1: Contributions table */}
      <div>
        <div className="font-black text-slate-500 uppercase tracking-wider mb-1.5">
          Step 1: r(상관계수) x w(가중치) = 기여도
        </div>
        <div className="bg-white rounded-lg border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-[8px] text-slate-400 font-bold">
                <th className="text-left px-2 py-1">선택 증상</th>
                <th className="text-right px-2 py-1">r</th>
                <th className="text-right px-2 py-1">w</th>
                <th className="text-right px-2 py-1">r x w</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((c, i) => (
                <tr key={i} className="border-t border-slate-50">
                  <td className="px-2 py-1 font-bold text-slate-600">
                    {getKorean(symptoms[c.selectedIdx])}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-slate-500">
                    {c.r.toFixed(3)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-slate-500">
                    {c.weight.toFixed(3)}
                  </td>
                  <td className={`px-2 py-1 text-right font-mono font-black ${
                    c.contribution > 0.01 ? 'text-green-600' : c.contribution < -0.01 ? 'text-red-600' : 'text-slate-400'
                  }`}>
                    {c.contribution > 0 ? '+' : ''}{c.contribution.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1 text-[8px] text-slate-400 italic">
          w = R_AA⁻¹ x [1,1,...] — 선택 증상 간 상관을 보정한 유효 가중치
        </div>
      </div>

      {/* Step 2: Conditional mean + std */}
      <div className="bg-white p-2.5 rounded-lg border border-slate-100 space-y-1">
        <div className="font-black text-slate-500 uppercase tracking-wider text-[8px]">
          Step 2: 조건부 분포
        </div>
        <div className="font-mono text-[10px]">
          <span className="text-slate-500">μ = </span>
          <span className="text-slate-400">
            {contributions.map((c, i) => (
              <span key={i}>
                {i > 0 && ' + '}
                <span className={c.contribution >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {c.contribution.toFixed(3)}
                </span>
              </span>
            ))}
          </span>
          <span className="text-slate-500"> = </span>
          <span className="font-black text-indigo-600">{condMean.toFixed(3)}</span>
        </div>
        <div className="font-mono text-[10px]">
          <span className="text-slate-500">σ = √(1 - variance reduction) = </span>
          <span className="font-black text-slate-700">{condStd.toFixed(3)}</span>
        </div>
      </div>

      {/* Step 3: Distribution visualization */}
      <div className="bg-white p-2.5 rounded-lg border border-slate-100">
        <div className="font-black text-slate-500 uppercase tracking-wider text-[8px] mb-1">
          Step 3: 확률 계산
        </div>
        <div className="flex items-center gap-3">
          <MiniDistribution mean={condMean} std={condStd} prob={prob} />
          <div className="font-mono text-[10px] space-y-0.5">
            <div>
              <span className="text-slate-400">P = </span>
              <span className="text-slate-500">Φ(μ/σ)</span>
            </div>
            <div>
              <span className="text-slate-400">  = </span>
              <span className="text-slate-500">Φ({(condMean / condStd).toFixed(3)})</span>
            </div>
            <div className="bg-indigo-50 px-2 py-1 rounded-md inline-block border border-indigo-100">
              <span className="text-indigo-400">  = </span>
              <span className="font-black text-indigo-700 text-[12px]">{(prob * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div className="mt-1.5 text-[8px] text-slate-400">
          음영 = P(증상 present) · 점선 = threshold · 보라 점 = 조건부 평균 μ
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───
export default function SymptomSimulator({ data }) {
  const [selectedSymptoms, setSelectedSymptoms] = useState(new Set());
  const [expandedIdx, setExpandedIdx] = useState(null);

  const getKorean = (s) => s.match(/^([^\s(]+)/)?.[1] || s.substring(0, 3);
  const getEnglish = (s) => s.match(/\(([^)]+)\)/)?.[1] || '';

  // Build full correlation matrix
  const corrMatrix = useMemo(() => {
    if (!data?.symptoms || !data?.edges) return null;
    return buildCorrMatrix(data.symptoms.length, data.edges);
  }, [data?.symptoms, data?.edges]);

  // Compute Gaussian conditional probabilities
  const conditional = useMemo(() => {
    if (!corrMatrix || selectedSymptoms.size === 0) return null;
    return computeConditional(corrMatrix, selectedSymptoms, data.symptoms.length);
  }, [corrMatrix, selectedSymptoms, data?.symptoms?.length]);

  // Probabilities array for circular vis
  const probabilities = useMemo(() => {
    if (!data?.symptoms) return [];
    if (!conditional) {
      return data.symptoms.map(() => ({ prob: 0.5, selected: false, hasData: false }));
    }
    return conditional.results.map(r => ({
      prob: r.prob,
      selected: r.selected,
      hasData: r.hasData || r.selected,
      condMean: r.condMean,
      condStd: r.condStd,
    }));
  }, [conditional, data?.symptoms]);

  const toggleSymptom = useCallback((idx) => {
    setSelectedSymptoms(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setExpandedIdx(null);
  }, []);

  const reset = useCallback(() => {
    setSelectedSymptoms(new Set());
    setExpandedIdx(null);
  }, []);

  // Ranked affected symptoms
  const affectedRanked = useMemo(() => {
    if (!conditional) return [];
    return conditional.results
      .filter(r => !r.selected && r.hasData)
      .sort((a, b) => Math.abs(b.prob - 0.5) - Math.abs(a.prob - 0.5));
  }, [conditional]);

  // Adjacency map for connection lines
  const correlationMap = useMemo(() => {
    if (!data?.edges) return {};
    const map = {};
    data.edges.forEach(e => {
      if (!map[e.a]) map[e.a] = {};
      if (!map[e.b]) map[e.b] = {};
      map[e.a][e.b] = e.r;
      map[e.b][e.a] = e.r;
    });
    return map;
  }, [data?.edges]);

  // No data state
  if (!data || !data.symptoms || !data.edges || data.edges.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-300">
        <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">모델 추출 탭에서 먼저 증상 상관관계를 추출해주세요</p>
        <p className="text-[10px] mt-1">추출된 데이터가 자동으로 여기에 연결됩니다</p>
      </div>
    );
  }

  const { symptoms } = data;
  const W = 700, H = 700;
  const cx = W / 2, cy = H / 2;
  const n = symptoms.length;
  const radius = n > 20 ? 285 : n > 12 ? 250 : 200;

  const getPosition = (idx) => {
    const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-700">증상 조건부 확률 시뮬레이터</h3>
            <span className="text-[8px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
              Multivariate Gaussian
            </span>
            {selectedSymptoms.size > 0 && (
              <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                {selectedSymptoms.size}개 선택
              </span>
            )}
          </div>
          {selectedSymptoms.size > 0 && (
            <button onClick={reset}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-red-500 border border-slate-200 rounded-lg transition-colors">
              <RotateCcw className="w-3 h-3" /> 초기화
            </button>
          )}
        </div>
        {selectedSymptoms.size === 0 && (
          <div className="px-4 pb-3 text-[10px] text-slate-400">
            증상을 클릭하면 다변량 정규분포 기반 조건부 확률을 계산합니다
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Circular visualization */}
        <div className="xl:col-span-7">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '700px' }}>

              {/* Connection lines from selected to affected */}
              {selectedSymptoms.size > 0 && symptoms.map((_, idx) => {
                const p = probabilities[idx];
                if (!p || p.selected || !p.hasData) return null;
                const diff = Math.abs(p.prob - 0.5);
                if (diff < 0.06) return null;

                const pos = getPosition(idx);
                const selected = Array.from(selectedSymptoms);
                let bestSel = selected[0], bestR = 0;
                selected.forEach(sIdx => {
                  const r = correlationMap[sIdx]?.[idx];
                  if (r !== undefined && Math.abs(r) > Math.abs(bestR)) {
                    bestR = r; bestSel = sIdx;
                  }
                });
                const selPos = getPosition(bestSel);

                return (
                  <line key={`conn-${idx}`}
                    x1={selPos.x} y1={selPos.y} x2={pos.x} y2={pos.y}
                    stroke={p.prob > 0.5 ? '#22c55e' : '#ef4444'}
                    strokeWidth={Math.max(0.5, diff * 5)}
                    opacity={Math.max(0.08, diff * 0.7)}
                    strokeDasharray={p.prob < 0.5 ? '5 4' : 'none'}
                  />
                );
              })}

              {/* Symptom nodes */}
              {symptoms.map((sym, idx) => {
                const pos = getPosition(idx);
                const isSelected = selectedSymptoms.has(idx);
                const p = probabilities[idx];
                const prob = p?.prob;
                const color = COLORS[idx % COLORS.length];
                const hasEffect = selectedSymptoms.size > 0 && p?.hasData && !isSelected;
                const probPct = prob != null ? Math.round(prob * 100) : null;
                const baseR = n > 24 ? 24 : 28;
                const nodeR = isSelected ? baseR + 4
                  : hasEffect ? baseR + (prob - 0.5) * 16
                  : baseR;

                return (
                  <g key={idx}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={() => toggleSymptom(idx)}>
                    {(isSelected || (hasEffect && Math.abs(prob - 0.5) > 0.08)) && (
                      <circle r={nodeR + 10}
                        fill={isSelected ? color : getProbColor(prob)}
                        opacity={isSelected ? 0.12 : 0.1}
                        className="transition-all duration-500" />
                    )}
                    <circle r={nodeR}
                      fill={isSelected ? color : hasEffect ? getProbBg(prob) : 'white'}
                      stroke={isSelected ? color : hasEffect ? getProbColor(prob) : '#e2e8f0'}
                      strokeWidth={isSelected ? 3 : 2}
                      className="transition-all duration-300" />
                    <text y={hasEffect && probPct != null ? -3 : 1}
                      textAnchor="middle"
                      className={`font-black pointer-events-none select-none ${n > 24 ? 'text-[8px]' : 'text-[10px]'}`}
                      fill={isSelected ? 'white' : '#334155'}>
                      {getKorean(sym)}
                    </text>
                    {hasEffect && probPct != null && (
                      <text y={10} textAnchor="middle"
                        className="text-[9px] font-black pointer-events-none select-none"
                        fill={getProbColor(prob)}>
                        {probPct}%
                      </text>
                    )}
                    {isSelected && (
                      <g transform={`translate(${nodeR - 4}, ${-nodeR + 4})`}>
                        <circle r={8} fill="#f59e0b" stroke="white" strokeWidth={1.5} />
                        <text textAnchor="middle" y={3.5}
                          className="text-[8px] font-black pointer-events-none" fill="white">
                          ✓
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Center info */}
              <g transform={`translate(${cx}, ${cy})`}>
                <circle r={55} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} />
                {selectedSymptoms.size > 0 ? (
                  <>
                    <text textAnchor="middle" y={-15}
                      className="text-[10px] font-black" fill="#475569">
                      선택: {selectedSymptoms.size}개
                    </text>
                    <text textAnchor="middle" y={2}
                      className="text-[8px] font-bold" fill="#94a3b8">
                      Gaussian Conditional
                    </text>
                    <text textAnchor="middle" y={17}
                      className="text-[8px] font-medium" fill="#cbd5e1">
                      P(B|A) = Φ(μ/σ)
                    </text>
                  </>
                ) : (
                  <>
                    <text textAnchor="middle" y={-8}
                      className="text-[10px] font-bold" fill="#94a3b8">
                      증상을 클릭하여
                    </text>
                    <text textAnchor="middle" y={10}
                      className="text-[10px] font-bold" fill="#94a3b8">
                      시뮬레이션 시작
                    </text>
                  </>
                )}
              </g>
            </svg>
          </div>
        </div>

        {/* Side panel */}
        <div className="xl:col-span-5 space-y-3">
          {/* Selected symptoms */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
              선택된 증상 (Present, z=1)
            </h4>
            {selectedSymptoms.size === 0 ? (
              <p className="text-[10px] text-slate-300 py-2">증상을 클릭하여 선택해주세요</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedSymptoms).map(idx => (
                  <button key={idx} onClick={() => toggleSymptom(idx)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white transition-all hover:opacity-80 shadow-sm"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}>
                    {getKorean(symptoms[idx])}
                    <span className="text-[8px] opacity-70">({getEnglish(symptoms[idx])})</span>
                    <span className="ml-0.5 opacity-60">x</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Affected symptoms ranked with expandable equations */}
          {affectedRanked.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  조건부 확률 (클릭하여 계산 과정 보기)
                </h4>
              </div>
              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {affectedRanked.map(item => {
                  const probPct = Math.round(item.prob * 100);
                  const isUp = item.prob > 0.55;
                  const isDown = item.prob < 0.45;
                  const isExpanded = expandedIdx === item.idx;

                  return (
                    <div key={item.idx}>
                      {/* Symptom row */}
                      <div
                        className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${
                          isExpanded ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                        }`}
                        style={{ backgroundColor: isExpanded ? undefined : (Math.abs(item.prob - 0.5) > 0.1 ? getProbBg(item.prob) : undefined) }}
                        onClick={() => setExpandedIdx(isExpanded ? null : item.idx)}>
                        {/* Expand icon */}
                        <div className="flex-shrink-0 text-slate-300">
                          {isExpanded
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronRight className="w-3 h-3" />
                          }
                        </div>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[item.idx % COLORS.length] }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-slate-700 truncate">
                            {getKorean(symptoms[item.idx])}
                            <span className="text-slate-400 font-normal ml-1">
                              ({getEnglish(symptoms[item.idx])})
                            </span>
                          </div>
                          <div className="mt-0.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${probPct}%`, backgroundColor: getProbColor(item.prob) }} />
                          </div>
                        </div>
                        {/* Mini distribution */}
                        {item.condMean !== undefined && (
                          <MiniDistribution mean={item.condMean} std={item.condStd} prob={item.prob} />
                        )}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {isUp && <ArrowUp className="w-3 h-3 text-green-500" />}
                          {isDown && <ArrowDown className="w-3 h-3 text-red-500" />}
                          <span className={`text-[11px] font-mono font-black w-10 text-right ${
                            isUp ? 'text-green-600' : isDown ? 'text-red-600' : 'text-slate-400'
                          }`}>
                            {probPct}%
                          </span>
                        </div>
                      </div>

                      {/* Expanded equation breakdown */}
                      {isExpanded && item.contributions && (
                        <EquationBreakdown
                          item={item}
                          symptoms={symptoms}
                          selArr={conditional.selArr}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
