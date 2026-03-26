import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Bot, Play, Loader2, Download, RotateCcw, Eye, Settings, Zap, AlertTriangle } from 'lucide-react';

// ─── Default TKM symptom list for extraction ───
const DEFAULT_SYMPTOMS = [
  '오한 (Chills)', '발열 (Fever)', '두통 (Headache)', '콧물 (Runny Nose)',
  '목아픔 (Sore Throat)', '기침 (Cough)', '가래 (Phlegm)', '갈증 (Thirst)',
  '소화불량 (Dyspepsia)', '구역구토 (Nausea/Vomiting)', '복통 (Abdominal Pain)',
  '설사 (Diarrhea)', '변비 (Constipation)', '피로 (Fatigue)', '무기력 (Lethargy)',
  '불면 (Insomnia)', '다몽 (Vivid Dreams)', '심계 (Palpitations)',
  '흉민 (Chest Tightness)', '숨참 (Dyspnea)', '자한 (Spontaneous Sweating)',
  '도한 (Night Sweating)', '어지러움 (Dizziness)', '이명 (Tinnitus)',
  '요통 (Low Back Pain)', '관절통 (Joint Pain)', '부종 (Edema)',
  '식욕부진 (Poor Appetite)', '구건 (Dry Mouth)', '안면홍조 (Facial Flushing)',
];

const EXTRACTION_PROMPT = (symptoms) => `You are a Traditional Korean Medicine (TKM) / Traditional Chinese Medicine (TCM) clinical expert.

Given the following list of symptoms, estimate the correlation between EVERY pair of symptoms.

Symptoms:
${symptoms.map((s, i) => `${i + 1}. ${s}`).join('\n')}

For each pair, provide:
- The correlation strength from -1.0 to 1.0 (where 1.0 = always co-occur, -1.0 = never co-occur, 0 = independent)
- Base this on clinical experience and medical literature

IMPORTANT: Return ONLY a valid JSON array. Each element should be:
{"a": <index_of_symptom_a>, "b": <index_of_symptom_b>, "r": <correlation_value>, "note_ko": "<한의학 용어로 간단한 이유 설명 in Korean>", "note_en": "<brief reason in English>"}

For note_ko, use proper Traditional Korean Medicine (한의학) terminology (e.g. 비기허로 인한 식욕부진과 설사 동반, 간양상항으로 두통과 어지러움 동반).
For note_en, provide the English clinical explanation.

Only include pairs where |r| >= 0.15 (skip near-zero correlations to keep it manageable).
Use 0-based indices for symptoms.
Return ONLY the JSON array, no other text.`;

// ─── Force layout for extracted network ───
function layoutNodes(nodes, edges, width, height) {
  const pos = {};
  const n = nodes.length;
  nodes.forEach((node, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const r = Math.min(width, height) * 0.35;
    pos[i] = { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r };
  });

  // Simple force iterations
  for (let iter = 0; iter < 120; iter++) {
    const forces = {};
    nodes.forEach((_, i) => { forces[i] = { x: 0, y: 0 }; });

    // Repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = 600 / (dist * dist);
        forces[i].x += (dx / dist) * f;
        forces[i].y += (dy / dist) * f;
        forces[j].x -= (dx / dist) * f;
        forces[j].y -= (dy / dist) * f;
      }
    }

    // Attraction along edges
    edges.forEach(({ a, b, r }) => {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const ideal = 80 / Math.max(Math.abs(r), 0.1);
      const f = (dist - ideal) * 0.008;
      forces[a].x += (dx / dist) * f;
      forces[a].y += (dy / dist) * f;
      forces[b].x -= (dx / dist) * f;
      forces[b].y -= (dy / dist) * f;
    });

    // Gravity
    nodes.forEach((_, i) => {
      forces[i].x += (width / 2 - pos[i].x) * 0.004;
      forces[i].y += (height / 2 - pos[i].y) * 0.004;
    });

    const damping = 1 - iter / 120;
    nodes.forEach((_, i) => {
      pos[i].x += forces[i].x * damping;
      pos[i].y += forces[i].y * damping;
      pos[i].x = Math.max(50, Math.min(width - 50, pos[i].x));
      pos[i].y = Math.max(50, Math.min(height - 50, pos[i].y));
    });
  }
  return pos;
}

