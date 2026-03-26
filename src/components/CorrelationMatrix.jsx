import React, { useMemo, useState } from 'react';
import { SYMPTOMS, CORRELATIONS, CATEGORIES, rToConditionalProb } from '../data/symptomNetwork';

export default function CorrelationMatrix({ selectedSymptom, onSelectSymptom }) {
  const [sortBy, setSortBy] = useState('category'); // 'category' | 'degree' | 'name'
  const [showMode, setShowMode] = useState('r'); // 'r' | 'prob'

  const symptomIds = useMemo(() => {
    const ids = Object.keys(SYMPTOMS);
    if (sortBy === 'category') {
      return ids.sort((a, b) => {
        const catCmp = SYMPTOMS[a].category.localeCompare(SYMPTOMS[b].category);
        return catCmp !== 0 ? catCmp : SYMPTOMS[a].ko.localeCompare(SYMPTOMS[b].ko);
      });
    }
    if (sortBy === 'degree') {
      const deg = {};
      ids.forEach(id => { deg[id] = 0; });
      CORRELATIONS.forEach(c => { deg[c.from]++; deg[c.to]++; });
      return ids.sort((a, b) => deg[b] - deg[a]);
    }
    return ids.sort((a, b) => SYMPTOMS[a].ko.localeCompare(SYMPTOMS[b].ko));
  }, [sortBy]);

  // Build lookup
  const matrix = useMemo(() => {
    const m = {};
    CORRELATIONS.forEach(({ from, to, r }) => {
      if (!m[from]) m[from] = {};
      if (!m[to]) m[to] = {};
      m[from][to] = r;
      m[to][from] = r;
    });
    return m;
  }, []);

  const getValue = (a, b) => {
    if (a === b) return showMode === 'r' ? 1 : 1;
    const r = matrix[a]?.[b];
    if (r === undefined) return null;
    return showMode === 'r' ? r : rToConditionalProb(r);
  };

  const getCellColor = (val) => {
    if (val === null) return 'transparent';
    if (showMode === 'prob') {
      const intensity = Math.round(val * 255);
      return `rgba(99, 102, 241, ${val * 0.8})`;
    }
    if (val > 0) return `rgba(99, 102, 241, ${Math.abs(val) * 0.8})`;
    return `rgba(239, 68, 68, ${Math.abs(val) * 0.8})`;
  };

  // For focused view: only show symptoms connected to selected
  const focusedIds = useMemo(() => {
    if (!selectedSymptom) return symptomIds;
    const connected = new Set([selectedSymptom]);
    CORRELATIONS.forEach(c => {
      if (c.from === selectedSymptom) connected.add(c.to);
      if (c.to === selectedSymptom) connected.add(c.from);
    });
    return symptomIds.filter(id => connected.has(id));
  }, [selectedSymptom, symptomIds]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {[
            { key: 'r', label: '상관계수 (r)' },
            { key: 'prob', label: '조건부확률 P(B|A)' },
          ].map(m => (
            <button key={m.key} onClick={() => setShowMode(m.key)}
              className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all ${
                showMode === m.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'
              }`}>{m.label}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {[
            { key: 'category', label: '카테고리' },
            { key: 'degree', label: '연결수' },
            { key: 'name', label: '이름' },
          ].map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)}
              className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-all ${
                sortBy === s.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200'
              }`}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-auto max-h-[600px] border border-slate-200 rounded-lg">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-slate-50 p-1 border-b border-r border-slate-200 min-w-[80px]" />
              {focusedIds.map(id => (
                <th key={id}
                  className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 p-0.5 cursor-pointer hover:bg-slate-100"
                  onClick={() => onSelectSymptom(id === selectedSymptom ? null : id)}
                >
                  <div className="writing-mode-vertical text-[8px] font-bold whitespace-nowrap h-[60px] flex items-end justify-center"
                    style={{
                      writingMode: 'vertical-rl',
                      color: id === selectedSymptom ? SYMPTOMS[id].color : '#64748b',
                    }}
                  >
                    {SYMPTOMS[id].ko}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {focusedIds.map(rowId => (
              <tr key={rowId}>
                <td className="sticky left-0 z-10 bg-slate-50 text-[9px] font-bold px-2 py-0.5 border-r border-slate-200 whitespace-nowrap cursor-pointer hover:bg-slate-100"
                  onClick={() => onSelectSymptom(rowId === selectedSymptom ? null : rowId)}
                  style={{ color: rowId === selectedSymptom ? SYMPTOMS[rowId].color : '#475569' }}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: CATEGORIES[SYMPTOMS[rowId].category]?.color }} />
                  {SYMPTOMS[rowId].ko}
                </td>
                {focusedIds.map(colId => {
                  const val = getValue(rowId, colId);
                  return (
                    <td key={colId}
                      className="p-0 text-center border border-slate-100"
                      style={{ width: 24, height: 24, minWidth: 24 }}
                    >
                      {val !== null ? (
                        <div className="w-full h-full flex items-center justify-center text-[7px] font-bold"
                          style={{
                            backgroundColor: getCellColor(val),
                            color: Math.abs(val) > 0.35 ? 'white' : '#475569',
                          }}
                          title={`${SYMPTOMS[rowId].ko} ↔ ${SYMPTOMS[colId].ko}: r=${matrix[rowId]?.[colId]?.toFixed(3) || '—'}`}
                        >
                          {rowId === colId ? '—' : (showMode === 'r' ? val.toFixed(2) : val.toFixed(2))}
                        </div>
                      ) : (
                        <div className="w-full h-full" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[9px] text-slate-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(99, 102, 241, 0.6)' }} />
          양의 상관 (Positive)
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }} />
          음의 상관 (Negative)
        </div>
        <div className="text-[9px] text-slate-400">
          총 {CORRELATIONS.length}개 상관관계 | 출처: 400명 차트 리뷰
        </div>
      </div>
    </div>
  );
}
