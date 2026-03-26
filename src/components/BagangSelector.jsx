import React from 'react';
import { BAGANG } from '../data/symptomNetwork';

const GROUPS = [
  { key: 'yinyang', ko: '음양', en: 'Yin/Yang' },
  { key: 'pyori',   ko: '표리', en: 'Exterior/Interior' },
  { key: 'hanyeol', ko: '한열', en: 'Cold/Heat' },
  { key: 'heosil',  ko: '허실', en: 'Deficiency/Excess' },
];

export default function BagangSelector({ activeBagang, onToggleBagang }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
        팔강변증 선택
      </h3>
      <div className="space-y-2">
        {GROUPS.map(group => {
          const items = Object.entries(BAGANG).filter(([, b]) => b.group === group.key);
          return (
            <div key={group.key} className="space-y-1">
              <div className="text-[9px] font-bold text-slate-400 uppercase">
                {group.ko} ({group.en})
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map(([id, bg]) => {
                  const isActive = activeBagang.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => onToggleBagang(id)}
                      className={`py-2 px-2 rounded-lg border-2 transition-all text-[11px] font-bold ${
                        isActive
                          ? 'text-white shadow-md'
                          : 'bg-white text-slate-500 border-slate-100 hover:border-slate-300'
                      }`}
                      style={isActive ? { backgroundColor: bg.color, borderColor: bg.color } : {}}
                    >
                      {bg.ko} ({bg.en})
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
