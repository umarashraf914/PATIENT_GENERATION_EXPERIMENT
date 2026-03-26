import React, { useMemo } from 'react';
import { BarChart3, GitBranch, ArrowUpRight, ArrowDownRight, Database, Download } from 'lucide-react';
import { getNetworkStats, CORRELATIONS } from '../data/symptomNetwork';

export default function StatsPanel({ validations }) {
  const stats = useMemo(() => getNetworkStats(), []);

  const validationStats = useMemo(() => {
    const entries = Object.values(validations || {});
    return {
      total: entries.length,
      approved: entries.filter(v => v.status === 'approved').length,
      rejected: entries.filter(v => v.status === 'rejected').length,
      modified: entries.filter(v => v.status === 'modified').length,
    };
  }, [validations]);

  const progress = CORRELATIONS.length > 0
    ? ((validationStats.total / CORRELATIONS.length) * 100).toFixed(0)
    : 0;

  const handleExport = () => {
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        source: '400-patient chart review + TKM expert validation',
        totalCorrelations: CORRELATIONS.length,
        validated: validationStats.total,
      },
      correlations: CORRELATIONS.map(c => {
        const key = `${c.from}-${c.to}`;
        const altKey = `${c.to}-${c.from}`;
        const v = validations?.[key] || validations?.[altKey];
        return {
          ...c,
          validation: v || { status: 'pending' },
          effectiveR: v?.adjustedR ?? c.r,
        };
      }),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tkm_symptom_network_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Network Stats */}
      <div>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
          네트워크 통계
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 p-2 rounded-lg">
            <div className="text-[9px] font-bold text-slate-400">증상 수</div>
            <div className="text-lg font-black text-slate-800">{stats.totalSymptoms}</div>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg">
            <div className="text-[9px] font-bold text-slate-400">상관관계</div>
            <div className="text-lg font-black text-slate-800">{stats.totalCorrelations}</div>
          </div>
          <div className="bg-indigo-50 p-2 rounded-lg">
            <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-400">
              <ArrowUpRight className="w-3 h-3" /> 양의 상관
            </div>
            <div className="text-lg font-black text-indigo-700">{stats.positiveCount}</div>
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <div className="flex items-center gap-1 text-[9px] font-bold text-red-400">
              <ArrowDownRight className="w-3 h-3" /> 음의 상관
            </div>
            <div className="text-lg font-black text-red-700">{stats.negativeCount}</div>
          </div>
        </div>
        <div className="mt-2 text-[9px] text-slate-400 flex items-center gap-1">
          <Database className="w-3 h-3" />
          평균 |r| = {stats.avgAbsR} · 최대 |r| = {stats.maxAbsR}
        </div>
      </div>

      {/* Top Connected */}
      <div>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
          핵심 증상 (연결 수)
        </h3>
        <div className="space-y-1">
          {stats.topConnected.slice(0, 8).map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-[10px] font-bold text-slate-600 flex-1">{s.ko}</span>
              <div className="flex items-center gap-1">
                <GitBranch className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] font-mono font-bold text-slate-500">{s.degree}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Validation Progress */}
      <div>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
          검증 진행률
        </h3>
        <div className="bg-slate-50 p-3 rounded-lg space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-600">
              {validationStats.total} / {CORRELATIONS.length} 완료
            </span>
            <span className="text-[10px] font-black text-indigo-600">{progress}%</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              }} />
          </div>
          <div className="flex gap-3 text-[9px] font-bold">
            <span className="text-green-600">승인 {validationStats.approved}</span>
            <span className="text-amber-600">수정 {validationStats.modified}</span>
            <span className="text-red-600">거부 {validationStats.rejected}</span>
          </div>
        </div>
      </div>

      {/* Export */}
      <button onClick={handleExport}
        className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-2">
        <Download className="w-3.5 h-3.5" />
        검증 데이터 내보내기 (JSON)
      </button>

      {/* Data source */}
      <div className="text-[8px] text-slate-400 leading-relaxed">
        <strong>데이터 출처:</strong> 400명 차트리뷰 상관분석 (pp.36-38)<br />
        <strong>분석 단위:</strong> Pearson 상관계수 (r)<br />
        <strong>팔강 연관:</strong> TKM 임상 원칙 기반 추정 (검증 필요)
      </div>
    </div>
  );
}
