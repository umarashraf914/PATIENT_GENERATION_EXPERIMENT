import React, { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Link2, ShieldCheck, ShieldAlert, Edit3, Check, X } from 'lucide-react';
import {
  SYMPTOMS, CORRELATIONS, CATEGORIES, BAGANG, BAGANG_SYMPTOM_ASSOCIATIONS,
  rToConditionalProb, getCorrelationsFor
} from '../data/symptomNetwork';

export default function SymptomDetailPanel({ selectedSymptom, onSelectSymptom, validations, onValidate }) {
  const [editingEdge, setEditingEdge] = useState(null);
  const [editValue, setEditValue] = useState('');

  const sym = SYMPTOMS[selectedSymptom];
  const correlations = useMemo(() => getCorrelationsFor(selectedSymptom), [selectedSymptom]);

  const bagangLinks = useMemo(() => {
    return BAGANG_SYMPTOM_ASSOCIATIONS
      .filter(a => a.symptom === selectedSymptom)
      .map(a => ({ ...a, bagangInfo: BAGANG[a.bagang] }));
  }, [selectedSymptom]);

  if (!selectedSymptom || !sym) {
    return (
      <div className="h-full flex items-center justify-center text-slate-300 p-6">
        <div className="text-center space-y-2">
          <Link2 className="w-8 h-8 mx-auto opacity-40" />
          <p className="text-xs font-medium">증상을 선택하면<br />상관관계를 확인할 수 있습니다</p>
        </div>
      </div>
    );
  }

  const startEdit = (partnerId, currentR) => {
    setEditingEdge(partnerId);
    setEditValue(currentR.toFixed(3));
  };

  const saveEdit = (partnerId) => {
    const newR = parseFloat(editValue);
    if (!isNaN(newR) && newR >= -1 && newR <= 1) {
      onValidate(selectedSymptom, partnerId, { adjustedR: newR, status: 'modified' });
    }
    setEditingEdge(null);
  };

  return (
    <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* Symptom Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <div className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: sym.color + '15', border: `2px solid ${sym.color}` }}>
          <span className="text-xs font-black" style={{ color: sym.color }}>
            {correlations.length}
          </span>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-black text-slate-800">{sym.ko}</h3>
          <p className="text-[10px] text-slate-400 font-medium">{sym.en} · {CATEGORIES[sym.category]?.ko}</p>
        </div>
        <button onClick={() => onSelectSymptom(null)}
          className="text-slate-300 hover:text-slate-600 p-1 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 팔강변증 Links */}
      {bagangLinks.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">팔강변증 연관</h4>
          <div className="flex flex-wrap gap-1">
            {bagangLinks.map((link, i) => (
              <span key={i} className="text-[9px] font-bold px-2 py-1 rounded-md border"
                style={{
                  backgroundColor: link.bagangInfo.color + '10',
                  borderColor: link.bagangInfo.color + '40',
                  color: link.bagangInfo.color,
                }}>
                {link.bagangInfo.ko}({link.bagangInfo.en})
                {link.direction === 'positive' ? ' ↑' : ' ↓'}
                {(link.weight * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Correlated Symptoms */}
      <div className="space-y-1">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
          상관 증상 ({correlations.length}개)
        </h4>

        {correlations.map((corr) => {
          const partner = SYMPTOMS[corr.partner];
          if (!partner) return null;
          const isPositive = corr.r > 0;
          const absR = Math.abs(corr.r);
          const condProb = rToConditionalProb(corr.r);
          const validation = validations?.[`${selectedSymptom}-${corr.partner}`]
            || validations?.[`${corr.partner}-${selectedSymptom}`];
          const isEditing = editingEdge === corr.partner;

          return (
            <div key={corr.partner}
              className={`p-2 rounded-lg border transition-all hover:shadow-sm cursor-pointer ${
                validation?.status === 'approved' ? 'border-green-200 bg-green-50/50' :
                validation?.status === 'rejected' ? 'border-red-200 bg-red-50/50' :
                validation?.status === 'modified' ? 'border-amber-200 bg-amber-50/50' :
                'border-slate-100 bg-white'
              }`}
              onClick={(e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                  onSelectSymptom(corr.partner);
                }
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {isPositive ?
                    <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" /> :
                    <ArrowDownRight className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  }
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-slate-700 truncate">
                      {partner.ko}
                      <span className="text-slate-400 font-normal ml-1">({partner.en})</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Correlation value */}
                  {isEditing ? (
                    <div className="flex items-center gap-0.5">
                      <input type="number" step="0.01" min="-1" max="1"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-14 text-[10px] px-1 py-0.5 border border-indigo-300 rounded text-center font-mono"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button onClick={(e) => { e.stopPropagation(); saveEdit(corr.partner); }}
                        className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingEdge(null); }}
                        className="p-0.5 text-red-600 hover:bg-red-50 rounded">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isPositive ? 'bg-indigo-50 text-indigo-700' : 'bg-red-50 text-red-700'
                      }`}>
                        r={validation?.adjustedR?.toFixed(3) ?? corr.r.toFixed(3)}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">
                        P={condProb.toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Strength bar */}
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${absR * 100}%`,
                      backgroundColor: isPositive ? '#6366f1' : '#ef4444',
                    }} />
                </div>

                {/* Validation buttons */}
                <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    title="승인 (Approve)"
                    onClick={() => onValidate(selectedSymptom, corr.partner, { status: 'approved' })}
                    className={`p-0.5 rounded transition-colors ${
                      validation?.status === 'approved' ? 'text-green-600 bg-green-100' : 'text-slate-300 hover:text-green-500'
                    }`}>
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title="수정 (Edit)"
                    onClick={() => startEdit(corr.partner, validation?.adjustedR ?? corr.r)}
                    className="p-0.5 rounded text-slate-300 hover:text-amber-500 transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title="거부 (Reject)"
                    onClick={() => onValidate(selectedSymptom, corr.partner, { status: 'rejected' })}
                    className={`p-0.5 rounded transition-colors ${
                      validation?.status === 'rejected' ? 'text-red-600 bg-red-100' : 'text-slate-300 hover:text-red-500'
                    }`}>
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Source badge */}
              <div className="mt-1 flex items-center gap-1">
                <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-400 uppercase">
                  {corr.source === 'chart_review' ? '차트리뷰 n=400' : corr.source}
                </span>
                {validation?.status && (
                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded uppercase ${
                    validation.status === 'approved' ? 'bg-green-100 text-green-600' :
                    validation.status === 'rejected' ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-600'
                  }`}>
                    {validation.status === 'approved' ? '승인됨' : validation.status === 'rejected' ? '거부됨' : '수정됨'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
