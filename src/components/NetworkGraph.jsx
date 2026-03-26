import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { SYMPTOMS, CORRELATIONS, CATEGORIES } from '../data/symptomNetwork';

const WIDTH = 700;
const HEIGHT = 700;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

function forceLayout(nodes, edges, iterations = 150) {
  const pos = {};
  const categoryAngles = {};
  const cats = Object.keys(CATEGORIES);
  cats.forEach((cat, i) => {
    categoryAngles[cat] = (i / cats.length) * 2 * Math.PI - Math.PI / 2;
  });

  nodes.forEach(n => {
    const angle = categoryAngles[SYMPTOMS[n].category] + (Math.random() - 0.5) * 0.8;
    const dist = 150 + Math.random() * 100;
    pos[n] = { x: CENTER_X + Math.cos(angle) * dist, y: CENTER_Y + Math.sin(angle) * dist };
  });

  for (let iter = 0; iter < iterations; iter++) {
    const forces = {};
    nodes.forEach(n => { forces[n] = { x: 0, y: 0 }; });

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = pos[a].x - pos[b].x;
        const dy = pos[a].y - pos[b].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 800 / (dist * dist);
        forces[a].x += (dx / dist) * force;
        forces[a].y += (dy / dist) * force;
        forces[b].x -= (dx / dist) * force;
        forces[b].y -= (dy / dist) * force;
      }
    }

    // Attraction along edges
    edges.forEach(({ from, to, r }) => {
      if (!pos[from] || !pos[to]) return;
      const dx = pos[to].x - pos[from].x;
      const dy = pos[to].y - pos[from].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const idealDist = 100 / Math.abs(r);
      const force = (dist - idealDist) * 0.01;
      forces[from].x += (dx / dist) * force;
      forces[from].y += (dy / dist) * force;
      forces[to].x -= (dx / dist) * force;
      forces[to].y -= (dy / dist) * force;
    });

    // Center gravity
    nodes.forEach(n => {
      forces[n].x += (CENTER_X - pos[n].x) * 0.005;
      forces[n].y += (CENTER_Y - pos[n].y) * 0.005;
    });

    // Apply with damping
    const damping = 1 - iter / iterations;
    nodes.forEach(n => {
      pos[n].x += forces[n].x * damping;
      pos[n].y += forces[n].y * damping;
      pos[n].x = Math.max(40, Math.min(WIDTH - 40, pos[n].x));
      pos[n].y = Math.max(40, Math.min(HEIGHT - 40, pos[n].y));
    });
  }

  return pos;
}

export default function NetworkGraph({ selectedSymptom, onSelectSymptom, highlightedEdges, activeBagang }) {
  const [hoveredNode, setHoveredNode] = useState(null);
  const svgRef = useRef(null);

  const nodeIds = useMemo(() => Object.keys(SYMPTOMS), []);
  const visibleEdges = useMemo(() => {
    return CORRELATIONS.filter(c => nodeIds.includes(c.from) && nodeIds.includes(c.to));
  }, [nodeIds]);

  const positions = useMemo(() => forceLayout(nodeIds, visibleEdges), [nodeIds, visibleEdges]);

  const connectedToSelected = useMemo(() => {
    if (!selectedSymptom) return new Set();
    const set = new Set();
    CORRELATIONS.forEach(c => {
      if (c.from === selectedSymptom) set.add(c.to);
      if (c.to === selectedSymptom) set.add(c.from);
    });
    return set;
  }, [selectedSymptom]);

  const getNodeOpacity = useCallback((id) => {
    if (!selectedSymptom) return 1;
    if (id === selectedSymptom) return 1;
    if (connectedToSelected.has(id)) return 1;
    return 0.15;
  }, [selectedSymptom, connectedToSelected]);

  const getEdgeProps = useCallback((edge) => {
    const absR = Math.abs(edge.r);
    const isNeg = edge.r < 0;
    const isConnected = selectedSymptom && (edge.from === selectedSymptom || edge.to === selectedSymptom);
    const isHighlighted = highlightedEdges?.has(`${edge.from}-${edge.to}`) || highlightedEdges?.has(`${edge.to}-${edge.from}`);

    let opacity = selectedSymptom ? (isConnected ? 0.8 : 0.04) : Math.max(0.1, absR * 0.8);
    if (isHighlighted) opacity = 0.9;

    return {
      stroke: isNeg ? '#ef4444' : '#6366f1',
      strokeWidth: isConnected ? Math.max(1.5, absR * 6) : Math.max(0.5, absR * 3),
      opacity,
      strokeDasharray: isNeg ? '4 3' : 'none',
    };
  }, [selectedSymptom, highlightedEdges]);

  const getDegree = useCallback((id) => {
    return CORRELATIONS.filter(c => c.from === id || c.to === id).length;
  }, []);

  return (
    <div className="relative">
      {/* Category legend */}
      <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 z-10">
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <span key={key} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border" style={{
            color: cat.color, borderColor: cat.color + '40', backgroundColor: cat.color + '10'
          }}>
            {cat.ko}
          </span>
        ))}
      </div>

      <svg ref={svgRef} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-full" style={{ maxHeight: '700px' }}>

        {/* Edges */}
        {visibleEdges.map((edge, i) => {
          const p1 = positions[edge.from];
          const p2 = positions[edge.to];
          if (!p1 || !p2) return null;
          const props = getEdgeProps(edge);
          return (
            <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              {...props} className="transition-all duration-300" />
          );
        })}

        {/* Nodes */}
        {nodeIds.map(id => {
          const pos = positions[id];
          if (!pos) return null;
          const sym = SYMPTOMS[id];
          const degree = getDegree(id);
          const radius = Math.max(10, Math.min(22, 8 + degree * 1.5));
          const isSelected = id === selectedSymptom;
          const isHovered = id === hoveredNode;
          const opacity = getNodeOpacity(id);

          return (
            <g key={id} transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer transition-all duration-300"
              style={{ opacity }}
              onClick={() => onSelectSymptom(isSelected ? null : id)}
              onMouseEnter={() => setHoveredNode(id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Glow for selected */}
              {isSelected && (
                <circle r={radius + 6} fill={sym.color} opacity={0.15} />
              )}

              {/* Main circle */}
              <circle r={radius}
                fill={isSelected ? sym.color : 'white'}
                stroke={sym.color}
                strokeWidth={isSelected ? 3 : 2}
              />

              {/* Label */}
              <text y={radius + 13} textAnchor="middle"
                className="text-[10px] font-bold pointer-events-none select-none"
                fill={isSelected || isHovered ? '#1e293b' : '#94a3b8'}
              >
                {sym.ko}
              </text>

              {/* Degree badge */}
              {(isHovered || isSelected) && degree > 0 && (
                <g transform={`translate(${radius - 2}, ${-radius + 2})`}>
                  <circle r={7} fill="#6366f1" />
                  <text textAnchor="middle" y={3.5} fill="white" className="text-[8px] font-black">{degree}</text>
                </g>
              )}

              {/* Hover tooltip */}
              {isHovered && !isSelected && (
                <g transform="translate(0, -30)">
                  <rect x={-50} y={-14} width={100} height={20} rx={4}
                    fill="#1e293b" opacity={0.9} />
                  <text textAnchor="middle" y={0} fill="white" className="text-[9px] font-bold">
                    {sym.ko} ({sym.en})
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