// ─── Color palette for symptom nodes ───
const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#1dca91', '#ef4444', '#8b5cf6',
  '#0ea5e9', '#f97316', '#14b8a6', '#a855f7', '#22c55e', '#e11d48',
  '#06b6d4', '#d97706', '#7c3aed', '#059669', '#dc2626', '#2563eb',
  '#ca8a04', '#9333ea', '#0d9488', '#db2777', '#65a30d', '#4f46e5',
  '#ea580c', '#16a34a', '#be185d', '#1d4ed8', '#b45309', '#7e22ce',
];

export default function ModelExtractionTab({ onDataExtracted }) {
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY || '');
  const [symptoms, setSymptoms] = useState(DEFAULT_SYMPTOMS);
  const [symptomText, setSymptomText] = useState(DEFAULT_SYMPTOMS.join('\n'));
  const [extractedEdges, setExtractedEdges] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState(null);
  const [rawResponse, setRawResponse] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [showSettings, setShowSettings] = useState(true);
  const [minR, setMinR] = useState(0.15);
  const [modelName, setModelName] = useState('gemini-3-flash-preview');
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [nodePositions, setNodePositions] = useState(null);
  const [dragNode, setDragNode] = useState(null);
  const [adjustedEdges, setAdjustedEdges] = useState(null);
  const [distScale, setDistScale] = useState(200);
  const svgRef = useRef(null);
  const nodePositionsRef = useRef({});
  const currentEdgesRef = useRef(null);

  const W = 700, H = 700;

  const handleExtract = async () => {
    if (!apiKey.trim()) { setError('API 키를 입력해주세요'); return; }

    const parsedSymptoms = symptomText.split('\n').map(s => s.trim()).filter(Boolean);
    if (parsedSymptoms.length < 3) { setError('최소 3개의 증상이 필요합니다'); return; }

    setSymptoms(parsedSymptoms);
    setIsExtracting(true);
    setError(null);
    setExtractedEdges(null);
    setRawResponse('');
    setSelectedNode(null);

    const prompt = EXTRACTION_PROMPT(parsedSymptoms);

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 65536 },
    };

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API Error ${res.status}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      setRawResponse(text);

      // Parse JSON from response (handle markdown code blocks + truncation)
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      jsonStr = jsonStr.trim();
      // Extract the array portion
      const arrStart = jsonStr.indexOf('[');
      if (arrStart !== -1) jsonStr = jsonStr.substring(arrStart);

      let edges;
      try {
        edges = JSON.parse(jsonStr);
      } catch {
        // Truncated response — recover complete objects via regex
        const objectPattern = /\{\s*"a"\s*:\s*(\d+)\s*,\s*"b"\s*:\s*(\d+)\s*,\s*"r"\s*:\s*(-?[\d.]+)\s*,\s*"note_ko"\s*:\s*"([^"]*)"\s*,\s*"note_en"\s*:\s*"([^"]*)"\s*\}/g;
        edges = [];
        let m;
        while ((m = objectPattern.exec(jsonStr)) !== null) {
          edges.push({ a: parseInt(m[1]), b: parseInt(m[2]), r: parseFloat(m[3]), note_ko: m[4], note_en: m[5] });
        }
        // Fallback: try old single-note format
        if (edges.length === 0) {
          const oldPattern = /\{\s*"a"\s*:\s*(\d+)\s*,\s*"b"\s*:\s*(\d+)\s*,\s*"r"\s*:\s*(-?[\d.]+)\s*,\s*"note"\s*:\s*"([^"]*)"\s*\}/g;
          let m2;
          while ((m2 = oldPattern.exec(jsonStr)) !== null) {
            edges.push({ a: parseInt(m2[1]), b: parseInt(m2[2]), r: parseFloat(m2[3]), note_ko: '', note_en: m2[4] });
          }
        }
        if (edges.length === 0) throw new Error('JSON 파싱 실패 — 모델 응답이 잘렸을 수 있습니다');
      }

      // Validate and filter
      const validEdges = edges
        .filter(e =>
          typeof e.a === 'number' && typeof e.b === 'number' && typeof e.r === 'number' &&
          e.a >= 0 && e.a < parsedSymptoms.length &&
          e.b >= 0 && e.b < parsedSymptoms.length &&
          e.a !== e.b &&
          Math.abs(e.r) >= 0.01
        )
        .map(e => ({
          a: e.a,
          b: e.b,
          r: Math.max(-1, Math.min(1, e.r)),
          note_ko: e.note_ko || '',
          note_en: e.note_en || e.note || '',
        }));

      setExtractedEdges(validEdges);
      onDataExtracted?.(parsedSymptoms, validEdges);
    } catch (e) {
      setError(`추출 실패: ${e.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const activeEdges = adjustedEdges || extractedEdges;

  const filteredEdges = useMemo(() => {
    if (!activeEdges) return [];
    return activeEdges.filter(e => Math.abs(e.r) >= minR);
  }, [activeEdges, minR]);

  const positions = useMemo(() => {
    if (!extractedEdges || symptoms.length === 0) return {};
    return layoutNodes(symptoms, filteredEdges, W, H);
  }, [symptoms, filteredEdges]);

  // Initialize draggable positions + compute distance scale (correlation distance metric)
  useEffect(() => {
    if (!positions || !extractedEdges || Object.keys(positions).length === 0) return;
    setNodePositions({ ...positions });
    nodePositionsRef.current = { ...positions };
    // Scale: avg ratio of pixel distance to theoretical correlation distance d=√(2(1-r))
    let sumRatio = 0, count = 0;
    extractedEdges.forEach(e => {
      const p1 = positions[e.a], p2 = positions[e.b];
      if (!p1 || !p2) return;
      const dx = p1.x - p2.x, dy = p1.y - p2.y;
      const dPixel = Math.sqrt(dx * dx + dy * dy);
      const dTheory = Math.sqrt(2 * (1 - e.r));
      if (dTheory > 0.05 && dPixel > 1) { sumRatio += dPixel / dTheory; count++; }
    });
    if (count > 0) setDistScale(sumRatio / count);
    setAdjustedEdges(null);
  }, [positions, extractedEdges]);

  const connectedToSelected = useMemo(() => {
    if (selectedNode === null) return new Set();
    const s = new Set();
    filteredEdges.forEach(e => {
      if (e.a === selectedNode) s.add(e.b);
      if (e.b === selectedNode) s.add(e.a);
    });
    return s;
  }, [selectedNode, filteredEdges]);

  const selectedEdges = useMemo(() => {
    if (selectedNode === null) return [];
    return filteredEdges
      .filter(e => e.a === selectedNode || e.b === selectedNode)
      .map(e => ({
        ...e,
        partner: e.a === selectedNode ? e.b : e.a,
      }))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }, [selectedNode, filteredEdges]);

  const degree = useMemo(() => {
    const d = {};
    symptoms.forEach((_, i) => { d[i] = 0; });
    filteredEdges.forEach(({ a, b }) => { d[a]++; d[b]++; });
    return d;
  }, [symptoms, filteredEdges]);

  const handleExport = () => {
    const data = {
      metadata: {
        model: modelName,
        extractedAt: new Date().toISOString(),
        symptomCount: symptoms.length,
        edgeCount: extractedEdges?.length || 0,
        source: 'llm_extraction',
      },
      symptoms: symptoms.map((s, i) => ({ index: i, label: s })),
      correlations: (adjustedEdges || extractedEdges || []).map(e => ({
        a: e.a, b: e.b, r: e.r, note_ko: e.note_ko, note_en: e.note_en,
        ...(e.originalR !== undefined ? { originalR: e.originalR } : {}),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm_symptom_network_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Positions to render: use draggable positions in interactive mode, else computed
  const renderPositions = interactiveMode && nodePositions ? nodePositions : positions;

  const handleDragStart = useCallback((e, nodeIdx) => {
    if (!interactiveMode) return;
    e.preventDefault();
    setDragNode(nodeIdx);
    setSelectedNode(nodeIdx);
  }, [interactiveMode]);

  const handleDragMove = useCallback((e) => {
    if (dragNode === null) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(50, Math.min(W - 50, (e.clientX - rect.left) * (W / rect.width)));
    const y = Math.max(50, Math.min(H - 50, (e.clientY - rect.top) * (H / rect.height)));

    const updated = { ...nodePositionsRef.current, [dragNode]: { x, y } };
    nodePositionsRef.current = updated;
    setNodePositions(updated);

    // Recompute correlations for dragged node's edges using: r = 1 - (d/scale)²/2
    const base = currentEdgesRef.current || extractedEdges;
    if (!base) return;
    const newEdges = base.map(edge => {
      if (edge.a !== dragNode && edge.b !== dragNode) return edge;
      const p1 = updated[edge.a], p2 = updated[edge.b];
      if (!p1 || !p2) return edge;
      const dx = p1.x - p2.x, dy = p1.y - p2.y;
      const dPixel = Math.sqrt(dx * dx + dy * dy);
      const rNew = 1 - (dPixel / distScale) ** 2 / 2;
      return {
        ...edge,
        r: Math.max(-1, Math.min(1, parseFloat(rNew.toFixed(3)))),
        originalR: edge.originalR ?? edge.r,
      };
    });
    currentEdgesRef.current = newEdges;
    setAdjustedEdges(newEdges);
  }, [dragNode, distScale, extractedEdges]);

  const handleDragEnd = useCallback(() => {
    setDragNode(null);
  }, []);

  const handleResetPositions = useCallback(() => {
    setNodePositions(positions ? { ...positions } : null);
    nodePositionsRef.current = positions ? { ...positions } : {};
    setAdjustedEdges(null);
    currentEdgesRef.current = null;
  }, [positions]);

  // Keep currentEdgesRef in sync
  useEffect(() => { currentEdgesRef.current = adjustedEdges; }, [adjustedEdges]);

  const getShortLabel = (s) => {
    const match = s.match(/^([^\s(]+)/);
    return match ? match[1] : s.substring(0, 4);
  };

  return (
    <div className="space-y-3">
      {/* Settings panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <button onClick={() => setShowSettings(!showSettings)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-700">모델 설정 & 증상 목록</span>
          </div>
          <span className="text-[10px] text-slate-400">{showSettings ? '접기' : '펼치기'}</span>
        </button>

        {showSettings && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* API Key + Model */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Gemini API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                <label className="text-[10px] font-black text-slate-400 uppercase">Model ID</label>
                <input type="text" value={modelName} onChange={e => setModelName(e.target.value)}
                  placeholder="e.g. gemini-2.0-flash"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>

              {/* Symptom list */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">
                  증상 목록 (한 줄에 하나씩) — {symptomText.split('\n').filter(Boolean).length}개
                </label>
                <textarea value={symptomText} onChange={e => setSymptomText(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[10px] font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleExtract} disabled={isExtracting}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2">
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isExtracting ? '모델에서 추출 중...' : '모델 지식 추출 시작'}
              </button>
              {extractedEdges && (
                <span className="text-[10px] font-bold text-green-600">
                  {extractedEdges.length}개 상관관계 추출 완료
                </span>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2 rounded-lg">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {extractedEdges && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          {/* Network visualization */}
          <div className="xl:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-500" />
                  모델이 이해하는 증상 상관관계 네트워크
                </h3>
                <div className="flex items-center gap-3">
                  <button onClick={() => setInteractiveMode(m => !m)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border transition-all ${
                      interactiveMode
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}>
                    <RotateCcw className="w-3 h-3" />
                    {interactiveMode ? '드래그 편집 ON' : '드래그 편집'}
                  </button>
                  {interactiveMode && adjustedEdges && (
                    <button onClick={handleResetPositions}
                      className="text-[9px] font-bold text-red-500 hover:text-red-700">초기화</button>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-400 font-bold">최소 |r|:</span>
                    <input type="range" min="0" max="0.8" step="0.05" value={minR}
                      onChange={e => setMinR(parseFloat(e.target.value))}
                      className="w-20 h-1 accent-indigo-600" />
                    <span className="text-[10px] font-mono font-bold text-indigo-600">{minR.toFixed(2)}</span>
                  </div>
                  <span className="text-[9px] text-slate-400">
                    {filteredEdges.length}/{extractedEdges.length} edges
                  </span>
                </div>
              </div>

              <div className="p-2">
                <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full"
                  style={{ maxHeight: '700px', cursor: interactiveMode ? (dragNode !== null ? 'grabbing' : 'default') : 'default' }}
                  onMouseMove={handleDragMove} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd}>
                  {/* Edges */}
                  {filteredEdges.map((e, i) => {
                    const p1 = renderPositions[e.a];
                    const p2 = renderPositions[e.b];
                    if (!p1 || !p2) return null;
                    const isPos = e.r > 0;
                    const absR = Math.abs(e.r);
                    const isConnected = selectedNode !== null && (e.a === selectedNode || e.b === selectedNode);
                    const opacity = selectedNode !== null
                      ? (isConnected ? 0.7 : 0.03)
                      : Math.max(0.08, absR * 0.6);

                    return (
                      <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                        stroke={isPos ? '#6366f1' : '#ef4444'}
                        strokeWidth={isConnected ? Math.max(1.5, absR * 5) : Math.max(0.3, absR * 2.5)}
                        opacity={opacity}
                        strokeDasharray={isPos ? 'none' : '4 3'}
                        className="transition-all duration-300"
                      />
                    );
                  })}

                  {/* Nodes */}
                  {symptoms.map((sym, i) => {
                    const pos = renderPositions[i];
                    if (!pos) return null;
                    const isSelected = i === selectedNode;
                    const isConnected = connectedToSelected.has(i);
                    const opacity = selectedNode !== null
                      ? (isSelected || isConnected ? 1 : 0.12)
                      : 1;
                    const r = Math.max(8, Math.min(20, 6 + (degree[i] || 0) * 1.2));
                    const color = COLORS[i % COLORS.length];

                    return (
                      <g key={i} transform={`translate(${pos.x}, ${pos.y})`}
                        className={`transition-all ${dragNode === i ? '' : 'duration-300'}`}
                        style={{ opacity, cursor: interactiveMode ? (dragNode === i ? 'grabbing' : 'grab') : 'pointer' }}
                        onMouseDown={(e) => handleDragStart(e, i)}
                        onClick={() => !interactiveMode && setSelectedNode(isSelected ? null : i)}>
                        {isSelected && <circle r={r + 5} fill={color} opacity={0.15} />}
                        <circle r={r}
                          fill={isSelected ? color : 'white'}
                          stroke={color} strokeWidth={isSelected ? 3 : 2} />
                        <text y={r + 12} textAnchor="middle"
                          className="text-[9px] font-bold pointer-events-none select-none"
                          fill={isSelected ? '#1e293b' : '#94a3b8'}>
                          {getShortLabel(sym)}
                        </text>
                        {isSelected && degree[i] > 0 && (
                          <g transform={`translate(${r - 2}, ${-r + 2})`}>
                            <circle r={6} fill="#6366f1" />
                            <text textAnchor="middle" y={3} fill="white" className="text-[7px] font-black">
                              {degree[i]}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="px-4 pb-3 flex items-center gap-4 text-[9px] text-slate-400">
                <span className="flex items-center gap-1">
                  <div className="w-4 h-0.5 bg-indigo-400 rounded" /> 양의 상관
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-4 h-0.5 bg-red-400 rounded border-t border-dashed border-red-400" /> 음의 상관
                </span>
                <span>노드 크기 = 연결 수 | 선 굵기 = |r|</span>
                {interactiveMode && <span className="text-amber-500 font-bold">드래그로 r값 조정 중 · r = 1 - (d/scale)²/2</span>}
              </div>
            </div>
          </div>

          {/* Detail panel */}
          <div className="xl:col-span-4 space-y-3">
            {/* Selected node detail */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              {selectedNode !== null ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800">{symptoms[selectedNode]}</h4>
                    <span className="text-[9px] font-bold text-indigo-500">연결: {degree[selectedNode]}</span>
                  </div>

                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {selectedEdges.map((e, i) => {
                      const isPos = e.r > 0;
                      return (
                        <div key={i}
                          className="p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => setSelectedNode(e.partner)}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold text-slate-700 truncate flex-1">
                              {symptoms[e.partner]}
                            </span>
                            <div className="flex items-center gap-1">
                              {e.originalR !== undefined && e.originalR !== e.r && (
                                <span className="text-[8px] font-mono text-slate-300 line-through">
                                  {e.originalR.toFixed(3)}
                                </span>
                              )}
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                e.originalR !== undefined && e.originalR !== e.r
                                  ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                  : isPos ? 'bg-indigo-50 text-indigo-700' : 'bg-red-50 text-red-700'
                              }`}>
                                r={e.r.toFixed(3)}
                              </span>
                            </div>
                          </div>
                          {(e.note_ko || e.note_en) && (
                            <div className="mt-1 leading-relaxed space-y-0.5">
                              {e.note_ko && <div className="text-[9px] text-slate-600 font-medium">{e.note_ko}</div>}
                              {e.note_en && <div className="text-[8px] text-slate-400">{e.note_en}</div>}
                            </div>
                          )}
                          <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full"
                              style={{
                                width: `${Math.abs(e.r) * 100}%`,
                                backgroundColor: isPos ? '#6366f1' : '#ef4444',
                              }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-300 space-y-2">
                  <Eye className="w-6 h-6 mx-auto opacity-40" />
                  <p className="text-[10px] font-medium">증상 노드를 클릭하면<br />모델의 이해를 확인할 수 있습니다</p>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">추출 통계</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-400 font-bold">증상 수</div>
                  <div className="text-lg font-black text-slate-800">{symptoms.length}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-400 font-bold">추출된 상관관계</div>
                  <div className="text-lg font-black text-indigo-600">{extractedEdges.length}</div>
                </div>
                <div className="bg-indigo-50 p-2 rounded-lg">
                  <div className="text-[9px] text-indigo-400 font-bold">양의 상관</div>
                  <div className="text-lg font-black text-indigo-700">
                    {extractedEdges.filter(e => e.r > 0).length}
                  </div>
                </div>
                <div className="bg-red-50 p-2 rounded-lg">
                  <div className="text-[9px] text-red-400 font-bold">음의 상관</div>
                  <div className="text-lg font-black text-red-700">
                    {extractedEdges.filter(e => e.r < 0).length}
                  </div>
                </div>
              </div>

              {/* Top connected */}
              <div>
                <h5 className="text-[9px] font-black text-slate-400 uppercase mb-1">핵심 증상 (연결 수)</h5>
                {Object.entries(degree)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([idx, deg]) => (
                    <div key={idx} className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-slate-50 rounded px-1"
                      onClick={() => setSelectedNode(parseInt(idx))}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-[9px] font-bold text-slate-600 flex-1 truncate">{getShortLabel(symptoms[idx])}</span>
                      <span className="text-[9px] font-mono text-slate-400">{deg}</span>
                    </div>
                  ))
                }
              </div>

              <button onClick={handleExport}
                className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-2">
                <Download className="w-3.5 h-3.5" /> 추출 데이터 내보내기 (JSON)
              </button>

              <div className="text-[8px] text-slate-400">
                <strong>모델:</strong> {modelName}<br />
                <strong>출처:</strong> LLM 지식 추출 (검증 필요)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw response (collapsible) */}
      {rawResponse && (
        <details className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <summary className="px-4 py-3 text-[10px] font-bold text-slate-400 cursor-pointer hover:bg-slate-50">
            모델 원본 응답 보기 (디버그)
          </summary>
          <pre className="px-4 pb-4 text-[9px] font-mono text-slate-500 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {rawResponse}
          </pre>
        </details>
      )}
    </div>
  );
}
