import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Loader2, Network, RotateCcw, Send, SlidersHorizontal, Plus, Trash2, X } from 'lucide-react';

const DATA_URL = '/data/average_heatmap_data.json';
const GRAPH_W = 700;
const GRAPH_H = 700;
const GRAPH_LAYOUT_MIN_R = 0.12;

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#1dca91', '#ef4444', '#8b5cf6',
  '#0ea5e9', '#f97316', '#14b8a6', '#a855f7', '#22c55e', '#e11d48',
  '#06b6d4', '#d97706', '#7c3aed', '#059669', '#dc2626', '#2563eb',
  '#ca8a04', '#9333ea', '#0d9488', '#db2777', '#65a30d', '#4f46e5',
  '#ea580c', '#16a34a', '#be185d', '#1d4ed8', '#b45309', '#7e22ce',
];

function getKorean(label) {
  return label.match(/^([^\s(]+)/)?.[1] || label;
}

function getEnglish(label) {
  return label.match(/\(([^)]+)\)/)?.[1] || '';
}

function clampCorrelation(value) {
  return Math.max(-1, Math.min(1, value));
}

function createMatrix(symptoms, correlations, valueKey = 'meanR') {
  const n = symptoms.length;
  const matrix = Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => (row === col ? 1 : 0))
  );

  correlations.forEach(edge => {
    const a = Number(edge.a);
    const b = Number(edge.b);
    const r = Number(edge[valueKey] ?? edge.r ?? 0);
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < n && b < n && a !== b) {
      matrix[a][b] = clampCorrelation(r);
      matrix[b][a] = clampCorrelation(r);
    }
  });

  return matrix;
}

function matrixToEdges(matrix, threshold = 0) {
  const edges = [];
  for (let a = 0; a < matrix.length; a++) {
    for (let b = a + 1; b < matrix.length; b++) {
      const r = matrix[a][b];
      if (Math.abs(r) >= threshold) edges.push({ a, b, r });
    }
  }
  return edges;
}

function layoutNodes(nodes, edges, width, height) {
  const n = nodes.length;
  const pos = {};
  nodes.forEach((_, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = Math.min(width, height) * 0.34;
    pos[i] = {
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    };
  });

  for (let iter = 0; iter < 140; iter++) {
    const forces = {};
    nodes.forEach((_, i) => { forces[i] = { x: 0, y: 0 }; });

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 900 / (dist * dist);
        forces[i].x += (dx / dist) * force;
        forces[i].y += (dy / dist) * force;
        forces[j].x -= (dx / dist) * force;
        forces[j].y -= (dy / dist) * force;
      }
    }

    edges.forEach(({ a, b, r }) => {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const ideal = 70 + (1 - Math.abs(r)) * 230;
      const force = (dist - ideal) * 0.01;
      forces[a].x += (dx / dist) * force;
      forces[a].y += (dy / dist) * force;
      forces[b].x -= (dx / dist) * force;
      forces[b].y -= (dy / dist) * force;
    });

    nodes.forEach((_, i) => {
      forces[i].x += (width / 2 - pos[i].x) * 0.006;
      forces[i].y += (height / 2 - pos[i].y) * 0.006;
    });

    const damping = 1 - iter / 140;
    nodes.forEach((_, i) => {
      pos[i].x += forces[i].x * damping;
      pos[i].y += forces[i].y * damping;
      pos[i].x = Math.max(45, Math.min(width - 45, pos[i].x));
      pos[i].y = Math.max(45, Math.min(height - 45, pos[i].y));
    });
  }

  return pos;
}

