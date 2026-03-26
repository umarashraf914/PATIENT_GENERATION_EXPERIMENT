import React, { useState, useCallback, useMemo } from 'react';
import { Network, Grid3x3, Bot, ShieldCheck, RefreshCw, Zap } from 'lucide-react';
import NetworkGraph from './components/NetworkGraph';
import CorrelationMatrix from './components/CorrelationMatrix';
import SymptomDetailPanel from './components/SymptomDetailPanel';
import BagangSelector from './components/BagangSelector';
import StatsPanel from './components/StatsPanel';
import ModelExtractionTab from './components/ModelExtractionTab';
import SymptomSimulator from './components/SymptomSimulator';
import { BAGANG, BAGANG_SYMPTOM_ASSOCIATIONS } from './data/symptomNetwork';

export default function App() {
  const [selectedSymptom, setSelectedSymptom] = useState(null);
  const [activeBagang, setActiveBagang] = useState([]);
  const [activeView, setActiveView] = useState('network'); // 'network' | 'matrix' | 'extraction' | 'simulator'
  const [validations, setValidations] = useState({});
  const [extractedData, setExtractedData] = useState(null);

  const handleDataExtracted = useCallback((symptoms, edges) => {
    setExtractedData({ symptoms, edges });
  }, []);

  const handleToggleBagang = useCallback((id) => {
    setActiveBagang(prev => {
      const bg = BAGANG[id];
      let next = [...prev];
      if (next.includes(id)) {
        next = next.filter(b => b !== id);
      } else {
        next = next.filter(b => b !== bg.pair);
        next.push(id);
      }
      return next;
    });
  }, []);

  const handleValidate = useCallback((symptomA, symptomB, data) => {
    const key = `${symptomA}-${symptomB}`;
    setValidations(prev => ({
      ...prev,
      [key]: { ...prev[key], ...data, timestamp: Date.now() },
    }));
  }, []);

  const handleReset = useCallback(() => {
    setSelectedSymptom(null);
    setActiveBagang([]);
    setValidations({});
  }, []);

  const highlightedEdges = useMemo(() => {
    if (activeBagang.length === 0) return null;
    const set = new Set();
    const relevantSymptoms = new Set();

    activeBagang.forEach(bgId => {
      BAGANG_SYMPTOM_ASSOCIATIONS
        .filter(a => a.bagang === bgId)
        .forEach(a => relevantSymptoms.add(a.symptom));
    });

    return set;
  }, [activeBagang]);

  return (
    <div className="min-h-screen bg-slate-100 p-3 md:p-4 font-sans text-slate-800">
      <div className="max-w-[1800px] mx-auto space-y-3">

        {/* Header */}
        <header className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                TKM Symptom Correlation Explorer
              </h1>
              <p className="text-slate-500 text-[10px] font-medium">
                LLM 모델 지식 추출 & 한의사 검증 · 증상 상관관계 네트워크 · 합성 환자 생성 연구 도구
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {/* View toggle */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setActiveView('network')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeView === 'network' ? 'bg-white shadow text-slate-800' : 'text-slate-400'
                }`}>
                <Network className="w-3.5 h-3.5" /> 네트워크
              </button>
              <button onClick={() => setActiveView('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeView === 'matrix' ? 'bg-white shadow text-slate-800' : 'text-slate-400'
                }`}>
                <Grid3x3 className="w-3.5 h-3.5" /> 매트릭스
              </button>
              <button onClick={() => setActiveView('extraction')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeView === 'extraction' ? 'bg-white shadow text-slate-800' : 'text-slate-400'
                }`}>
                <Bot className="w-3.5 h-3.5" /> 모델 추출
              </button>
              <button onClick={() => setActiveView('simulator')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeView === 'simulator' ? 'bg-white shadow text-slate-800' : 'text-slate-400'
                }`}>
                <Zap className="w-3.5 h-3.5" /> 시뮬레이터
              </button>
            </div>
            <button onClick={handleReset}
              className="px-3 py-1.5 hover:bg-slate-100 text-slate-400 rounded-lg text-[11px] font-bold transition-all border border-slate-200 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> 초기화
            </button>
          </div>
        </header>

        {/* Main Content — all views stay mounted, hidden via CSS to preserve state */}
        <div style={{ display: activeView === 'extraction' ? 'block' : 'none' }}>
          <ModelExtractionTab onDataExtracted={handleDataExtracted} />
        </div>

        <div style={{ display: activeView === 'simulator' ? 'block' : 'none' }}>
          <SymptomSimulator data={extractedData} />
        </div>

        <div style={{ display: !['extraction', 'simulator'].includes(activeView) ? 'block' : 'none' }}>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">

            {/* Left Panel: Bagang + Stats */}
            <div className="xl:col-span-2 space-y-3">
              <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <BagangSelector activeBagang={activeBagang} onToggleBagang={handleToggleBagang} />
              </section>
              <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <StatsPanel validations={validations} />
              </section>
            </div>

            {/* Center: Graph / Matrix */}
            <div className="xl:col-span-7">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    {activeView === 'network' ? (
                      <><Network className="w-4 h-4 text-indigo-500" /> 증상 상관관계 네트워크</>
                    ) : (
                      <><Grid3x3 className="w-4 h-4 text-indigo-500" /> 상관관계 매트릭스</>
                    )}
                  </h2>
                  <div className="flex items-center gap-2 text-[9px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <div className="w-6 h-0.5 bg-indigo-400 rounded" /> 양의 상관
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-6 h-0.5 bg-red-400 rounded" style={{ borderTop: '1px dashed #ef4444' }} /> 음의 상관
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  {activeView === 'network' ? (
                    <NetworkGraph
                      selectedSymptom={selectedSymptom}
                      onSelectSymptom={setSelectedSymptom}
                      highlightedEdges={highlightedEdges}
                      activeBagang={activeBagang}
                    />
                  ) : (
                    <CorrelationMatrix
                      selectedSymptom={selectedSymptom}
                      onSelectSymptom={setSelectedSymptom}
                    />
                  )}
                </div>
              </section>
            </div>

            {/* Right Panel: Symptom Detail + Validation */}
            <div className="xl:col-span-3">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    증상 상세 & 검증
                  </h2>
                  {selectedSymptom && (
                    <span className="text-[9px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">
                      선택됨
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <SymptomDetailPanel
                    selectedSymptom={selectedSymptom}
                    onSelectSymptom={setSelectedSymptom}
                    validations={validations}
                    onValidate={handleValidate}
                  />
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-slate-900 p-3 rounded-2xl text-center">
          <p className="text-[9px] font-bold tracking-widest uppercase text-slate-500">
            TKM Symptom Correlation Explorer · 400-Patient Chart Review Data · Research Tool for Expert Validation
          </p>
        </footer>
      </div>
    </div>
  );
}
