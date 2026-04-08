import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Stethoscope, ChevronDown, ChevronRight, RotateCcw, Star, Loader2 } from 'lucide-react';

const DISEASES = [
  { key: 'common_cold', name_ko: '감기', name_en: 'Common Cold' },
  { key: 'allergic_rhinitis', name_ko: '알레르기 비염', name_en: 'Allergic Rhinitis' },
  { key: 'functional_dyspepsia', name_ko: '기능성 소화불량', name_en: 'Functional Dyspepsia' },
  { key: 'lower_back_pain', name_ko: '요통', name_en: 'Lower Back Pain' },
];

const SYNDROME_COLORS = [
  '#6366f1', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6',
  '#10b981', '#f97316', '#ec4899', '#64748b', '#06b6d4',
];

function getShortSyndromeName(name) {
  if (!name) return '';
  let short = name.replace(/\s*(환자\s+)?생성.*$/u, '').trim();
  short = short.replace(/\s+(감기|비염|요통|소화불량).*$/u, '').trim();
  return short || name;
}

// status: 'picker' | 'loading' | 'error' | 'ready'
export default function DiseaseSimulatorTab() {
  const [status, setStatus] = useState('picker');
  const [selectedDisease, setSelectedDisease] = useState(null);
  const [generalData, setGeneralData] = useState(null);
  const [syndromeData, setSyndromeData] = useState(null);
  const [syndromeNames, setSyndromeNames] = useState({});
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [selections, setSelections] = useState({});
  const [errorMsg, setErrorMsg] = useState('');
  const fetchRef = useRef(0);

  const loadDisease = useCallback(async (diseaseKey) => {
    const fetchId = ++fetchRef.current;
    setSelectedDisease(diseaseKey);
    setStatus('loading');
    setGeneralData(null);
    setSyndromeData(null);
    setSelections({});
    setExpandedSections(new Set());

    try {
      const [indexRes, genRes, synRes] = await Promise.all([
        fetch('/data/diseases/index.json'),
        fetch(`/data/diseases/normalized_general_probs/${diseaseKey}_normalized_general.json`),
        fetch(`/data/diseases/horizontal_syndrome_probs/${diseaseKey}_syndrome_probs.json`),
      ]);

      if (fetchRef.current !== fetchId) return;
      if (!indexRes.ok || !genRes.ok || !synRes.ok) throw new Error('HTTP error');

      const indexData = await indexRes.json();
      const genData = await genRes.json();
      const synData = await synRes.json();

      if (fetchRef.current !== fetchId) return;
      if (!genData?.variables || !synData?.variables) throw new Error('데이터 형식 오류');

      setSyndromeNames(indexData.diseases?.[diseaseKey]?.syndrome_names || {});
      setGeneralData(genData);
      setSyndromeData(synData);
      setStatus('ready');
    } catch (e) {
      if (fetchRef.current === fetchId) {
        setErrorMsg(e.message);
        setStatus('error');
      }
    }
  }, []);

  const goBackToPicker = useCallback(() => {
    setStatus('picker');
    setSelectedDisease(null);
    setGeneralData(null);
    setSyndromeData(null);
  }, []);

  // Group variables by section
  const sectionGroups = useMemo(() => {
    if (!generalData?.variables) return [];
    const groups = new Map();
    generalData.variables.forEach((v, idx) => {
      if (!groups.has(v.section)) groups.set(v.section, []);
      groups.get(v.section).push({ ...v, globalIdx: idx });
    });
    return Array.from(groups.entries());
  }, [generalData]);

  // Compute syndrome probabilities from selections
  const syndromeProbs = useMemo(() => {
    if (!syndromeData?.variables || !syndromeData?.syndrome_keys || Object.keys(selections).length === 0) return null;

    const synKeys = syndromeData.syndrome_keys;
    const sums = {};
    synKeys.forEach(k => { sums[k] = 0; });
    let validCount = 0;

    Object.entries(selections).forEach(([varIdx, optIdx]) => {
      const variable = syndromeData.variables[parseInt(varIdx)];
      if (!variable) return;
      const option = variable.options?.[optIdx];
      if (!option?.normalized_probabilities) return;

      const hasValid = synKeys.some(k => option.normalized_probabilities[k] != null);
      if (!hasValid) return;

      validCount++;
      synKeys.forEach(k => {
        const p = option.normalized_probabilities[k];
        if (p != null) sums[k] += p;
      });
    });

    if (validCount === 0) return null;
    const result = {};
    synKeys.forEach(k => { result[k] = sums[k] / validCount; });
    return result;
  }, [syndromeData, selections]);

  const toggleSection = useCallback((section) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const selectOption = useCallback((varIdx, optIdx) => {
    setSelections(prev => {
      const next = { ...prev };
      if (next[varIdx] === optIdx) delete next[varIdx];
      else next[varIdx] = optIdx;
      return next;
    });
  }, []);

  const selectedCount = Object.keys(selections).length;

  // ── PICKER ──
  if (status === 'picker') {
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-700">질환별 증상 시뮬레이터</h3>
            <span className="text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold">
              Experimental
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mb-4">
            질환을 선택하면 임상 데이터 기반 증상 확률과 변증 분석을 탐색할 수 있습니다
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DISEASES.map(d => (
              <button key={d.key} onClick={() => loadDisease(d.key)}
                className="p-4 rounded-xl border-2 border-slate-200 hover:border-teal-300 hover:bg-teal-50 transition-all text-left group">
                <div className="text-sm font-bold text-slate-700 group-hover:text-teal-700">{d.name_ko}</div>
                <div className="text-[10px] text-slate-400 mt-1">{d.name_en}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING ──
  if (status === 'loading') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
        <Loader2 className="w-8 h-8 mx-auto mb-3 text-teal-500 animate-spin" />
        <p className="text-sm text-slate-400">데이터 로딩중...</p>
      </div>
    );
  }

  // ── ERROR ──
  if (status === 'error') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-8 text-center">
        <p className="text-sm text-red-500 mb-2">데이터 로드 실패</p>
        <p className="text-[10px] text-red-400 font-mono mb-3">{errorMsg}</p>
        <button onClick={goBackToPicker} className="text-[10px] text-slate-400 underline">
          질환 선택으로 돌아가기
        </button>
      </div>
    );
  }

  // ── READY — guaranteed generalData and syndromeData exist ──
  const diseaseInfo = DISEASES.find(d => d.key === selectedDisease);
  const synKeys = syndromeData.syndrome_keys || [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-700">
              {diseaseInfo?.name_ko} ({diseaseInfo?.name_en})
            </h3>
            <span className="text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold">
              Experimental
            </span>
            <span className="text-[8px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">
              {generalData.total_variables}개 변수
            </span>
            {selectedCount > 0 && (
              <span className="text-[9px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold">
                {selectedCount}개 선택
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <button onClick={() => setSelections({})}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-red-500 border border-slate-200 rounded-lg transition-colors">
                <RotateCcw className="w-3 h-3" /> 초기화
              </button>
            )}
            <button onClick={goBackToPicker}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1 border border-slate-200 rounded-lg transition-colors">
              질환 변경
            </button>
          </div>
        </div>
        {synKeys.length > 0 && (
          <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
            <span className="text-[8px] text-slate-400 font-bold">변증:</span>
            {synKeys.map((k, i) => {
              const color = SYNDROME_COLORS[i % SYNDROME_COLORS.length];
              return (
                <span key={k} className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: color + '20', color }}>
                  {getShortSyndromeName(syndromeNames[k])}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Left: Sections accordion */}
        <div className="xl:col-span-8 space-y-1">
          {sectionGroups.map(([sectionName, vars]) => {
            const isExpanded = expandedSections.has(sectionName);
            const sectionSelected = vars.filter(v => selections[v.globalIdx] !== undefined).length;

            const subGroups = [];
            let currentSub = null;
            vars.forEach(v => {
              if (v.subcategory !== currentSub) {
                currentSub = v.subcategory;
                subGroups.push({ name: currentSub, variables: [] });
              }
              subGroups[subGroups.length - 1].variables.push(v);
            });

            return (
              <div key={sectionName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button onClick={() => toggleSection(sectionName)}
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                    <span className="text-[11px] font-bold text-slate-700">{sectionName}</span>
                    <span className="text-[9px] text-slate-400">{vars.length}개 변수</span>
                  </div>
                  {sectionSelected > 0 && (
                    <span className="text-[8px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold">
                      {sectionSelected}개 선택
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1 border-t border-slate-100 pt-2">
                    {subGroups.map((sub, si) => (
                      <div key={si}>
                        {sub.name && (
                          <div className="text-[8px] font-bold text-slate-300 uppercase tracking-wider mt-2 mb-1 px-1">
                            {sub.name}
                          </div>
                        )}
                        {sub.variables.map(v => {
                          const selectedOpt = selections[v.globalIdx];
                          return (
                            <div key={v.globalIdx}
                              className={`p-2 rounded-lg transition-colors ${
                                selectedOpt !== undefined ? 'bg-teal-50 ring-1 ring-teal-200' : ''
                              }`}>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                {v.importance != null && v.importance <= 2 && (
                                  <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                                )}
                                <span className="text-[10px] font-bold text-slate-700">{v.variable}</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {v.options.map((opt, optIdx) => {
                                  const isSelected = selectedOpt === optIdx;
                                  const prob = opt.normalized_general;
                                  const label = opt.label
                                    || (opt.description?.length > 30
                                      ? opt.description.substring(0, 30) + '…'
                                      : opt.description);
                                  return (
                                    <button key={optIdx}
                                      onClick={() => selectOption(v.globalIdx, optIdx)}
                                      className={`px-2 py-1 rounded-md text-[9px] font-medium transition-all border ${
                                        isSelected
                                          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                                          : prob > 0
                                            ? 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:bg-teal-50'
                                            : 'bg-slate-50 text-slate-300 border-slate-100'
                                      }`}
                                      title={opt.description}>
                                      {label}
                                      {prob > 0 && (
                                        <span className={`ml-1 text-[7px] font-bold ${
                                          isSelected ? 'text-teal-200' : 'text-slate-400'
                                        }`}>
                                          {Math.round(prob * 100)}%
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: Syndrome panel */}
        <div className="xl:col-span-4 space-y-3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sticky top-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">
              변증 확률 분석
            </h4>
            {!syndromeProbs ? (
              <p className="text-[10px] text-slate-300 py-4 text-center">
                증상 옵션을 선택하면 변증 확률이 계산됩니다
              </p>
            ) : (
              <div className="space-y-2.5">
                {synKeys.map((k, i) => {
                  const prob = syndromeProbs[k] || 0;
                  const color = SYNDROME_COLORS[i % SYNDROME_COLORS.length];
                  return (
                    <div key={k}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] font-bold text-slate-600 truncate" style={{ maxWidth: '70%' }}>
                          {getShortSyndromeName(syndromeNames[k])}
                        </span>
                        <span className="text-[11px] font-black" style={{ color }}>
                          {Math.round(prob * 100)}%
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.round(prob * 100)}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedCount > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                선택된 옵션 ({selectedCount}개)
              </h4>
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {Object.entries(selections).map(([varIdx, optIdx]) => {
                  const v = generalData?.variables?.[parseInt(varIdx)];
                  if (!v) return null;
                  const opt = v.options?.[optIdx];
                  if (!opt) return null;
                  return (
                    <div key={varIdx}
                      className="flex items-center justify-between p-1.5 rounded-md bg-teal-50 text-[9px]">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-600">{v.variable}: </span>
                        <span className="text-teal-700">{opt.label || opt.description}</span>
                      </div>
                      <button onClick={() => selectOption(parseInt(varIdx), optIdx)}
                        className="text-slate-300 hover:text-red-400 ml-1 flex-shrink-0 text-sm">×</button>
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
