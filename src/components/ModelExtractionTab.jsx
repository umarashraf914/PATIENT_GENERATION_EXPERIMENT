import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Bot, Loader2, Download, Eye, Settings, Zap, AlertTriangle } from 'lucide-react';
import ExtractedCorrelationMatrix from './ExtractedCorrelationMatrix';

// ─── Default TKM symptom list for extraction ───
const DEFAULT_SYMPTOMS = [
  '오한 (Chills)', '발열 (Fever)', '두통 (Headache)', '콧물 (Runny Nose)',
  '목아픔 (Sore Throat)', '기침 (Cough)', '가래 (Phlegm)', '갈증 (Thirst)',
  '소화불량 (Dyspepsia)', '구역구토 (Nausea/Vomiting)', '복통 (Abdominal Pain)',
  '설사 (Diarrhea)', '변비 (Constipation)', '피로 (Fatigue)', '무기력 (Lethargy)',
  '불면 (Insomnia)', '다몽 (Vivid Dreams)', '심계 (Palpitations)',
  '흉민 (Chest Tightness)', '숨참 (Dyspnea)', '자한 (Spontaneous Sweating)',
  '도한 (Night Sweating)', '어지러움 (Dizziness)', '이명 (Tinnitus)',
  '요통 (Low Back Pain)', '관절통 (Joint Pain)', '부종 (Edema)',
  '식욕부진 (Poor Appetite)', '구건 (Dry Mouth)', '안면홍조 (Facial Flushing)',
];

/*
Legacy single-pass prompt kept for rollback.

const EXTRACTION_PROMPT = (symptoms) => `You are a Traditional Korean Medicine (TKM) / Traditional Chinese Medicine (TCM) clinical expert.

Given the following list of symptoms, estimate the correlation between EVERY pair of symptoms.

Symptoms:
${symptoms.map((s, i) => `${i + 1}. ${s}`).join('\n')}

For each pair, provide:
- The correlation strength from -1.0 to 1.0 (where 1.0 = always co-occur, -1.0 = never co-occur, 0 = independent)
- Base this on clinical experience and medical literature

IMPORTANT: Return ONLY a valid JSON array. Each element should be:
{"a": <index_of_symptom_a>, "b": <index_of_symptom_b>, "r": <correlation_value>, "note_ko": "<한의학 용어로 간단한 이유 설명 in Korean>", "note_en": "<brief reason in English>"}

For note_ko, use proper Traditional Korean Medicine (한의학) terminology (e.g. 비기허로 인한 식욕부진과 설사 동반, 간양상항으로 두통과 어지러움 동반).
For note_en, provide the English clinical explanation.

Only include pairs where |r| >= 0.10 (skip near-zero correlations to keep it manageable).
Use 0-based indices for symptoms.
Return ONLY the JSON array, no other text.`;
*/

const FULL_MATRIX_BATCH_SIZE = 10;
const GRAPH_LAYOUT_MIN_R = 0.12;
const GRAPH_RENDER_EPSILON = 0.001;

/*
Previous compact-batch rule kept in comments for rollback:
- If a pair is weak or near-independent, return r: 0.00 instead of omitting it.
*/
function buildCompactBatchPrompt(symptoms, leftIndices, rightIndices) {
  const sameBatch =
    leftIndices.length === rightIndices.length &&
    leftIndices.every((value, idx) => value === rightIndices[idx]);
  const expectedPairs = sameBatch
    ? (leftIndices.length * (leftIndices.length - 1)) / 2
    : leftIndices.length * rightIndices.length;

  return `You are a Traditional Korean Medicine (TKM) / Traditional Chinese Medicine (TCM) clinical expert.

Estimate symptom-to-symptom correlation coefficients for the required symptom pairs only.

Return ONLY a valid JSON array.
Each element must be:
{"a": <global_symptom_index>, "b": <global_symptom_index>, "r": <correlation_between_-1_and_1>}

Rules:
- Include EVERY required pair exactly once.
- Use the global 0-based indices exactly as provided below.
- Do not include note_ko, note_en, explanations, markdown, or extra text.
- Keep the output compact and numeric.
- Use exact 0.00 only when the pair is truly independent or there is no clinically meaningful association.
- For weak but still plausible associations, prefer small non-zero values such as +/-0.02 to +/-0.08 instead of defaulting to 0.00.
- Avoid overusing 0.00 across the matrix.

${sameBatch
    ? `Required pairs: every unique pair inside the single batch below where a < b.`
    : `Required pairs: every cross-batch pair where a comes from LEFT BATCH and b comes from RIGHT BATCH.`}
Expected pair count: ${expectedPairs}

LEFT BATCH:
${leftIndices.map(idx => `${idx}. ${symptoms[idx]}`).join('\n')}

${sameBatch ? '' : `RIGHT BATCH:\n${rightIndices.map(idx => `${idx}. ${symptoms[idx]}`).join('\n')}\n\n`}
Return ONLY the JSON array.`;
}

