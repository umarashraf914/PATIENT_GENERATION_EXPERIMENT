import { useState, useMemo, useCallback, useRef, Component } from 'react';
import { Stethoscope, ChevronDown, ChevronRight, RotateCcw, Star, Loader2 } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div className="bg-red-50 border border-red-300 rounded-xl p-4 font-mono text-[10px] text-red-700 whitespace-pre-wrap">
        <strong>RENDER ERROR:</strong>{'\n'}{String(this.state.error)}{'\n'}{this.state.error?.stack?.split('\n').slice(0,5).join('\n')}
      </div>
    );
    return this.props.children;
  }
}

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

function shortName(fullName) {
  if (!fullName) return '';
  let s = fullName.replace(/\s*(환자\s+)?생성.*$/u, '').trim();
  s = s.replace(/\s+(감기|비염|요통|소화불량).*$/u, '').trim();
  return s || fullName;
}

export default function DiseaseSimulatorTab() {
  const [status, setStatus] = useState('picker');
  const [diseaseKey, setDiseaseKey] = useState(null);
  const [generalData, setGeneralData] = useState(null);
  const [syndromeData, setSyndromeData] = useState(null);
  const [syndromeNames, setSyndromeNames] = useState({});
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [selections, setSelections] = useState({});
  const fetchId = useRef(0);

  const loadDisease = useCallback(async (key) => {
    const id = ++fetchId.current;
    setDiseaseKey(key);
    setStatus('loading');
    setGeneralData(null);
    setSyndromeData(null);
    setSelections({});
    setExpandedSections(new Set());

    try {
      const [idxRes, genRes, synRes] = await Promise.all([
        fetch('/data/diseases/index.json'),
        fetch(`/data/diseases/normalized_general_probs/${key}_normalized_general.json`),
        fetch(`/data/diseases/horizontal_syndrome_probs/${key}_syndrome_probs.json`),
      ]);
      if (fetchId.current !== id) return;
      if (!idxRes.ok || !genRes.ok || !synRes.ok) throw new Error('파일 로드 실패');

      const idxJson = await idxRes.json();
      const genJson = await genRes.json();
      const synJson = await synRes.json();
      if (fetchId.current !== id) return;

      setGeneralData(genJson);
      setSyndromeData(synJson);
      setSyndromeNames(idxJson.diseases?.[key]?.syndrome_names || {});
      setStatus('ready');
    } catch (e) {
      if (fetchId.current === id) { setErrorMsg(String(e)); setStatus('error'); }
    }
  }, []);

  // ── Section groups ──
  const sectionGroups = useMemo(() => {
    const vars = generalData?.variables;
    if (!vars) return [];
    const map = new Map();
    vars.forEach((v, idx) => {
      if (!map.has(v.section)) map.set(v.section, []);
      map.get(v.section).push({ ...v, gi: idx });
    });
    return Array.from(map.entries());
  }, [generalData]);

  // ── Syndrome probabilities ──
  const synProbs = useMemo(() => {
    const synVars = syndromeData?.variables;
    const synKeys = syndromeData?.syndrome_keys;
    if (!synVars || !synKeys || !Object.keys(selections).length) return null;
    const sums = Object.fromEntries(synKeys.map(k => [k, 0]));
    let n = 0;
    Object.entries(selections).forEach(([vi, oi]) => {
      const opt = synVars[+vi]?.options?.[+oi];
      if (!opt?.normalized_probabilities) return;
      if (!synKeys.some(k => opt.normalized_probabilities[k] != null)) return;
      n++;
      synKeys.forEach(k => { if (opt.normalized_probabilities[k] != null) sums[k] += opt.normalized_probabilities[k]; });
    });
    if (!n) return null;
    return Object.fromEntries(synKeys.map(k => [k, sums[k] / n]));
  }, [syndromeData, selections]);

  const toggleSection = useCallback(s => setExpandedSections(p => {
    const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n;
  }), []);

  const pickOption = useCallback((vi, oi) => setSelections(p => {
    const n = { ...p }; p[vi] === oi ? delete n[vi] : (n[vi] = oi); return n;
  }), []);

  const selCount = Object.keys(selections).length;
  const synKeys = syndromeData?.syndrome_keys || [];

  // ── PICKER ──
  if (status === 'picker') return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Stethoscope className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-bold text-slate-700">질환별 증상 시뮬레이터</h3>
        <span className="text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold">Experimental</span>
      </div>
      <p className="text-[10px] text-slate-400 mb-4">질환을 선택하면 임상 데이터 기반 증상 확률과 변증 분석을 탐색할 수 있습니다</p>
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
  );

  // ── LOADING ──
  if (status === 'loading') return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
      <Loader2 className="w-8 h-8 mx-auto mb-3 text-teal-500 animate-spin" />
      <p className="text-sm text-slate-400">데이터 로딩중...</p>
    </div>
  );

  // ── ERROR ──
  if (status === 'error') return (
    <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-8 text-center">
      <p className="text-sm text-red-500 mb-2">데이터 로드 실패</p>
      <p className="text-[10px] text-red-400 font-mono mb-3">{errorMsg}</p>
      <button onClick={() => setStatus('picker')} className="text-[10px] text-slate-400 underline">질환 선택으로 돌아가기</button>
    </div>
  );

  // ── READY ──
  const disease = DISEASES.find(d => d.key === diseaseKey);

  return (
    <ErrorBoundary>
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Stethoscope className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-700">{disease?.name_ko} ({disease?.name_en})</h3>
            <span className="text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold">Experimental</span>
            <span className="text-[8px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{generalData.total_variables}개 변수</span>
            {selCount > 0 && <span className="text-[9px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold">{selCount}개 선택</span>}
          </div>
          <div className="flex items-center gap-2">
            {selCount > 0 && (
              <button onClick={() => setSelections({})}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-red-500 border border-slate-200 rounded-lg transition-colors">
                <RotateCcw className="w-3 h-3" /> 초기화
              </button>
            )}
            <button onClick={() => { setStatus('picker'); setGeneralData(null); setSyndromeData(null); }}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1 border border-slate-200 rounded-lg transition-colors">
              질환 변경
            </button>
          </div>
        </div>
        {synKeys.length > 0 && (
          <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
            <span className="text-[8px] text-slate-400 font-bold">변증:</span>
            {synKeys.map((k, i) => (
              <span key={k} className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: SYNDROME_COLORS[i % SYNDROME_COLORS.length] + '20', color: SYNDROME_COLORS[i % SYNDROME_COLORS.length] }}>
                {shortName(syndromeNames[k])}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Left: accordion */}
        <div className="xl:col-span-8 space-y-1">
          {sectionGroups.map(([secName, vars]) => {
            const expanded = expandedSections.has(secName);
            const secSel = vars.filter(v => selections[v.gi] !== undefined).length;

            // subcategory grouping
            const subs = [];
            let curSub = null;
            vars.forEach(v => {
              if (subs.length === 0 || v.subcategory !== curSub) {
                curSub = v.subcategory;
                subs.push({ name: curSub, vars: [] });
              }
              subs[subs.length - 1].vars.push(v);
            });

            return (
              <div key={secName} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button onClick={() => toggleSection(secName)}
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                    <span className="text-[11px] font-bold text-slate-700">{secName}</span>
                    <span className="text-[9px] text-slate-400">{vars.length}개 변수</span>
                  </div>
                  {secSel > 0 && <span className="text-[8px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold">{secSel}개 선택</span>}
                </button>

                {expanded && (
                  <div className="px-4 pb-3 border-t border-slate-100 pt-2 space-y-1">
                    {subs.map((sub, si) => (
                      <div key={si}>
                        {sub.name && (
                          <div className="text-[8px] font-bold text-slate-300 uppercase tracking-wider mt-2 mb-1 px-1">{sub.name}</div>
                        )}
                        {sub.vars.map(v => {
                          const selOpt = selections[v.gi];
                          return (
                            <div key={v.gi} className={`p-2 rounded-lg ${selOpt !== undefined ? 'bg-teal-50 ring-1 ring-teal-200' : ''}`}>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                {v.importance != null && v.importance <= 2 && <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />}
                                <span className="text-[10px] font-bold text-slate-700">{v.variable}</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {v.options.map((opt, oi) => {
                                  const isSel = selOpt === oi;
                                  const prob = opt.normalized_general || 0;
                                  const lbl = opt.label || (opt.description?.length > 30 ? opt.description.slice(0, 30) + '…' : opt.description) || String(oi + 1);
                                  return (
                                    <button key={oi} onClick={() => pickOption(v.gi, oi)}
                                      title={opt.description || ''}
                                      className={`px-2 py-1 rounded-md text-[9px] font-medium transition-all border ${
                                        isSel ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                                          : prob > 0 ? 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:bg-teal-50'
                                          : 'bg-slate-50 text-slate-300 border-slate-100'
                                      }`}>
                                      {lbl}
                                      {prob > 0 && (
                                        <span className={`ml-1 text-[7px] font-bold ${isSel ? 'text-teal-200' : 'text-slate-400'}`}>
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

        {/* Right: syndrome panel */}
        <div className="xl:col-span-4 space-y-3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sticky top-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">변증 확률 분석</h4>
            {!synProbs ? (
              <p className="text-[10px] text-slate-300 py-4 text-center">증상 옵션을 선택하면 변증 확률이 계산됩니다</p>
            ) : (
              <div className="space-y-2.5">
                {synKeys.map((k, i) => {
                  const prob = synProbs[k] || 0;
                  const color = SYNDROME_COLORS[i % SYNDROME_COLORS.length];
                  return (
                    <div key={k}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] font-bold text-slate-600 truncate" style={{ maxWidth: '70%' }}>{shortName(syndromeNames[k])}</span>
                        <span className="text-[11px] font-black" style={{ color }}>{Math.round(prob * 100)}%</span>
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

          {selCount > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">선택된 옵션 ({selCount}개)</h4>
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {Object.entries(selections).map(([vi, oi]) => {
                  const v = generalData.variables[+vi];
                  const opt = v?.options?.[+oi];
                  if (!v || !opt) return null;
                  return (
                    <div key={vi} className="flex items-center justify-between p-1.5 rounded-md bg-teal-50 text-[9px]">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-600">{v.variable}: </span>
                        <span className="text-teal-700">{opt.label || opt.description}</span>
                      </div>
                      <button onClick={() => pickOption(+vi, +oi)} className="text-slate-300 hover:text-red-400 ml-1 flex-shrink-0 text-sm">×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