function getCellColor(value, isDiagonal) {
  if (isDiagonal) return 'rgba(15, 23, 42, 0.08)';
  if (Math.abs(value) < 0.001) return '#fff';
  const alpha = Math.max(0.12, Math.abs(value) * 0.82);
  return value > 0 ? `rgba(99, 102, 241, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
}

function createDataPayload(symptoms, matrix, metadata = {}) {
  return {
    metadata: {
      source: 'average_matrix_editor',
      editedAt: new Date().toISOString(),
      ...metadata,
    },
    symptoms: symptoms.map((label, index) => ({ index, label })),
    correlations: matrixToEdges(matrix, 0).map(edge => ({
      ...edge,
      r: Number(edge.r.toFixed(6)),
    })),
  };
}

export default function AverageMatrixEditorTab({ onDataApplied }) {
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [sourceData, setSourceData] = useState(null);
  const [symptoms, setSymptoms] = useState([]);
  const [matrix, setMatrix] = useState([]);
  const [originalMatrix, setOriginalMatrix] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [editError, setEditError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [minR, setMinR] = useState(0.15);
  const [showNumbers, setShowNumbers] = useState(false);

  // Merged View State
  const [isMergedView, setIsMergedView] = useState(false);
  const [groupsMetadata, setGroupsMetadata] = useState([]);

  // Group Modal State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupKo, setGroupKo] = useState('');
  const [groupEn, setGroupEn] = useState('');
  const [groupMembers, setGroupMembers] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    async function loadAverageData() {
      setStatus('loading');
      setLoadError(null);
      try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const labels = data.symptoms.map(item => item.label);
        const initialMatrix = createMatrix(labels, data.correlations, 'meanR');
        if (!cancelled) {
          setSourceData(data);
          setSymptoms(labels);
          setMatrix(initialMatrix);
          setOriginalMatrix(initialMatrix);
          setStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message);
          setStatus('error');
        }
      }
    }
    loadAverageData();
    return () => { cancelled = true; };
  }, []);



  const allEdges = useMemo(() => matrixToEdges(matrix, 0.001), [matrix]);

  const hiddenIndices = useMemo(() => {
    if (!isMergedView) return new Set();
    const hidden = new Set();
    groupsMetadata.forEach(g => {
       g.members.forEach(name => {
          const idx = symptoms.indexOf(name);
          if (idx !== -1) hidden.add(idx);
       });
    });
    return hidden;
  }, [isMergedView, groupsMetadata, symptoms]);

  const visibleIndices = useMemo(() => {
    const indices = [];
    symptoms.forEach((_, idx) => {
      if (!hiddenIndices.has(idx)) indices.push(idx);
    });
    return indices;
  }, [symptoms, hiddenIndices]);

  const graphEdges = useMemo(() => matrixToEdges(matrix, minR <= 0 ? 0.001 : minR), [matrix, minR]);

  const layoutEdges = useMemo(() => {
    const edges = matrixToEdges(matrix, Math.max(minR, GRAPH_LAYOUT_MIN_R));
    return edges.length > 0 ? edges : matrixToEdges(matrix, 0.05);
  }, [matrix, minR]);

  const positions = useMemo(() => {
    if (visibleIndices.length === 0) return {};
    
    const visibleLayoutEdges = layoutEdges
      .filter(e => !hiddenIndices.has(e.a) && !hiddenIndices.has(e.b))
      .map(e => ({
        a: visibleIndices.indexOf(e.a),
        b: visibleIndices.indexOf(e.b),
        r: e.r
      }));

    const visibleSymptoms = visibleIndices.map(idx => symptoms[idx]);
    const rawPos = layoutNodes(visibleSymptoms, visibleLayoutEdges, GRAPH_W, GRAPH_H);
    
    const finalPos = {};
    visibleIndices.forEach((realIdx, mappedIdx) => {
      finalPos[realIdx] = rawPos[mappedIdx];
    });
    return finalPos;
  }, [symptoms, visibleIndices, layoutEdges, hiddenIndices]);

  const degree = useMemo(() => {
    const counts = {};
    symptoms.forEach((_, idx) => { counts[idx] = 0; });
    graphEdges.forEach(({ a, b }) => {
      counts[a]++;
      counts[b]++;
    });
    return counts;
  }, [symptoms, graphEdges]);

  const connectedToSelected = useMemo(() => {
    const connected = new Set();
    if (selectedNode === null) return connected;
    graphEdges.forEach(edge => {
      if (edge.a === selectedNode) connected.add(edge.b);
      if (edge.b === selectedNode) connected.add(edge.a);
    });
    return connected;
  }, [selectedNode, graphEdges]);

  const selectedEdges = useMemo(() => {
    if (selectedNode === null) return [];
    return graphEdges
      .filter(edge => edge.a === selectedNode || edge.b === selectedNode)
      .map(edge => ({ ...edge, partner: edge.a === selectedNode ? edge.b : edge.a }))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }, [selectedNode, graphEdges]);

  const stats = useMemo(() => {
    const values = allEdges.map(edge => edge.r);
    return {
      nonZero: values.length,
      positive: values.filter(value => value > 0).length,
      negative: values.filter(value => value < 0).length,
      maxAbs: values.length ? Math.max(...values.map(value => Math.abs(value))) : 0,
    };
  }, [allEdges]);

  const setCorrelationValue = useCallback((row, col, rawValue) => {
    const key = `${row}-${col}`;
    setDrafts(prev => ({ ...prev, [key]: rawValue }));

    if (row === col) return;
    const next = Number(rawValue);
    if (!Number.isFinite(next)) {
      setEditError('숫자를 입력해주세요.');
      return;
    }
    if (next < -1 || next > 1) {
      setEditError('상관계수는 -1부터 1 사이여야 합니다.');
      return;
    }

    setEditError(null);
    setMatrix(prev => {
      const copy = prev.map(rowValues => [...rowValues]);
      const value = clampCorrelation(next);
      copy[row][col] = value;
      copy[col][row] = value;
      return copy;
    });
  }, []);

  const finishEdit = useCallback((row, col) => {
    const key = `${row}-${col}`;
    setDrafts(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }, []);

  const resetMatrix = useCallback(() => {
    setMatrix(originalMatrix.map(row => [...row]));
    if (sourceData) {
      setSymptoms(sourceData.symptoms.map(item => item.label));
    }
    setDrafts({});
    setEditError(null);
    setSelectedNode(null);
    setSelectedCell(null);
  }, [originalMatrix, sourceData]);

  const removeNode = useCallback((idxToRemove) => {
    const nodeName = symptoms[idxToRemove];
    if (!window.confirm(`'${getKorean(nodeName)}' 노드를 삭제하시겠습니까?`)) return;
    
    setSymptoms(prev => prev.filter((_, i) => i !== idxToRemove));
    setMatrix(prev => prev.filter((_, i) => i !== idxToRemove).map(row => row.filter((_, j) => j !== idxToRemove)));
    setGroupsMetadata(prev => prev.filter(g => g.name !== nodeName));
    
    if (selectedNode === idxToRemove) setSelectedNode(null);
    else if (selectedNode !== null && selectedNode > idxToRemove) setSelectedNode(selectedNode - 1);

    if (selectedCell) {
        if (selectedCell.row === idxToRemove || selectedCell.col === idxToRemove) setSelectedCell(null);
        else setSelectedCell({
           row: selectedCell.row > idxToRemove ? selectedCell.row - 1 : selectedCell.row,
           col: selectedCell.col > idxToRemove ? selectedCell.col - 1 : selectedCell.col
        });
    }
  }, [symptoms, selectedNode, selectedCell]);

  const handleCreateGroup = useCallback(() => {
    if (!groupKo.trim()) return;
    const label = `${groupKo.trim()}${groupEn.trim() ? ` (${groupEn.trim()})` : ''}`;
    const memberNames = Array.from(groupMembers).map(idx => symptoms[idx]);
    
    setGroupsMetadata(prev => [...prev, { name: label, members: memberNames }]);
    setSymptoms(prev => [...prev, label]);
    setMatrix(prev => {
      const size = prev.length;
      const newMatrix = prev.map(row => [...row, 0]);
      const newRow = Array(size + 1).fill(0);
      newRow[size] = 1; // diagonal
      
      // Auto-correlate with members so they cluster in the graph
      groupMembers.forEach(idx => {
        newMatrix[idx][size] = 0.8;
        newRow[idx] = 0.8;
      });
      
      newMatrix.push(newRow);
      return newMatrix;
    });
    
    setIsGroupModalOpen(false);
    setGroupKo('');
    setGroupEn('');
    setGroupMembers(new Set());
    setSelectedNode(symptoms.length); // Select the newly created node
  }, [groupKo, groupEn, groupMembers, symptoms, symptoms.length]);

  const toggleGroupMember = useCallback((idx) => {
    setGroupMembers(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const applyToSimulators = useCallback(() => {
    if (!onDataApplied || symptoms.length === 0) return;
    onDataApplied(
      symptoms,
      matrixToEdges(matrix, 0).map(edge => ({ ...edge, note_ko: '', note_en: '' }))
    );
  }, [matrix, onDataApplied, symptoms]);

  const exportEditedMatrix = useCallback(() => {
    const payload = createDataPayload(symptoms, matrix, {
      baseRunCount: sourceData?.metadata?.runCount,
      baseSource: DATA_URL,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `edited_average_matrix_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [matrix, sourceData, symptoms]);

  if (status === 'loading') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
        <div className="text-sm font-bold">평균 행렬을 불러오는 중...</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-700 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5" />
        <div className="text-sm font-bold">평균 행렬 로드 실패: {loadError}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <div className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden xl:aspect-square flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-800">
                <Network className="w-4 h-4 text-indigo-500" />
                증상 네트워크
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMergedView(!isMergedView)}
                  className={`px-2 py-1 text-[9px] font-bold rounded border transition-colors ${
                    isMergedView 
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {isMergedView ? '병합 뷰 (Merged)' : '계층 뷰 (Hierarchical)'}
                </button>
                <div className="h-4 w-px bg-slate-200" />
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-[9px] text-slate-400 font-bold">최소 |r|</span>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={minR}
                  onChange={event => setMinR(Number(event.target.value))}
                  className="w-20 h-1 accent-indigo-600"
                />
                <span className="text-[10px] font-mono font-bold text-indigo-600">{minR.toFixed(2)}</span>
              </div>
            </div>

            <div className="p-3 flex-1 min-h-0">
              <div className="bg-slate-50/70 rounded-xl border border-slate-100 p-2 h-full">
                <svg width={GRAPH_W} height={GRAPH_H} viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} className="w-full h-full">
                  {graphEdges.map((edge, idx) => {
                    if (hiddenIndices.has(edge.a) || hiddenIndices.has(edge.b)) return null;
                    const p1 = positions[edge.a];
                    const p2 = positions[edge.b];
                    if (!p1 || !p2) return null;
                    const absR = Math.abs(edge.r);
                    const isConnected = selectedNode !== null && (edge.a === selectedNode || edge.b === selectedNode);
                    const opacity = selectedNode !== null
                      ? (isConnected ? 0.8 : 0.035)
                      : Math.max(0.08, absR * 0.65);
                    return (
                      <line
                        key={`${edge.a}-${edge.b}-${idx}`}
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke={edge.r >= 0 ? '#6366f1' : '#ef4444'}
                        strokeWidth={isConnected ? Math.max(1.5, absR * 5) : Math.max(0.35, absR * 2.5)}
                        opacity={opacity}
                        strokeDasharray={edge.r >= 0 ? 'none' : '4 3'}
                        className="transition-all duration-500"
                      />
                    );
                  })}

                  {symptoms.map((label, idx) => {
                    if (hiddenIndices.has(idx)) return null;
                    const pos = positions[idx];
                    if (!pos) return null;
                    const isSelected = selectedNode === idx;
                    const isConnected = connectedToSelected.has(idx);
                    const opacity = selectedNode === null || isSelected || isConnected ? 1 : 0.14;
                    const radius = Math.max(8, Math.min(22, 7 + (degree[idx] || 0) * 1.1));
                    const color = COLORS[idx % COLORS.length];
                    
                    const groupMeta = groupsMetadata.find(g => g.name === label);
                    const tooltipText = groupMeta 
                      ? `${getKorean(label)}\n포함 증상: ${groupMeta.members.map(getKorean).join(', ')}` 
                      : getKorean(label);

                    return (
                      <g
                        key={idx}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        className="cursor-pointer transition-all duration-500"
                        style={{ opacity }}
                        onClick={() => setSelectedNode(isSelected ? null : idx)}
                      >
                        <title>{tooltipText}</title>
                        {isSelected && <circle r={radius + 6} fill={color} opacity={0.16} />}
                        <circle
                          r={radius}
                          fill={isSelected ? color : 'white'}
                          stroke={color}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                        <text
                          y={radius + 13}
                          textAnchor="middle"
                          className="text-[9px] font-bold pointer-events-none select-none"
                          fill={isSelected ? '#1e293b' : '#94a3b8'}
                        >
                          {getKorean(label)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 min-h-[220px]">
              {selectedNode !== null ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-slate-800">{symptoms[selectedNode]}</h4>
                      {getEnglish(symptoms[selectedNode]) && (
                        <div className="text-[10px] text-slate-400">{getEnglish(symptoms[selectedNode])}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-[9px] font-bold text-indigo-500">연결 {degree[selectedNode] || 0}</span>
                      <button 
                        onClick={() => removeNode(selectedNode)}
                        className="text-[9px] font-bold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> 삭제
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                    {selectedEdges.map(edge => (
                      <button
                        type="button"
                        key={`${edge.a}-${edge.b}`}
                        onClick={() => setSelectedNode(edge.partner)}
                        className="w-full text-left p-2 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-slate-700 truncate">{symptoms[edge.partner]}</span>
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            edge.r >= 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-red-50 text-red-700'
                          }`}>
                            r={edge.r.toFixed(3)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center text-slate-300">
                  <div className="text-[10px] font-bold">노드나 행렬 라벨을 선택하세요</div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">평균 행렬 통계</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-400 font-bold">평균 실행 수</div>
                  <div className="text-lg font-black text-slate-800">{sourceData?.metadata?.runCount || '-'}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-400 font-bold">그래프 표시</div>
                  <div className="text-lg font-black text-indigo-600">{graphEdges.length}</div>
                </div>
                <div className="bg-indigo-50 p-2 rounded-lg">
                  <div className="text-[9px] text-indigo-400 font-bold">양의 상관</div>
                  <div className="text-lg font-black text-indigo-700">{stats.positive}</div>
                </div>
                <div className="bg-red-50 p-2 rounded-lg">
                  <div className="text-[9px] text-red-400 font-bold">음의 상관</div>
                  <div className="text-lg font-black text-red-700">{stats.negative}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetMatrix}
                  className="px-3 py-2 text-[10px] font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 초기화
                </button>
                <button
                  type="button"
                  onClick={applyToSimulators}
                  className="px-3 py-2 text-[10px] font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> 시뮬레이터 적용
                </button>
                <button
                  type="button"
                  onClick={exportEditedMatrix}
                  className="px-3 py-2 text-[10px] font-bold rounded-lg bg-slate-800 text-white hover:bg-slate-900 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden xl:aspect-square flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">편집 가능한 평균 상관행렬</h3>
              <div className="text-[9px] text-slate-400 mt-0.5">
                {symptoms.length} x {symptoms.length} · 값 범위 -1.00 ~ 1.00
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editError && (
                <div className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg">
                  {editError}
                </div>
              )}
              <button
                onClick={() => setShowNumbers(!showNumbers)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors border ${
                  showNumbers 
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {showNumbers ? '격자 숫자 숨기기' : '격자 숫자 보기'}
              </button>
              <button
                onClick={() => setIsGroupModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-[10px] font-bold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> 그룹/메타 증상 추가
              </button>
            </div>
          </div>

          {selectedCell && !showNumbers && (
            <div className="bg-indigo-50/60 border-b border-indigo-100 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 transition-all">
              <div className="flex items-center gap-3 flex-1 w-full">
                <div className="flex items-center gap-2 text-sm font-black text-slate-800 min-w-[140px]">
                  <span className="truncate max-w-[120px]" title={symptoms[selectedCell.row]}>{getKorean(symptoms[selectedCell.row])}</span>
                  <span className="text-indigo-300">↔</span>
                  <span className="truncate max-w-[120px]" title={symptoms[selectedCell.col]}>{getKorean(symptoms[selectedCell.col])}</span>
                </div>
                <div className="flex-1 max-w-sm flex items-center gap-3 bg-white px-3 py-2 rounded-xl shadow-sm border border-indigo-100">
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={matrix[selectedCell.row]?.[selectedCell.col] ?? 0}
                    onChange={(e) => setCorrelationValue(selectedCell.row, selectedCell.col, e.target.value)}
                    className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <input
                    type="number"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={drafts[`${selectedCell.row}-${selectedCell.col}`] ?? (matrix[selectedCell.row]?.[selectedCell.col] ?? 0).toFixed(2)}
                    onChange={(e) => setCorrelationValue(selectedCell.row, selectedCell.col, e.target.value)}
                    onBlur={() => finishEdit(selectedCell.row, selectedCell.col)}
                    className="w-16 px-1 py-0.5 text-center text-sm font-black text-indigo-700 bg-indigo-50/50 border border-indigo-200 rounded outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-indigo-400 hover:text-indigo-600 bg-white p-1.5 rounded-lg shadow-sm border border-indigo-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-1.5 bg-slate-50/30">
            <table className="border-collapse w-full h-full table-fixed">
              <thead>
                <tr>
                  <th className="bg-transparent border-b border-r border-slate-200 w-[50px]" />
                  {symptoms.map((label, colIdx) => {
                    if (hiddenIndices.has(colIdx)) return null;
                    const isSelected = selectedNode === colIdx || selectedCell?.col === colIdx;
                    return (
                      <th
                        key={colIdx}
                        className="bg-transparent border-b border-slate-200 p-0 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setSelectedNode(isSelected ? null : colIdx)}
                      >
                        <div
                          className="h-[48px] w-full flex items-end justify-center text-[7px] font-black pb-1"
                          style={{
                            writingMode: 'vertical-rl',
                            color: isSelected ? '#4f46e5' : '#64748b',
                          }}
                        >
                          {getKorean(label)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="h-full">
                {symptoms.map((rowLabel, rowIdx) => {
                  if (hiddenIndices.has(rowIdx)) return null;
                  const rowSelected = selectedNode === rowIdx || selectedCell?.row === rowIdx;
                  return (
                    <tr key={rowIdx}>
                      <td
                        className="bg-transparent border-r border-slate-200 px-1.5 py-0 text-[7px] sm:text-[8px] font-black cursor-pointer text-right truncate hover:bg-slate-50 transition-colors"
                        style={{ color: rowSelected ? '#4f46e5' : '#475569' }}
                        onClick={() => setSelectedNode(rowSelected ? null : rowIdx)}
                        title={getKorean(rowLabel)}
                      >
                        {getKorean(rowLabel)}
                      </td>
                      {symptoms.map((_, colIdx) => {
                        if (hiddenIndices.has(colIdx)) return null;
                        const value = matrix[rowIdx]?.[colIdx] ?? 0;
                        const isDiagonal = rowIdx === colIdx;
                        const selectedBand = selectedNode !== null && (rowIdx === selectedNode || colIdx === selectedNode);
                        const isCellSelected = selectedCell?.row === rowIdx && selectedCell?.col === colIdx;
                        const key = `${rowIdx}-${colIdx}`;
                        const draftValue = drafts[key] ?? value.toFixed(2);
                        const strong = Math.abs(value) > 0.42;

                        if (showNumbers) {
                          return (
                            <td
                              key={key}
                              className="border border-slate-100 p-0 relative"
                              style={{
                                backgroundColor: getCellColor(value, isDiagonal),
                                outline: selectedBand ? '1px solid rgba(79, 70, 229, 0.42)' : 'none',
                              }}
                            >
                              <input
                                type="number"
                                min="-1"
                                max="1"
                                step="0.01"
                                readOnly={isDiagonal}
                                value={isDiagonal ? '1' : draftValue}
                                onChange={event => setCorrelationValue(rowIdx, colIdx, event.target.value)}
                                onBlur={() => finishEdit(rowIdx, colIdx)}
                                onFocus={event => event.target.select()}
                                className={`absolute inset-0 w-full h-full text-center text-[6.5px] lg:text-[7px] font-black bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none m-0 p-0 ${
                                  strong && !isDiagonal ? 'text-white' : 'text-slate-800'
                                } ${isDiagonal ? 'cursor-not-allowed' : ''}`}
                                title={`${rowLabel} ↔ ${symptoms[colIdx]}: r=${value.toFixed(3)}`}
                              />
                            </td>
                          );
                        }

                        return (
                          <td
                            key={key}
                            className={`border border-white p-0 relative transition-all duration-200 ${
                              isDiagonal ? 'cursor-not-allowed opacity-40' : 'cursor-pointer opacity-90 hover:opacity-100 hover:z-[5]'
                            }`}
                            style={{
                              backgroundColor: getCellColor(value, isDiagonal),
                              outline: isCellSelected ? '2px solid #4f46e5' : (selectedBand ? '1px solid rgba(79, 70, 229, 0.42)' : 'none'),
                              outlineOffset: isCellSelected ? '-1px' : '0',
                              zIndex: isCellSelected ? 10 : 1,
                              boxShadow: isCellSelected ? '0 0 8px rgba(79, 70, 229, 0.4)' : 'none'
                            }}
                            onClick={() => {
                              if (!isDiagonal) setSelectedCell({ row: rowIdx, col: colIdx });
                            }}
                            title={isDiagonal ? `${rowLabel} (1.0)` : `${getKorean(rowLabel)} ↔ ${getKorean(symptoms[colIdx])}\nr = ${value.toFixed(3)}`}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Group Creation Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Network className="w-5 h-5 text-indigo-500" />
                새 그룹 / 메타 증상 만들기
              </h3>
              <button onClick={() => setIsGroupModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-5">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5">그룹 이름 (한국어) *</label>
                  <input
                    type="text"
                    value={groupKo}
                    onChange={e => setGroupKo(e.target.value)}
                    placeholder="예: 담음+기침 증후군"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5">그룹 이름 (영어) - 선택</label>
                  <input
                    type="text"
                    value={groupEn}
                    onChange={e => setGroupEn(e.target.value)}
                    placeholder="예: Phlegm-Cough Syndrome"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-2 flex items-center justify-between">
                  <span>그룹에 포함할 증상 선택</span>
                  <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-black tracking-tight">{groupMembers.size}개 선택됨</span>
                </label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-[220px] overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {symptoms.map((label, idx) => {
                      const isSelected = groupMembers.has(idx);
                      return (
                        <button
                          key={idx}
                          onClick={() => toggleGroupMember(idx)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                              : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                          }`}
                        >
                          {getKorean(label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-bold">
                  * 선택된 증상들은 새 그룹과 자동으로 강한 상관관계(r=0.8)를 맺어 그래프에서 가깝게 배치됩니다.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
              <button
                onClick={() => setIsGroupModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                취소
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!groupKo.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> 그룹 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