// ─── Force layout for extracted network ───
function layoutNodes(nodes, edges, width, height) {
  const pos = {};
  const n = nodes.length;
  nodes.forEach((node, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const r = Math.min(width, height) * 0.35;
    pos[i] = { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r };
  });

  // Simple force iterations
  for (let iter = 0; iter < 120; iter++) {
    const forces = {};
    nodes.forEach((_, i) => { forces[i] = { x: 0, y: 0 }; });

    // Repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = 600 / (dist * dist);
        forces[i].x += (dx / dist) * f;
        forces[i].y += (dy / dist) * f;
        forces[j].x -= (dx / dist) * f;
        forces[j].y -= (dy / dist) * f;
      }
    }

    // Attraction along edges
    edges.forEach(({ a, b, r }) => {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const ideal = 80 / Math.max(Math.abs(r), 0.1);
      const f = (dist - ideal) * 0.008;
      forces[a].x += (dx / dist) * f;
      forces[a].y += (dy / dist) * f;
      forces[b].x -= (dx / dist) * f;
      forces[b].y -= (dy / dist) * f;
    });

    // Gravity
    nodes.forEach((_, i) => {
      forces[i].x += (width / 2 - pos[i].x) * 0.004;
      forces[i].y += (height / 2 - pos[i].y) * 0.004;
    });

    const damping = 1 - iter / 120;
    nodes.forEach((_, i) => {
      pos[i].x += forces[i].x * damping;
      pos[i].y += forces[i].y * damping;
      pos[i].x = Math.max(50, Math.min(width - 50, pos[i].x));
      pos[i].y = Math.max(50, Math.min(height - 50, pos[i].y));
    });
  }
  return pos;
}

// ─── Color palette for symptom nodes ───
const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#1dca91', '#ef4444', '#8b5cf6',
  '#0ea5e9', '#f97316', '#14b8a6', '#a855f7', '#22c55e', '#e11d48',
  '#06b6d4', '#d97706', '#7c3aed', '#059669', '#dc2626', '#2563eb',
  '#ca8a04', '#9333ea', '#0d9488', '#db2777', '#65a30d', '#4f46e5',
  '#ea580c', '#16a34a', '#be185d', '#1d4ed8', '#b45309', '#7e22ce',
];

const PROVIDERS = {
  gemini: {
    label: 'Gemini',
    apiKeyLabel: 'Gemini API Key',
    apiKeyPlaceholder: 'AIza...',
    modelPlaceholder: 'e.g. gemini-2.0-flash',
  },
  openwebui: {
    label: 'Open WebUI',
    apiKeyLabel: 'Open WebUI API Key',
    apiKeyPlaceholder: 'sk-...',
    modelPlaceholder: 'Model ID shown in Open WebUI',
  },
};

const STORAGE_KEYS = {
  provider: 'tkm-extraction-provider',
  providerConfigs: 'tkm-extraction-provider-configs',
};

const DEFAULT_PROVIDER = import.meta.env.VITE_LLM_PROVIDER === 'openwebui' ? 'openwebui' : 'gemini';
const ENV_GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || '';
const ENV_OPENWEBUI_BASE_URL = import.meta.env.VITE_OPENWEBUI_BASE_URL || '';
const ENV_OPENWEBUI_MODEL = import.meta.env.VITE_OPENWEBUI_MODEL || '';
const DEFAULT_OPENWEBUI_BASE_URL = ENV_OPENWEBUI_BASE_URL || 'http://192.168.102.223:3000';
const DEFAULT_PROVIDER_CONFIGS = {
  gemini: {
    apiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
    modelName: ENV_GEMINI_MODEL || 'gemini-3-flash-preview',
    baseUrl: '',
  },
  openwebui: {
    apiKey: import.meta.env.VITE_OPENWEBUI_API_KEY || '',
    modelName: ENV_OPENWEBUI_MODEL,
    baseUrl: DEFAULT_OPENWEBUI_BASE_URL,
  },
};

