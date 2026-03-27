import React, { useState, useMemo, useCallback } from 'react';
import { Activity, RotateCcw, Zap, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

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

export default function NaiveSimulator({ data }) {
  const [selectedSymptoms, setSelectedSymptoms] = useState(new Set());
  const [expandedIdx, setExpandedIdx] = useState(null);

  const getKorean = (s) => s.match(/^([^\s(]+)/)?.[1] || s.substring(0, 3);
  const getEnglish = (s) => s.match(/\(([^)]+)\)/)?.[1] || '';

  // Adjacency map
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

  // Naive: P(B|A) = (1 + avg_r) / 2
  const probabilities = useMemo(() => {
    if (!data?.symptoms) return [];
    if (selectedSymptoms.size === 0) {
      return data.symptoms.map(() => ({ prob: 0.5, selected: false, hasData: false }));
    }

    const selected = Array.from(selectedSymptoms);

    return data.symptoms.map((_, idx) => {
      if (selectedSymptoms.has(idx)) return { prob: 1.0, selected: true, hasData: true };

      const correlations = selected
        .map(sIdx => ({ sIdx, r: correlationMap[sIdx]?.[idx] }))
        .filter(c => c.r !== undefined);

      if (correlations.length === 0) return { prob: 0.5, hasData: false };

      const avgR = correlations.reduce((s, c) => s + c.r, 0) / correlations.length;
      return {
        prob: Math.max(0.01, Math.min(0.99, (1 + avgR) / 2)),
        avgR,
        hasData: true,
        correlations,
        sources: correlations.length,
      };
    });
  }, [selectedSymptoms, data?.symptoms, correlationMap]);

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

  const affectedRanked = useMemo(() => {
    if (!data?.symptoms || selectedSymptoms.size === 0) return [];
    return probabilities
      .map((p, idx) => ({ idx, ...p }))
      .filter(p => !p.selected && p.hasData)
      .sort((a, b) => Math.abs(b.prob - 0.5) - Math.abs(a.prob - 0.5));
  }, [probabilities, selectedSymptoms, data?.symptoms]);

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
            <Zap className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-700">증상 조건부 확률 시뮬레이터</h3>
            <span className="text-[8px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-bold">
              Naive Average
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
        <div className="px-4 pb-3 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
          <span className="text-[10px] text-orange-500 font-medium">
            단순 평균 방식 — 증상을 추가할수록 확률이 계속 올라가는 한계가 있습니다. Gaussian 탭과 비교해보세요.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Circular visualization */}
        <div className="xl:col-span-7">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '700px' }}>

              {/* Connection lines */}
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
                  if (r !== undefined && Math.abs(r) > Math.abs(bestR)) { bestR = r; bestSel = sIdx; }
                });
                const selPos = getPosition(bestSel);
                return (
                  <line key={`conn-${idx}`}
                    x1={selPos.x} y1={selPos.y} x2={pos.x} y2={pos.y}
                    stroke={bestR > 0 ? '#22c55e' : '#ef4444'}
                    strokeWidth={Math.max(0.5, diff * 5)}
                    opacity={Math.max(0.08, diff * 0.7)}
                    strokeDasharray={bestR < 0 ? '5 4' : 'none'} />
                );
              })}

              {/* Nodes */}
              {symptoms.map((sym, idx) => {
                const pos = getPosition(idx);
                const isSelected = selectedSymptoms.has(idx);
                const p = probabilities[idx];
                const prob = p?.prob;
                const color = COLORS[idx % COLORS.length];
                const hasEffect = selectedSymptoms.size > 0 && p?.hasData && !isSelected;
                const probPct = prob != null ? Math.round(prob * 100) : null;
                const baseR = n > 24 ? 24 : 28;
                const nodeR = isSelected ? baseR + 4 : hasEffect ? baseR + (prob - 0.5) * 16 : baseR;

                return (
                  <g key={idx} transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer" onClick={() => toggleSymptom(idx)}>
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
                    <text y={hasEffect && probPct != null ? -3 : 1} textAnchor="middle"
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
                          className="text-[8px] font-black pointer-events-none" fill="white">✓</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Center */}
              <g transform={`translate(${cx}, ${cy})`}>
                <circle r={55} fill="#fff7ed" stroke="#fed7aa" strokeWidth={1} />
                {selectedSymptoms.size > 0 ? (
                  <>
                    <text textAnchor="middle" y={-15} className="text-[10px] font-black" fill="#475569">
                      선택: {selectedSymptoms.size}개
                    </text>
                    <text textAnchor="middle" y={2} className="text-[8px] font-bold" fill="#f97316">
                      Naive Average
                    </text>
                    <text textAnchor="middle" y={17} className="text-[8px] font-medium" fill="#cbd5e1">
                      P = (1+avg_r)/2
                    </text>
                  </>
                ) : (
                  <>
                    <text textAnchor="middle" y={-8} className="text-[10px] font-bold" fill="#94a3b8">
                      증상을 클릭하여
                    </text>
                    <text textAnchor="middle" y={10} className="text-[10px] font-bold" fill="#94a3b8">
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
              선택된 증상 (Present)
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

          {/* Affected symptoms */}
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
                      <div
                        className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${
                          isExpanded ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'
                        }`}
                        style={{ backgroundColor: isExpanded ? undefined : (Math.abs(item.prob - 0.5) > 0.1 ? getProbBg(item.prob) : undefined) }}
                        onClick={() => setExpandedIdx(isExpanded ? null : item.idx)}>
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

                      {/* Expanded equation */}
                      {isExpanded && item.correlations && (
                        <div className="mt-2 p-3 bg-orange-50 rounded-xl text-[9px] space-y-2.5 border border-orange-200">
                          {/* Step 1: Individual correlations */}
                          <div>
                            <div className="font-black text-slate-500 uppercase tracking-wider mb-1.5">
                              Step 1: 각 선택 증상과의 상관계수 (r)
                            </div>
                            <div className="bg-white rounded-lg border border-orange-100 overflow-hidden">
                              <table className="w-full">
                                <thead>
                                  <tr className="bg-slate-50 text-[8px] text-slate-400 font-bold">
                                    <th className="text-left px-2 py-1">선택 증상</th>
                                    <th className="text-right px-2 py-1">r</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.correlations.map((c, i) => (
                                    <tr key={i} className="border-t border-slate-50">
                                      <td className="px-2 py-1 font-bold text-slate-600">
                                        {getKorean(symptoms[c.sIdx])}
                                      </td>
                                      <td className={`px-2 py-1 text-right font-mono font-bold ${
                                        c.r > 0 ? 'text-green-600' : c.r < 0 ? 'text-red-600' : 'text-slate-400'
                                      }`}>
                                        {c.r > 0 ? '+' : ''}{c.r.toFixed(3)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-1 text-[8px] text-slate-400 italic">
                              r=0인 증상은 상관관계 미추출 → 계산에서 제외됨
                            </div>
                          </div>

                          {/* Step 2: Average */}
                          <div className="bg-white p-2.5 rounded-lg border border-orange-100 space-y-1">
                            <div className="font-black text-slate-500 uppercase tracking-wider text-[8px]">
                              Step 2: 단순 평균
                            </div>
                            <div className="font-mono text-[10px]">
                              <span className="text-slate-500">avg_r = (</span>
                              {item.correlations.map((c, i) => (
                                <span key={i}>
                                  {i > 0 && <span className="text-slate-400"> + </span>}
                                  <span className={c.r >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    {c.r.toFixed(3)}
                                  </span>
                                </span>
                              ))}
                              <span className="text-slate-500">) / {item.correlations.length} = </span>
                              <span className="font-black text-orange-600">{item.avgR.toFixed(3)}</span>
                            </div>
                          </div>

                          {/* Step 3: Probability */}
                          <div className="bg-white p-2.5 rounded-lg border border-orange-100 space-y-1">
                            <div className="font-black text-slate-500 uppercase tracking-wider text-[8px]">
                              Step 3: 확률 변환
                            </div>
                            <div className="font-mono text-[10px]">
                              <span className="text-slate-500">P = (1 + avg_r) / 2</span>
                            </div>
                            <div className="font-mono text-[10px]">
                              <span className="text-slate-400">  = (1 + {item.avgR.toFixed(3)}) / 2</span>
                            </div>
                            <div className="bg-orange-50 px-2 py-1 rounded-md inline-block border border-orange-200">
                              <span className="text-orange-400">  = </span>
                              <span className="font-black text-orange-700 text-[12px]">{(item.prob * 100).toFixed(1)}%</span>
                            </div>
                          </div>

                          {/* Warning */}
                          <div className="flex items-start gap-2 p-2 bg-orange-100 rounded-lg">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                            <div className="text-[8px] text-orange-700">
                              <strong>한계:</strong> 모든 r이 양수이면 증상을 추가할수록 avg_r이 양수로 유지되어 확률이 절대 내려가지 않습니다.
                              선택 증상 간 상관관계(중복 정보)도 보정되지 않습니다.
                            </div>
                          </div>
                        </div>
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
