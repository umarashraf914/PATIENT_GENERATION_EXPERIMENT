import React, { useState, useCallback } from 'react';
import { Network, Bot, Zap, BarChart3, Stethoscope } from 'lucide-react';
import ModelExtractionTab from './components/ModelExtractionTab';
import SymptomSimulator from './components/SymptomSimulator';
import NaiveSimulator from './components/NaiveSimulator';
import DiseaseSimulatorTab from './components/DiseaseSimulatorTab';

export default function App() {
  const [activeView, setActiveView] = useState('extraction'); // 'extraction' | 'gaussian' | 'naive' | 'disease'
  const [extractedData, setExtractedData] = useState(null);

  const handleDataExtracted = useCallback((symptoms, edges) => {
    setExtractedData({ symptoms, edges });
  }, []);

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
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setActiveView('extraction')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeView === 'extraction' ? 'bg-white shadow text-slate-800' : 'text-slate-400'
                }`}>
                <Bot className="w-3.5 h-3.5" /> 모델 추출
              </button>
              <button onClick={() => setActiveView('gaussian')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeView === 'gaussian' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'
                }`}>
                <Zap className="w-3.5 h-3.5" /> Gaussian
              </button>
              <button onClick={() => setActiveView('naive')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeView === 'naive' ? 'bg-white shadow text-orange-600' : 'text-slate-400'
                }`}>
                <BarChart3 className="w-3.5 h-3.5" /> Naive
              </button>
              <button onClick={() => setActiveView('disease')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeView === 'disease' ? 'bg-white shadow text-teal-600' : 'text-slate-400'
                }`}>
                <Stethoscope className="w-3.5 h-3.5" /> 질환 DB
              </button>
            </div>
          </div>
        </header>

        {/* Main Content — all views stay mounted, hidden via CSS to preserve state */}
        <div style={{ display: activeView === 'extraction' ? 'block' : 'none' }}>
          <ModelExtractionTab onDataExtracted={handleDataExtracted} />
        </div>

        <div style={{ display: activeView === 'gaussian' ? 'block' : 'none' }}>
          <SymptomSimulator data={extractedData} />
        </div>

        <div style={{ display: activeView === 'naive' ? 'block' : 'none' }}>
          <NaiveSimulator data={extractedData} />
        </div>

        {activeView === 'disease' && (
          <DiseaseSimulatorTab />
        )}

      </div>
    </div>
  );
}