function readStoredJson(key) {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function getInitialProvider() {
  if (typeof window === 'undefined') return DEFAULT_PROVIDER;
  const stored = window.localStorage.getItem(STORAGE_KEYS.provider);
  return stored === 'gemini' || stored === 'openwebui' ? stored : DEFAULT_PROVIDER;
}

function getInitialProviderConfigs() {
  const stored = readStoredJson(STORAGE_KEYS.providerConfigs);
  return {
    gemini: {
      ...DEFAULT_PROVIDER_CONFIGS.gemini,
      modelName: ENV_GEMINI_MODEL || stored?.gemini?.modelName || DEFAULT_PROVIDER_CONFIGS.gemini.modelName,
    },
    openwebui: {
      ...DEFAULT_PROVIDER_CONFIGS.openwebui,
      modelName: ENV_OPENWEBUI_MODEL || stored?.openwebui?.modelName || DEFAULT_PROVIDER_CONFIGS.openwebui.modelName,
      baseUrl: ENV_OPENWEBUI_BASE_URL || stored?.openwebui?.baseUrl || DEFAULT_PROVIDER_CONFIGS.openwebui.baseUrl,
    },
  };
}

function getPersistedProviderConfigs(configs) {
  return {
    gemini: {
      modelName: configs.gemini.modelName,
    },
    openwebui: {
      modelName: configs.openwebui.modelName,
      baseUrl: configs.openwebui.baseUrl,
    },
  };
}

function buildOpenWebUIChatUrl(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/api/chat/completions')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/chat/completions`;
  return `${trimmed}/api/chat/completions`;
}

function extractGeminiText(data) {
  return data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('\n') || '';
}

function extractChatCompletionText(data) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      return '';
    }).join('\n');
  }
  return '';
}

function createPairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function buildExtractionBatches(symptomCount, batchSize = FULL_MATRIX_BATCH_SIZE) {
  const chunks = [];
  for (let start = 0; start < symptomCount; start += batchSize) {
    const end = Math.min(start + batchSize, symptomCount);
    chunks.push(Array.from({ length: end - start }, (_, idx) => start + idx));
  }

  const batches = [];
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i; j < chunks.length; j++) {
      const leftIndices = chunks[i];
      const rightIndices = chunks[j];
      const expectedPairs = i === j
        ? (leftIndices.length * (leftIndices.length - 1)) / 2
        : leftIndices.length * rightIndices.length;
      if (expectedPairs > 0) {
        batches.push({ leftIndices, rightIndices, expectedPairs, sameBatch: i === j });
      }
    }
  }

  return batches;
}

function ensureFullEdgeCoverage(symptomCount, edges) {
  const edgeMap = new Map();
  edges.forEach(edge => {
    const normalized = edge.a < edge.b ? edge : { ...edge, a: edge.b, b: edge.a };
    edgeMap.set(createPairKey(normalized.a, normalized.b), normalized);
  });

  const completedEdges = [];
  let filledMissingPairs = 0;

  for (let a = 0; a < symptomCount; a++) {
    for (let b = a + 1; b < symptomCount; b++) {
      const key = createPairKey(a, b);
      const edge = edgeMap.get(key);
      if (edge) {
        completedEdges.push(edge);
      } else {
        completedEdges.push({ a, b, r: 0, note_ko: '', note_en: '' });
        filledMissingPairs++;
      }
    }
  }

  return { completedEdges, filledMissingPairs };
}

