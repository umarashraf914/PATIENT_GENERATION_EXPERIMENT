import React, { useMemo } from 'react';

const VIEWBOX_SIZE = 700;
const OUTER_PAD = 18;
const LEFT_LABEL_W = 70;
const TOP_LABEL_H = 84;
const RIGHT_LEGEND_W = 72;
const MATRIX_RESERVED_GAP = 30;
const LEGEND_GAP = 48;

function getShortLabel(symptom) {
  const match = symptom.match(/^([^\s(]+)/);
  return match ? match[1] : symptom.substring(0, 4);
}

function getDisplayTitle(symptom) {
  const ko = symptom.match(/^([^\s(]+)/)?.[1] || symptom;
  const en = symptom.match(/\(([^)]+)\)/)?.[1] || '';
  return en ? `${ko} (${en})` : ko;
}

function getCellColor(value, isDiagonal) {
  if (isDiagonal) return 'rgba(15, 23, 42, 0.08)';
  if (value === null) return 'rgba(148, 163, 184, 0.08)';
  if (value > 0) return `rgba(99, 102, 241, ${Math.max(0.14, Math.abs(value) * 0.82)})`;
  return `rgba(239, 68, 68, ${Math.max(0.14, Math.abs(value) * 0.82)})`;
}

function formatCellValue(value, isDiagonal, cellSize) {
  if (cellSize < 11) return '';
  if (isDiagonal) return cellSize >= 15 ? '1.00' : '1';
  if (value === null) return cellSize >= 14 ? '—' : '';
  if (cellSize >= 17) return value.toFixed(2);
  if (cellSize >= 13) return value.toFixed(1);
  return '';
}

export default function ExtractedCorrelationMatrix({ symptoms, edges, selectedNode, onSelectNode }) {
  const matrix = useMemo(() => {
    const lookup = {};
    symptoms.forEach((_, idx) => {
      lookup[idx] = {};
      lookup[idx][idx] = 1;
    });
    edges.forEach(({ a, b, r }) => {
      lookup[a][b] = r;
      lookup[b][a] = r;
    });
    return lookup;
  }, [symptoms, edges]);

  const layout = useMemo(() => {
    const usableWidth = VIEWBOX_SIZE - OUTER_PAD * 2 - LEFT_LABEL_W - RIGHT_LEGEND_W - MATRIX_RESERVED_GAP;
    const usableHeight = VIEWBOX_SIZE - OUTER_PAD * 2 - TOP_LABEL_H;
    const matrixSize = Math.min(usableWidth, usableHeight);
    const cellSize = matrixSize / Math.max(symptoms.length, 1);
    const legendHeight = matrixSize * 0.82;
    const legendY = OUTER_PAD + TOP_LABEL_H + (matrixSize - legendHeight) / 2;

    return {
      matrixX: OUTER_PAD + LEFT_LABEL_W,
      matrixY: OUTER_PAD + TOP_LABEL_H,
      matrixSize,
      cellSize,
      rowFontSize: Math.max(5, Math.min(9, cellSize * 0.52)),
      colFontSize: Math.max(4.5, Math.min(8, cellSize * 0.48)),
      cellFontSize: Math.max(4.5, Math.min(8, cellSize * 0.42)),
      legendX: OUTER_PAD + LEFT_LABEL_W + matrixSize + LEGEND_GAP,
      legendY,
      legendHeight,
      legendWidth: 16,
    };
  }, [symptoms.length]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden xl:aspect-square flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">증상-증상 정방 행렬 히트맵</h3>
          <p className="text-[9px] text-slate-400 mt-0.5">
            스크롤 없이 모든 증상쌍의 관계가 카드 안에 맞춰집니다.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[8px] font-bold text-slate-400 uppercase">Matrix Size</div>
          <div className="text-sm font-black text-indigo-600">{symptoms.length} x {symptoms.length}</div>
        </div>
      </div>

      <div className="p-3 flex-1 min-h-0">
        <svg className="w-full h-full" viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
          <defs>
            <linearGradient id="extracted-correlation-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(99, 102, 241, 0.95)" />
              <stop offset="35%" stopColor="rgba(165, 180, 252, 0.65)" />
              <stop offset="50%" stopColor="rgba(255,255,255,1)" />
              <stop offset="65%" stopColor="rgba(252, 165, 165, 0.7)" />
              <stop offset="100%" stopColor="rgba(239, 68, 68, 0.95)" />
            </linearGradient>
          </defs>

          <rect
            x={OUTER_PAD}
            y={OUTER_PAD}
            width={VIEWBOX_SIZE - OUTER_PAD * 2}
            height={VIEWBOX_SIZE - OUTER_PAD * 2}
            rx="18"
            fill="#f8fafc"
            stroke="#e2e8f0"
          />

          {symptoms.map((symptom, idx) => {
            const x = layout.matrixX + idx * layout.cellSize + layout.cellSize / 2;
            const isSelected = selectedNode === idx;
            return (
              <text
                key={`col-${idx}`}
                transform={`translate(${x} ${layout.matrixY - 8}) rotate(-90)`}
                textAnchor="start"
                fontSize={layout.colFontSize}
                fontWeight="700"
                fill={isSelected ? '#4f46e5' : '#64748b'}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectNode(isSelected ? null : idx)}
              >
                {getShortLabel(symptom)}
                <title>{getDisplayTitle(symptom)}</title>
              </text>
            );
          })}

          {symptoms.map((symptom, rowIdx) => {
            const y = layout.matrixY + rowIdx * layout.cellSize;
            const centerY = y + layout.cellSize / 2;
            const rowSelected = selectedNode === rowIdx;

            return (
              <g key={`row-${rowIdx}`}>
                <text
                  x={layout.matrixX - 8}
                  y={centerY + layout.rowFontSize * 0.32}
                  textAnchor="end"
                  fontSize={layout.rowFontSize}
                  fontWeight="700"
                  fill={rowSelected ? '#4f46e5' : '#475569'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectNode(rowSelected ? null : rowIdx)}
                >
                  {getShortLabel(symptom)}
                  <title>{getDisplayTitle(symptom)}</title>
                </text>

                {symptoms.map((colSymptom, colIdx) => {
                  const x = layout.matrixX + colIdx * layout.cellSize;
                  const isDiagonal = rowIdx === colIdx;
                  const value = matrix[rowIdx]?.[colIdx] ?? null;
                  const selectedBand = selectedNode !== null && (rowIdx === selectedNode || colIdx === selectedNode);
                  const textColor = value !== null && Math.abs(value) > 0.35 ? 'white' : '#475569';
                  const displayValue = formatCellValue(value, isDiagonal, layout.cellSize);

                  return (
                    <g key={`cell-${rowIdx}-${colIdx}`}>
                      <rect
                        x={x}
                        y={y}
                        width={layout.cellSize}
                        height={layout.cellSize}
                        fill={getCellColor(value, isDiagonal)}
                        stroke={selectedBand ? 'rgba(99, 102, 241, 0.28)' : '#eef2f7'}
                        strokeWidth={selectedBand ? 1 : 0.6}
                        rx={layout.cellSize > 14 ? 3 : 1}
                      >
                        <title>
                          {`${getDisplayTitle(symptom)} ↔ ${getDisplayTitle(colSymptom)}: ${
                            value === null ? '관계 없음 / not returned' : `r=${value.toFixed(3)}`
                          }`}
                        </title>
                      </rect>
                      {displayValue && (
                        <text
                          x={x + layout.cellSize / 2}
                          y={y + layout.cellSize / 2 + layout.cellFontSize * 0.33}
                          textAnchor="middle"
                          fontSize={layout.cellFontSize}
                          fontWeight="700"
                          fill={isDiagonal ? '#0f172a' : textColor}
                        >
                          {displayValue}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          <text
            x={layout.legendX + layout.legendWidth / 2}
            y={layout.legendY - 18}
            textAnchor="middle"
            fontSize="9"
            fontWeight="800"
            fill="#94a3b8"
          >
            CORRELATION
          </text>

          <rect
            x={layout.legendX}
            y={layout.legendY}
            width={layout.legendWidth}
            height={layout.legendHeight}
            rx="8"
            fill="url(#extracted-correlation-gradient)"
            stroke="#e2e8f0"
          />

          {[1, 0.5, 0, -0.5, -1].map((tick, idx) => {
            const ratio = (1 - tick) / 2;
            const y = layout.legendY + ratio * layout.legendHeight;
            return (
              <g key={`tick-${idx}`}>
                <line
                  x1={layout.legendX - 6}
                  x2={layout.legendX - 1}
                  y1={y}
                  y2={y}
                  stroke="#94a3b8"
                  strokeWidth="1"
                />
                <text
                  x={layout.legendX - 10}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="8"
                  fontWeight="700"
                  fill="#94a3b8"
                >
                  {tick.toFixed(1)}
                </text>
              </g>
            );
          })}

          <text
            x={layout.legendX + layout.legendWidth / 2}
            y={layout.legendY + layout.legendHeight + 18}
            textAnchor="middle"
            fontSize="8"
            fill="#94a3b8"
          >
            blue = +
          </text>
          <text
            x={layout.legendX + layout.legendWidth / 2}
            y={layout.legendY + layout.legendHeight + 30}
            textAnchor="middle"
            fontSize="8"
            fill="#94a3b8"
          >
            red = -
          </text>
        </svg>
      </div>
    </div>
  );
}