async function requestModelText({ provider, requestUrl, modelName, apiKey, prompt }) {
  let res;
  if (provider === 'gemini') {
    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 32768 },
    };

    res = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    const payload = {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 12000,
    };

    res = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API Error ${res.status}`);
  }

  const data = await res.json();
  const text = provider === 'gemini'
    ? extractGeminiText(data)
    : extractChatCompletionText(data);

  if (!text.trim()) {
    throw new Error('모델 응답에서 텍스트를 찾지 못했습니다');
  }

  return text;
}

function parseEdgesFromResponse(text, symptomCount) {
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  jsonStr = jsonStr.trim();

  const arrStart = jsonStr.indexOf('[');
  if (arrStart !== -1) jsonStr = jsonStr.substring(arrStart);

  let edges;
  try {
    edges = JSON.parse(jsonStr);
  } catch {
    // Recover compact batched objects when the model truncates the array.
    const compactPattern = /\{\s*"a"\s*:\s*(\d+)\s*,\s*"b"\s*:\s*(\d+)\s*,\s*"r"\s*:\s*(-?[\d.]+)\s*\}/g;
    edges = [];
    let compactMatch;
    while ((compactMatch = compactPattern.exec(jsonStr)) !== null) {
      edges.push({
        a: parseInt(compactMatch[1]),
        b: parseInt(compactMatch[2]),
        r: parseFloat(compactMatch[3]),
        note_ko: '',
        note_en: '',
      });
    }

    if (edges.length > 0) {
      return edges
        .filter(e =>
          typeof e.a === 'number' && typeof e.b === 'number' && typeof e.r === 'number' &&
          e.a >= 0 && e.a < symptomCount &&
          e.b >= 0 && e.b < symptomCount &&
          e.a !== e.b
        )
        .map(e => ({
          a: e.a,
          b: e.b,
          r: Math.max(-1, Math.min(1, e.r)),
          note_ko: '',
          note_en: '',
        }));
    }

    // Recover complete legacy objects when the model truncates the array.
    const objectPattern = /\{\s*"a"\s*:\s*(\d+)\s*,\s*"b"\s*:\s*(\d+)\s*,\s*"r"\s*:\s*(-?[\d.]+)\s*,\s*"note_ko"\s*:\s*"([^"]*)"\s*,\s*"note_en"\s*:\s*"([^"]*)"\s*\}/g;
    edges = [];
    let match;
    while ((match = objectPattern.exec(jsonStr)) !== null) {
      edges.push({
        a: parseInt(match[1]),
        b: parseInt(match[2]),
        r: parseFloat(match[3]),
        note_ko: match[4],
        note_en: match[5],
      });
    }

    if (edges.length === 0) {
      const oldPattern = /\{\s*"a"\s*:\s*(\d+)\s*,\s*"b"\s*:\s*(\d+)\s*,\s*"r"\s*:\s*(-?[\d.]+)\s*,\s*"note"\s*:\s*"([^"]*)"\s*\}/g;
      let legacyMatch;
      while ((legacyMatch = oldPattern.exec(jsonStr)) !== null) {
        edges.push({
          a: parseInt(legacyMatch[1]),
          b: parseInt(legacyMatch[2]),
          r: parseFloat(legacyMatch[3]),
          note_ko: '',
          note_en: legacyMatch[4],
        });
      }
    }

    if (edges.length === 0) {
      throw new Error('JSON 파싱 실패 — 모델 응답이 잘렸을 수 있습니다');
    }
  }

  if (Array.isArray(edges) && edges.length > 0 && Array.isArray(edges[0])) {
    edges = edges.map(item => ({
      a: item[0],
      b: item[1],
      r: item[2],
      note_ko: '',
      note_en: '',
    }));
  }

  return edges
    .filter(e =>
      typeof e.a === 'number' && typeof e.b === 'number' && typeof e.r === 'number' &&
      e.a >= 0 && e.a < symptomCount &&
      e.b >= 0 && e.b < symptomCount &&
      e.a !== e.b
    )
    .map(e => ({
      a: e.a,
      b: e.b,
      r: Math.max(-1, Math.min(1, e.r)),
      note_ko: e.note_ko || '',
      note_en: e.note_en || e.note || '',
    }));
}

export default function ModelExtractionTab({ onDataExtracted }) {
  const [provider, setProvider] = useState(() => getInitialProvider());
  const [providerConfigs, setProviderConfigs] = useState(() => getInitialProviderConfigs());
  const [symptoms, setSymptoms] = useState(DEFAULT_SYMPTOMS);
  const [symptomText, setSymptomText] = useState(DEFAULT_SYMPTOMS.join('\n'));
  const [extractedEdges, setExtractedEdges] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState(null);
  const [rawResponse, setRawResponse] = useState('');
  const [extractionMeta, setExtractionMeta] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showSettings, setShowSettings] = useState(true);
  const [minR, setMinR] = useState(0.15);

  const W = 700, H = 700;
  const providerInfo = PROVIDERS[provider];
  const currentProviderConfig = providerConfigs[provider];
  const openWebUIRequestUrl = buildOpenWebUIChatUrl(currentProviderConfig.baseUrl);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.provider, provider);
  }, [provider]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      STORAGE_KEYS.providerConfigs,
      JSON.stringify(getPersistedProviderConfigs(providerConfigs))
    );
  }, [providerConfigs]);

  const updateProviderConfig = useCallback((field, value) => {
    setProviderConfigs(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value,
      },
    }));
  }, [provider]);

  const handleExtract = async () => {
    const { apiKey, baseUrl, modelName } = currentProviderConfig;
    const requestUrl = provider === 'gemini'
      ? `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
      : buildOpenWebUIChatUrl(baseUrl);

    if (!apiKey.trim()) {
      setError(`${providerInfo.apiKeyLabel}를 입력해주세요`);
      return;
    }
    if (!modelName.trim()) {
      setError('모델 ID를 입력해주세요');
      return;
    }
    if (provider === 'openwebui' && !baseUrl.trim()) {
      setError('Open WebUI Base URL을 입력해주세요');
      return;
    }

    const parsedSymptoms = symptomText.split('\n').map(s => s.trim()).filter(Boolean);
    if (parsedSymptoms.length < 3) { setError('최소 3개의 증상이 필요합니다'); return; }

    setSymptoms(parsedSymptoms);
    setIsExtracting(true);
    setError(null);
    setExtractedEdges(null);
    setRawResponse('');
    setExtractionMeta(null);
    setSelectedNode(null);

    try {
      /*
      Legacy single-pass extraction flow kept for rollback.

      const prompt = EXTRACTION_PROMPT(parsedSymptoms);
      const text = await requestModelText({ provider, requestUrl, modelName, apiKey, prompt });
      setRawResponse(text);
      const validEdges = parseEdgesFromResponse(text, parsedSymptoms.length);
      setExtractedEdges(validEdges);
      */

      const batches = buildExtractionBatches(parsedSymptoms.length);
      const rawBlocks = [];
      const collectedEdges = [];

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const prompt = buildCompactBatchPrompt(parsedSymptoms, batch.leftIndices, batch.rightIndices);
        const text = await requestModelText({ provider, requestUrl, modelName, apiKey, prompt });
        const batchEdges = parseEdgesFromResponse(text, parsedSymptoms.length);

        rawBlocks.push(
          [
            `=== Batch ${batchIndex + 1}/${batches.length} | expected ${batch.expectedPairs} pairs ===`,
            `left: ${batch.leftIndices.join(', ')}`,
            `right: ${batch.rightIndices.join(', ')}`,
            text,
          ].join('\n')
        );

        collectedEdges.push(...batchEdges);
      }

      const { completedEdges, filledMissingPairs } = ensureFullEdgeCoverage(parsedSymptoms.length, collectedEdges);

      setRawResponse(rawBlocks.join('\n\n'));
      setExtractedEdges(completedEdges);
      setExtractionMeta({
        provider,
        providerLabel: providerInfo.label,
        modelName,
        baseUrl: provider === 'openwebui' ? baseUrl : '',
        strategy: 'batched_full_matrix',
        batchCount: batches.length,
        expectedPairs: (parsedSymptoms.length * (parsedSymptoms.length - 1)) / 2,
        filledMissingPairs,
      });
      onDataExtracted?.(parsedSymptoms, completedEdges);
    } catch (e) {
      if (e instanceof TypeError) {
        setError(`추출 실패: ${requestUrl} 연결에 실패했습니다. Base URL이 실제 Open WebUI 주소인지 확인해주세요.`);
      } else {
        setError(`추출 실패: ${e.message}`);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const activeEdges = useMemo(() => extractedEdges || [], [extractedEdges]);

  const graphEdges = useMemo(() => {
    const threshold = minR <= 0 ? GRAPH_RENDER_EPSILON : minR;
    return activeEdges.filter(e => Math.abs(e.r) >= threshold);
  }, [activeEdges, minR]);

  const layoutEdges = useMemo(() => {
    const threshold = Math.max(minR, GRAPH_LAYOUT_MIN_R);
    const strongEdges = activeEdges.filter(e => Math.abs(e.r) >= threshold);
    if (strongEdges.length > 0) return strongEdges;

    const fallbackEdges = activeEdges.filter(e => Math.abs(e.r) >= 0.05);
    return fallbackEdges.length > 0 ? fallbackEdges : activeEdges.filter(e => Math.abs(e.r) >= GRAPH_RENDER_EPSILON);
  }, [activeEdges, minR]);

  const positions = useMemo(() => {
    if (!extractedEdges || symptoms.length === 0) return {};
    return layoutNodes(symptoms, layoutEdges, W, H);
  }, [symptoms, layoutEdges, extractedEdges]);

  const connectedToSelected = useMemo(() => {
    if (selectedNode === null) return new Set();
    const s = new Set();
    graphEdges.forEach(e => {
      if (e.a === selectedNode) s.add(e.b);
      if (e.b === selectedNode) s.add(e.a);
    });
    return s;
  }, [selectedNode, graphEdges]);

  const selectedEdges = useMemo(() => {
    if (selectedNode === null) return [];
    return graphEdges
      .filter(e => e.a === selectedNode || e.b === selectedNode)
      .map(e => ({
        ...e,
        partner: e.a === selectedNode ? e.b : e.a,
      }))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }, [selectedNode, graphEdges]);

  const degree = useMemo(() => {
    const d = {};
    symptoms.forEach((_, i) => { d[i] = 0; });
    graphEdges.forEach(({ a, b }) => { d[a]++; d[b]++; });
    return d;
  }, [symptoms, graphEdges]);

  const zeroEdgeCount = useMemo(
    () => activeEdges.filter(e => Math.abs(e.r) < GRAPH_RENDER_EPSILON).length,
    [activeEdges]
  );

  const handleExport = () => {
    const exportMeta = extractionMeta || {
      provider,
      providerLabel: providerInfo.label,
      modelName: currentProviderConfig.modelName,
      baseUrl: provider === 'openwebui' ? currentProviderConfig.baseUrl : '',
    };

    const data = {
      metadata: {
        provider: exportMeta.provider,
        providerLabel: exportMeta.providerLabel,
        model: exportMeta.modelName,
        ...(exportMeta.baseUrl ? { baseUrl: exportMeta.baseUrl } : {}),
        ...(exportMeta.strategy ? { strategy: exportMeta.strategy } : {}),
        ...(exportMeta.batchCount ? { batchCount: exportMeta.batchCount } : {}),
        ...(exportMeta.expectedPairs ? { expectedPairs: exportMeta.expectedPairs } : {}),
        ...(exportMeta.filledMissingPairs ? { filledMissingPairs: exportMeta.filledMissingPairs } : {}),
        extractedAt: new Date().toISOString(),
        symptomCount: symptoms.length,
        edgeCount: extractedEdges?.length || 0,
        source: `${exportMeta.provider}_extraction`,
      },
      symptoms: symptoms.map((s, i) => ({ index: i, label: s })),
      correlations: activeEdges.map(e => ({
        a: e.a, b: e.b, r: e.r, note_ko: e.note_ko, note_en: e.note_en,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm_symptom_network_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getShortLabel = (s) => {
    const match = s.match(/^([^\s(]+)/);
    return match ? match[1] : s.substring(0, 4);
  };

  return (
    <div className="space-y-3">
      {/* Settings panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <button onClick={() => setShowSettings(!showSettings)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-700">모델 설정 & 증상 목록</span>
          </div>
          <span className="text-[10px] text-slate-400">{showSettings ? '접기' : '펼치기'}</span>
        </button>

        {showSettings && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* API Key + Model */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">Provider</label>
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="gemini">Gemini API</option>
                  <option value="openwebui">Open WebUI / Workstation</option>
                </select>

                {provider === 'openwebui' && (
                  <>
                    <label className="text-[10px] font-black text-slate-400 uppercase">Open WebUI Base URL</label>
                    <input
                      type="text"
                      value={currentProviderConfig.baseUrl}
                      onChange={e => updateProviderConfig('baseUrl', e.target.value)}
                      placeholder={DEFAULT_OPENWEBUI_BASE_URL}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <div className="text-[9px] leading-relaxed text-slate-400 bg-slate-50 rounded-lg p-2">
                      현재 호출 주소: <span className="font-mono text-slate-500">{openWebUIRequestUrl || 'Base URL을 입력해주세요'}</span>
                    </div>
                  </>
                )}

                <label className="text-[10px] font-black text-slate-400 uppercase">{providerInfo.apiKeyLabel}</label>
                <input
                  type="password"
                  value={currentProviderConfig.apiKey}
                  onChange={e => updateProviderConfig('apiKey', e.target.value)}
                  placeholder={providerInfo.apiKeyPlaceholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                <label className="text-[10px] font-black text-slate-400 uppercase">Model ID</label>
                <input
                  type="text"
                  value={currentProviderConfig.modelName}
                  onChange={e => updateProviderConfig('modelName', e.target.value)}
                  placeholder={providerInfo.modelPlaceholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />

                <div className="text-[9px] leading-relaxed text-slate-400 bg-slate-50 rounded-lg p-2">
                  {provider === 'gemini'
                    ? 'Gemini는 기존 Google endpoint를 그대로 사용합니다.'
                    : 'Open WebUI는 마지막으로 입력한 Base URL과 모델 ID를 브라우저에 저장합니다. API Key는 저장하지 않습니다.'}
                </div>
              </div>

              {/* Symptom list */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase">
                  증상 목록 (한 줄에 하나씩) — {symptomText.split('\n').filter(Boolean).length}개
                </label>
                <textarea value={symptomText} onChange={e => setSymptomText(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[10px] font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleExtract} disabled={isExtracting}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2">
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isExtracting ? '모델에서 추출 중...' : '모델 지식 추출 시작'}
              </button>
              {extractedEdges && (
                <span className="text-[10px] font-bold text-green-600">
                  {extractedEdges.length}개 상관관계 추출 완료
                </span>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2 rounded-lg">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {extractedEdges && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            <div className="space-y-3">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden xl:aspect-square flex flex-col">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Bot className="w-4 h-4 text-indigo-500" />
                    모델이 이해하는 증상 상관관계 네트워크
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-400 font-bold">최소 |r|:</span>
                      <input type="range" min="0" max="0.8" step="0.05" value={minR}
                        onChange={e => setMinR(parseFloat(e.target.value))}
                        className="w-20 h-1 accent-indigo-600" />
                      <span className="text-[10px] font-mono font-bold text-indigo-600">{minR.toFixed(2)}</span>
                    </div>
                    <span className="text-[9px] text-slate-400">
                      {graphEdges.length}/{extractedEdges.length} edges
                    </span>
                  </div>
                </div>

                <div className="p-3 flex-1 min-h-0">
                  <div className="bg-slate-50/70 rounded-xl border border-slate-100 p-2 h-full">
                    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
                      {graphEdges.map((e, i) => {
                        const p1 = positions[e.a];
                        const p2 = positions[e.b];
                        if (!p1 || !p2) return null;
                        const isPos = e.r > 0;
                        const absR = Math.abs(e.r);
                        const isConnected = selectedNode !== null && (e.a === selectedNode || e.b === selectedNode);
                        const opacity = selectedNode !== null
                          ? (isConnected ? 0.7 : 0.03)
                          : Math.max(0.08, absR * 0.6);

                        return (
                          <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                            stroke={isPos ? '#6366f1' : '#ef4444'}
                            strokeWidth={isConnected ? Math.max(1.5, absR * 5) : Math.max(0.3, absR * 2.5)}
                            opacity={opacity}
                            strokeDasharray={isPos ? 'none' : '4 3'}
                            className="transition-all duration-300"
                          />
                        );
                      })}

                      {symptoms.map((sym, i) => {
                        const pos = positions[i];
                        if (!pos) return null;
                        const isSelected = i === selectedNode;
                        const isConnected = connectedToSelected.has(i);
                        const opacity = selectedNode !== null
                          ? (isSelected || isConnected ? 1 : 0.12)
                          : 1;
                        const r = Math.max(8, Math.min(20, 6 + (degree[i] || 0) * 1.2));
                        const color = COLORS[i % COLORS.length];

                        return (
                          <g key={i} transform={`translate(${pos.x}, ${pos.y})`}
                            className="transition-all duration-300"
                            style={{ opacity, cursor: 'pointer' }}
                            onClick={() => setSelectedNode(isSelected ? null : i)}>
                            {isSelected && <circle r={r + 5} fill={color} opacity={0.15} />}
                            <circle r={r}
                              fill={isSelected ? color : 'white'}
                              stroke={color} strokeWidth={isSelected ? 3 : 2} />
                            <text y={r + 12} textAnchor="middle"
                              className="text-[9px] font-bold pointer-events-none select-none"
                              fill={isSelected ? '#1e293b' : '#94a3b8'}>
                              {getShortLabel(sym)}
                            </text>
                            {isSelected && degree[i] > 0 && (
                              <g transform={`translate(${r - 2}, ${-r + 2})`}>
                                <circle r={6} fill="#6366f1" />
                                <text textAnchor="middle" y={3} fill="white" className="text-[7px] font-black">
                                  {degree[i]}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
                  {selectedNode !== null ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-800">{symptoms[selectedNode]}</h4>
                        <span className="text-[9px] font-bold text-indigo-500">연결: {degree[selectedNode]}</span>
                      </div>

                      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                        {selectedEdges.map((e, i) => {
                          const isPos = e.r > 0;
                          return (
                            <div key={i}
                              className="p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => setSelectedNode(e.partner)}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-slate-700 truncate flex-1">
                                  {symptoms[e.partner]}
                                </span>
                              <div className="flex items-center gap-1">
                                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                    isPos ? 'bg-indigo-50 text-indigo-700' : 'bg-red-50 text-red-700'
                                  }`}>
                                    r={e.r.toFixed(3)}
                                  </span>
                                </div>
                              </div>
                              {(e.note_ko || e.note_en) && (
                                <div className="mt-1 leading-relaxed space-y-0.5">
                                  {e.note_ko && <div className="text-[9px] text-slate-600 font-medium">{e.note_ko}</div>}
                                  {e.note_en && <div className="text-[8px] text-slate-400">{e.note_en}</div>}
                                </div>
                              )}
                              <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full rounded-full"
                                  style={{
                                    width: `${Math.abs(e.r) * 100}%`,
                                    backgroundColor: isPos ? '#6366f1' : '#ef4444',
                                  }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-300 space-y-2">
                      <Eye className="w-6 h-6 mx-auto opacity-40" />
                      <p className="text-[10px] font-medium">증상 노드나 행렬 제목을 클릭하면<br />모델의 이해를 확인할 수 있습니다</p>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">추출 통계</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 p-2 rounded-lg">
                      <div className="text-[9px] text-slate-400 font-bold">증상 수</div>
                      <div className="text-lg font-black text-slate-800">{symptoms.length}</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg">
                      <div className="text-[9px] text-slate-400 font-bold">추출된 상관관계</div>
                      <div className="text-lg font-black text-indigo-600">{extractedEdges.length}</div>
                    </div>
                    <div className="bg-indigo-50 p-2 rounded-lg">
                      <div className="text-[9px] text-indigo-400 font-bold">양의 상관</div>
                      <div className="text-lg font-black text-indigo-700">
                        {extractedEdges.filter(e => e.r > 0).length}
                      </div>
                    </div>
                    <div className="bg-red-50 p-2 rounded-lg">
                      <div className="text-[9px] text-red-400 font-bold">음의 상관</div>
                      <div className="text-lg font-black text-red-700">
                        {extractedEdges.filter(e => e.r < 0).length}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-lg">
                      <div className="text-[9px] text-slate-400 font-bold">정확히 0.00</div>
                      <div className="text-lg font-black text-slate-700">{zeroEdgeCount}</div>
                    </div>
                    <div className="bg-indigo-50 p-2 rounded-lg">
                      <div className="text-[9px] text-indigo-400 font-bold">그래프 표시</div>
                      <div className="text-lg font-black text-indigo-700">{graphEdges.length}</div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[9px] font-black text-slate-400 uppercase mb-1">핵심 증상 (연결 수)</h5>
                    {Object.entries(degree)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([idx, deg]) => (
                        <div key={idx} className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-slate-50 rounded px-1"
                          onClick={() => setSelectedNode(parseInt(idx))}>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-[9px] font-bold text-slate-600 flex-1 truncate">{getShortLabel(symptoms[idx])}</span>
                          <span className="text-[9px] font-mono text-slate-400">{deg}</span>
                        </div>
                      ))
                    }
                  </div>

                  <button onClick={handleExport}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-2">
                    <Download className="w-3.5 h-3.5" /> 추출 데이터 내보내기 (JSON)
                  </button>

                  <div className="text-[8px] text-slate-400">
                    <strong>제공자:</strong> {extractionMeta?.providerLabel || providerInfo.label}<br />
                    <strong>모델:</strong> {extractionMeta?.modelName || currentProviderConfig.modelName}<br />
                    <strong>0.00 의미:</strong> 모델이 사실상 독립 또는 매우 약한 관계로 판단한 쌍<br />
                    <strong>그래프 배치:</strong> |r| ≥ {GRAPH_LAYOUT_MIN_R.toFixed(2)} 중심으로 배치하고, 히트맵은 전체 행렬 유지<br />
                    {extractionMeta?.strategy && (
                      <>
                        <strong>전략:</strong> full matrix batch ({extractionMeta.batchCount}회)<br />
                      </>
                    )}
                    {extractionMeta?.filledMissingPairs > 0 && (
                      <>
                        <strong>보정:</strong> 누락 쌍 {extractionMeta.filledMissingPairs}개를 0으로 채움<br />
                      </>
                    )}
                    <strong>출처:</strong> LLM 지식 추출 (검증 필요)
                  </div>
                </div>
              </div>
            </div>

            <ExtractedCorrelationMatrix
              symptoms={symptoms}
              edges={activeEdges || []}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />
          </div>

          {rawResponse && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2 text-slate-700">
                  <Eye className="w-4 h-4 text-slate-400" />
                  {extractionMeta?.providerLabel || providerInfo.label} 원본 응답
                </h3>
                <span className="text-[9px] text-slate-400 font-mono">
                  {rawResponse.length.toLocaleString()} chars
                </span>
              </div>
              <pre className="px-4 py-3 text-[10px] font-mono text-slate-600 whitespace-pre-wrap max-h-[400px] overflow-y-auto bg-slate-50 leading-relaxed">
                {rawResponse}
              </pre>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
