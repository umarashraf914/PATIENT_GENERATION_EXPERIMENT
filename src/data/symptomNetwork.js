/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TKM Symptom Correlation Network
 * Based on 400-patient chart review (Pages 36-38 of clinical guidelines)
 * 51 correlation coefficients from real clinical data
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// SYMPTOM DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export const SYMPTOMS = {
  // ── 식욕/소화 클러스터 (Appetite/Digestion) ──
  appetite_good:    { ko: '식욕좋음',    en: 'Good Appetite',      category: 'digestion',    color: '#22c55e' },
  digestion_good:   { ko: '소화양호',    en: 'Good Digestion',     category: 'digestion',    color: '#16a34a' },
  dyspepsia:        { ko: '소화불량',    en: 'Dyspepsia',          category: 'digestion',    color: '#b45309' },
  heartburn:        { ko: '속쓰림',     en: 'Heartburn',          category: 'digestion',    color: '#dc2626' },
  nausea_vomit:     { ko: '구역구토',    en: 'Nausea/Vomiting',    category: 'digestion',    color: '#ea580c' },
  belching:         { ko: '트림',       en: 'Belching',           category: 'digestion',    color: '#d97706' },
  gas_bloating:     { ko: '가스참',     en: 'Gas/Bloating',       category: 'digestion',    color: '#ca8a04' },
  upper_abd_pain:   { ko: '상복통증',    en: 'Upper Abd. Pain',    category: 'digestion',    color: '#ef4444' },
  lower_abd_pain:   { ko: '하복통증',    en: 'Lower Abd. Pain',    category: 'digestion',    color: '#f97316' },
  food_amount:      { ko: '식사량',     en: 'Food Intake',        category: 'digestion',    color: '#65a30d' },
  water_intake:     { ko: '음수량',     en: 'Water Intake',       category: 'digestion',    color: '#0ea5e9' },
  thirst:           { ko: '갈증',       en: 'Thirst',             category: 'digestion',    color: '#38bdf8' },

  // ── 비만/대사 클러스터 (Obesity/Metabolic) ──
  obesity:          { ko: '비만',       en: 'Obesity',            category: 'metabolic',    color: '#7c3aed' },
  abdominal_obesity:{ ko: '복부비만',    en: 'Abdominal Obesity',  category: 'metabolic',    color: '#8b5cf6' },
  hypertension:     { ko: '고혈압',     en: 'Hypertension',       category: 'metabolic',    color: '#dc2626' },
  diabetes:         { ko: '당뇨',       en: 'Diabetes',           category: 'metabolic',    color: '#9333ea' },
  dyslipidemia:     { ko: '이상지질혈증',  en: 'Dyslipidemia',       category: 'metabolic',    color: '#a855f7' },

  // ── 호흡기 클러스터 (Respiratory) ──
  cough:            { ko: '기침',       en: 'Cough',              category: 'respiratory',  color: '#059669' },
  phlegm:           { ko: '가래',       en: 'Phlegm',             category: 'respiratory',  color: '#10b981' },
  dyspnea:          { ko: '숨참',       en: 'Dyspnea',            category: 'respiratory',  color: '#0d9488' },
  throat_obstruction:{ ko: '매핵기',    en: 'Throat Obstruction', category: 'respiratory',  color: '#14b8a6' },

  // ── 흉민/스트레스/수면 클러스터 (Chest/Stress/Sleep) ──
  chest_tight:      { ko: '흉민',       en: 'Chest Tightness',    category: 'psychosomatic', color: '#6366f1' },
  chest_pain:       { ko: '흉통',       en: 'Chest Pain',         category: 'psychosomatic', color: '#4f46e5' },
  stress:           { ko: '스트레스',    en: 'Stress',             category: 'psychosomatic', color: '#ec4899' },
  headache:         { ko: '두통',       en: 'Headache',           category: 'psychosomatic', color: '#a855f7' },
  sleep_quality:    { ko: '수면질',     en: 'Sleep Quality',      category: 'psychosomatic', color: '#6366f1' },
  sleep_disorder:   { ko: '수면장애',    en: 'Sleep Disorder',     category: 'psychosomatic', color: '#818cf8' },
  dreams:           { ko: '다몽',       en: 'Vivid Dreams',       category: 'psychosomatic', color: '#a78bfa' },
  anxiety:          { ko: '경계긴장',    en: 'Anxiety/Tension',    category: 'psychosomatic', color: '#f43f5e' },
  depression:       { ko: '우울',       en: 'Depression',         category: 'psychosomatic', color: '#64748b' },
  ocd:              { ko: '강박',       en: 'OCD',                category: 'psychosomatic', color: '#94a3b8' },

  // ── 피로/통증 클러스터 (Fatigue/Pain) ──
  fatigue:          { ko: '피로',       en: 'Fatigue',            category: 'general',      color: '#78716c' },
  pain:             { ko: '통증',       en: 'Pain',               category: 'general',      color: '#ef4444' },
  weakness:         { ko: '허약',       en: 'Weakness',           category: 'general',      color: '#a8a29e' },
  activity_level:   { ko: '활동량',     en: 'Activity Level',     category: 'general',      color: '#22d3ee' },

  // ── 기타 (Misc) ──
  hearing_loss:     { ko: '난청',       en: 'Hearing Loss',       category: 'sensory',      color: '#475569' },
  tinnitus:         { ko: '이명',       en: 'Tinnitus',           category: 'sensory',      color: '#64748b' },
  sweat_amount:     { ko: '땀양',       en: 'Sweat Amount',       category: 'thermoreg',    color: '#0ea5e9' },
  heat:             { ko: '열',         en: 'Heat Sensation',     category: 'thermoreg',    color: '#ef4444' },
};

export const CATEGORIES = {
  digestion:    { ko: '소화기',       en: 'Digestive',       color: '#f59e0b' },
  metabolic:    { ko: '대사',        en: 'Metabolic',       color: '#8b5cf6' },
  respiratory:  { ko: '호흡기',       en: 'Respiratory',     color: '#10b981' },
  psychosomatic:{ ko: '정신/심리',    en: 'Psychosomatic',   color: '#6366f1' },
  general:      { ko: '전신',        en: 'General',         color: '#78716c' },
  sensory:      { ko: '감각',        en: 'Sensory',         color: '#475569' },
  thermoreg:    { ko: '한열',        en: 'Thermoregulation', color: '#ef4444' },
};

// ─────────────────────────────────────────────────────────────────────────────
// CORRELATION DATA — 51 coefficients from 400-patient chart review
// source: "chart_review" = Pages 36-38 of clinical guidelines
// ─────────────────────────────────────────────────────────────────────────────
export const CORRELATIONS = [
  // ── 식욕-소화 클러스터 (Appetite-Digestion) ──
  { from: 'appetite_good', to: 'obesity',           r:  0.364, source: 'chart_review' },
  { from: 'appetite_good', to: 'abdominal_obesity', r:  0.373, source: 'chart_review' },
  { from: 'appetite_good', to: 'food_amount',       r:  0.689, source: 'chart_review' },
  { from: 'appetite_good', to: 'water_intake',      r:  0.311, source: 'chart_review' },
  { from: 'appetite_good', to: 'ocd',               r: -0.404, source: 'chart_review' },
  { from: 'appetite_good', to: 'digestion_good',    r:  0.374, source: 'chart_review' },

  // ── 비만 클러스터 (Obesity) ──
  { from: 'abdominal_obesity', to: 'obesity',       r:  0.687, source: 'chart_review' },
  { from: 'abdominal_obesity', to: 'food_amount',   r:  0.359, source: 'chart_review' },

  // ── 소화 관련 (Digestion) ──
  { from: 'digestion_good', to: 'dyspepsia',        r: -0.537, source: 'chart_review' },
  { from: 'digestion_good', to: 'heartburn',        r:  0.329, source: 'chart_review' },
  { from: 'digestion_good', to: 'nausea_vomit',     r: -0.325, source: 'chart_review' },
  { from: 'digestion_good', to: 'food_amount',      r:  0.349, source: 'chart_review' },
  { from: 'dyspepsia',      to: 'upper_abd_pain',   r:  0.372, source: 'chart_review' },
  { from: 'dyspepsia',      to: 'lower_abd_pain',   r:  0.310, source: 'chart_review' },
  { from: 'nausea_vomit',   to: 'dyspepsia',        r:  0.349, source: 'chart_review' },
  { from: 'nausea_vomit',   to: 'belching',         r:  0.309, source: 'chart_review' },
  { from: 'nausea_vomit',   to: 'upper_abd_pain',   r:  0.332, source: 'chart_review' },
  { from: 'belching',       to: 'gas_bloating',     r:  0.325, source: 'chart_review' },
  { from: 'belching',       to: 'upper_abd_pain',   r:  0.455, source: 'chart_review' },
  { from: 'belching',       to: 'lower_abd_pain',   r:  0.300, source: 'chart_review' },
  { from: 'heartburn',      to: 'dyspepsia',        r:  0.329, source: 'chart_review' },
  { from: 'heartburn',      to: 'nausea_vomit',     r:  0.326, source: 'chart_review' },

  // ── 호흡기 클러스터 (Respiratory) ──
  { from: 'dyspnea',  to: 'chest_pain',         r:  0.431, source: 'chart_review' },
  { from: 'dyspnea',  to: 'cough',              r:  0.319, source: 'chart_review' },
  { from: 'dyspnea',  to: 'thirst',             r:  0.307, source: 'chart_review' },
  { from: 'cough',    to: 'phlegm',             r:  0.438, source: 'chart_review' },
  { from: 'cough',    to: 'throat_obstruction', r:  0.351, source: 'chart_review' },
  { from: 'phlegm',   to: 'throat_obstruction', r:  0.443, source: 'chart_review' },

  // ── 흉민 클러스터 (Chest Tightness) ──
  { from: 'chest_tight', to: 'chest_pain',      r:  0.359, source: 'chart_review' },
  { from: 'chest_tight', to: 'stress',          r:  0.322, source: 'chart_review' },
  { from: 'chest_tight', to: 'headache',        r:  0.356, source: 'chart_review' },
  { from: 'chest_tight', to: 'upper_abd_pain',  r:  0.385, source: 'chart_review' },
  { from: 'chest_tight', to: 'sleep_quality',   r:  0.373, source: 'chart_review' },
  { from: 'chest_tight', to: 'dyspnea',         r:  0.431, source: 'chart_review' },

  // ── 스트레스-수면 클러스터 (Stress-Sleep) ──
  { from: 'stress',       to: 'sleep_quality',  r:  0.430, source: 'chart_review' },
  { from: 'stress',       to: 'belching',       r:  0.323, source: 'chart_review' },
  { from: 'stress',       to: 'activity_level', r:  0.323, source: 'chart_review' },
  { from: 'sleep_quality',to: 'sleep_disorder', r:  0.695, source: 'chart_review' },
  { from: 'dreams',       to: 'sleep_disorder', r:  0.327, source: 'chart_review' },
  { from: 'dreams',       to: 'anxiety',        r:  0.481, source: 'chart_review' },
  { from: 'dreams',       to: 'depression',     r:  0.358, source: 'chart_review' },
  { from: 'dreams',       to: 'sleep_quality',  r:  0.430, source: 'chart_review' },
  { from: 'dreams',       to: 'chest_tight',    r:  0.332, source: 'chart_review' },
  { from: 'chest_pain',   to: 'dreams',         r:  0.301, source: 'chart_review' },
  { from: 'anxiety',      to: 'depression',     r:  0.312, source: 'chart_review' },
  { from: 'anxiety',      to: 'chest_pain',     r:  0.326, source: 'chart_review' },

  // ── 피로 클러스터 (Fatigue) ──
  { from: 'fatigue', to: 'pain',     r:  0.435, source: 'chart_review' },
  { from: 'fatigue', to: 'weakness', r:  0.320, source: 'chart_review' },

  // ── 이비인후 (ENT) ──
  { from: 'hearing_loss', to: 'tinnitus', r: 0.329, source: 'chart_review' },

  // ── 땀-열 (Sweat-Heat) — NEGATIVE ──
  { from: 'sweat_amount', to: 'heat', r: -0.372, source: 'chart_review' },

  // ── 대사증후군 (Metabolic Syndrome) ──
  { from: 'hypertension', to: 'diabetes',     r: 0.340, source: 'chart_review' },
  { from: 'hypertension', to: 'dyslipidemia', r: 0.447, source: 'chart_review' },
  { from: 'diabetes',     to: 'dyslipidemia', r: 0.414, source: 'chart_review' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 팔강변증 (Eight Principles) DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export const BAGANG = {
  yin:        { ko: '음', en: 'Yin',        pair: 'yang',       group: 'yinyang',   color: '#1e3a8a' },
  yang:       { ko: '양', en: 'Yang',       pair: 'yin',        group: 'yinyang',   color: '#9d174d' },
  exterior:   { ko: '표', en: 'Exterior',   pair: 'interior',   group: 'pyori',     color: '#0ea5e9' },
  interior:   { ko: '리', en: 'Interior',   pair: 'exterior',   group: 'pyori',     color: '#78350f' },
  cold:       { ko: '한', en: 'Cold',       pair: 'heat_bg',    group: 'hanyeol',   color: '#2563eb' },
  heat_bg:    { ko: '열', en: 'Heat',       pair: 'cold',       group: 'hanyeol',   color: '#dc2626' },
  deficiency: { ko: '허', en: 'Deficiency', pair: 'excess',     group: 'heosil',    color: '#64748b' },
  excess:     { ko: '실', en: 'Excess',     pair: 'deficiency', group: 'heosil',    color: '#0f172a' },
};

// ─────────────────────────────────────────────────────────────────────────────
// 팔강-증상 연관 (Bagang-Symptom Associations)
// Estimated from TKM clinical principles + existing disease probability data
// source: "tkm_principles" — to be validated by doctors
// ─────────────────────────────────────────────────────────────────────────────
export const BAGANG_SYMPTOM_ASSOCIATIONS = [
  // 한증 (Cold pattern)
  { bagang: 'cold', symptom: 'fatigue',       weight: 0.6, direction: 'positive' },
  { bagang: 'cold', symptom: 'weakness',      weight: 0.5, direction: 'positive' },
  { bagang: 'cold', symptom: 'lower_abd_pain',weight: 0.4, direction: 'positive' },
  { bagang: 'cold', symptom: 'dyspepsia',     weight: 0.5, direction: 'positive' },
  { bagang: 'cold', symptom: 'thirst',        weight: 0.3, direction: 'negative' },
  { bagang: 'cold', symptom: 'heat',          weight: 0.7, direction: 'negative' },

  // 열증 (Heat pattern)
  { bagang: 'heat_bg', symptom: 'heat',          weight: 0.8, direction: 'positive' },
  { bagang: 'heat_bg', symptom: 'thirst',        weight: 0.7, direction: 'positive' },
  { bagang: 'heat_bg', symptom: 'heartburn',     weight: 0.5, direction: 'positive' },
  { bagang: 'heat_bg', symptom: 'headache',      weight: 0.4, direction: 'positive' },
  { bagang: 'heat_bg', symptom: 'anxiety',       weight: 0.4, direction: 'positive' },
  { bagang: 'heat_bg', symptom: 'sleep_disorder',weight: 0.4, direction: 'positive' },
  { bagang: 'heat_bg', symptom: 'sweat_amount',  weight: 0.5, direction: 'positive' },

  // 허증 (Deficiency pattern)
  { bagang: 'deficiency', symptom: 'fatigue',       weight: 0.7, direction: 'positive' },
  { bagang: 'deficiency', symptom: 'weakness',      weight: 0.7, direction: 'positive' },
  { bagang: 'deficiency', symptom: 'dyspnea',       weight: 0.4, direction: 'positive' },
  { bagang: 'deficiency', symptom: 'appetite_good', weight: 0.4, direction: 'negative' },
  { bagang: 'deficiency', symptom: 'sweat_amount',  weight: 0.5, direction: 'positive' },

  // 실증 (Excess pattern)
  { bagang: 'excess', symptom: 'pain',          weight: 0.6, direction: 'positive' },
  { bagang: 'excess', symptom: 'chest_tight',   weight: 0.5, direction: 'positive' },
  { bagang: 'excess', symptom: 'stress',        weight: 0.4, direction: 'positive' },
  { bagang: 'excess', symptom: 'gas_bloating',  weight: 0.5, direction: 'positive' },
  { bagang: 'excess', symptom: 'headache',      weight: 0.4, direction: 'positive' },

  // 표증 (Exterior pattern)
  { bagang: 'exterior', symptom: 'headache',        weight: 0.5, direction: 'positive' },
  { bagang: 'exterior', symptom: 'cough',           weight: 0.5, direction: 'positive' },
  { bagang: 'exterior', symptom: 'phlegm',          weight: 0.4, direction: 'positive' },
  { bagang: 'exterior', symptom: 'sweat_amount',    weight: 0.4, direction: 'positive' },

  // 리증 (Interior pattern)
  { bagang: 'interior', symptom: 'dyspepsia',       weight: 0.6, direction: 'positive' },
  { bagang: 'interior', symptom: 'lower_abd_pain',  weight: 0.5, direction: 'positive' },
  { bagang: 'interior', symptom: 'nausea_vomit',    weight: 0.4, direction: 'positive' },
  { bagang: 'interior', symptom: 'sleep_disorder',  weight: 0.3, direction: 'positive' },

  // 음증 (Yin pattern)
  { bagang: 'yin', symptom: 'fatigue',       weight: 0.5, direction: 'positive' },
  { bagang: 'yin', symptom: 'weakness',      weight: 0.5, direction: 'positive' },
  { bagang: 'yin', symptom: 'depression',    weight: 0.3, direction: 'positive' },

  // 양증 (Yang pattern)
  { bagang: 'yang', symptom: 'heat',         weight: 0.5, direction: 'positive' },
  { bagang: 'yang', symptom: 'stress',       weight: 0.3, direction: 'positive' },
  { bagang: 'yang', symptom: 'anxiety',      weight: 0.3, direction: 'positive' },
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Convert correlation coefficient r to conditional probability P(B|A) */
export function rToConditionalProb(r, baseRate = 0.3) {
  // Using the formula: P(B|A) ≈ baseRate + r * sqrt(baseRate * (1-baseRate))
  // This is a simplified approximation assuming binary symptoms
  const adjustment = r * Math.sqrt(baseRate * (1 - baseRate));
  return Math.max(0.01, Math.min(0.99, baseRate + adjustment));
}

/** Get all correlations for a specific symptom */
export function getCorrelationsFor(symptomId) {
  return CORRELATIONS.filter(c => c.from === symptomId || c.to === symptomId)
    .map(c => ({
      ...c,
      partner: c.from === symptomId ? c.to : c.from,
      condProb: rToConditionalProb(c.r),
    }))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

/** Get all symptoms connected to a bagang pattern */
export function getBagangSymptoms(bagangId) {
  return BAGANG_SYMPTOM_ASSOCIATIONS
    .filter(a => a.bagang === bagangId)
    .sort((a, b) => b.weight - a.weight);
}

/** Build adjacency matrix for all symptoms */
export function buildAdjacencyMatrix() {
  const ids = Object.keys(SYMPTOMS);
  const matrix = {};
  ids.forEach(id => { matrix[id] = {}; });

  CORRELATIONS.forEach(({ from, to, r }) => {
    matrix[from][to] = r;
    matrix[to][from] = r;
  });

  return matrix;
}

/** Get unique symptom clusters from correlations */
export function getSymptomClusters() {
  const clusters = {
    digestion:    { ko: '식욕-소화 클러스터',    symptoms: new Set() },
    obesity:      { ko: '비만/대사 클러스터',     symptoms: new Set() },
    respiratory:  { ko: '호흡기 클러스터',        symptoms: new Set() },
    psychosomatic:{ ko: '흉민-스트레스-수면 클러스터', symptoms: new Set() },
    fatigue:      { ko: '피로-통증 클러스터',     symptoms: new Set() },
    sensory:      { ko: '이비인후 클러스터',      symptoms: new Set() },
    thermoreg:    { ko: '한열 클러스터',          symptoms: new Set() },
    metabolic:    { ko: '대사증후군 클러스터',     symptoms: new Set() },
  };

  Object.entries(SYMPTOMS).forEach(([id, s]) => {
    if (clusters[s.category]) {
      clusters[s.category].symptoms.add(id);
    }
  });

  return clusters;
}

/** Calculate network statistics */
export function getNetworkStats() {
  const positiveCorr = CORRELATIONS.filter(c => c.r > 0);
  const negativeCorr = CORRELATIONS.filter(c => c.r < 0);
  const avgR = CORRELATIONS.reduce((sum, c) => sum + Math.abs(c.r), 0) / CORRELATIONS.length;
  const maxR = Math.max(...CORRELATIONS.map(c => Math.abs(c.r)));
  const minR = Math.min(...CORRELATIONS.map(c => Math.abs(c.r)));

  // Degree count per symptom
  const degrees = {};
  CORRELATIONS.forEach(({ from, to }) => {
    degrees[from] = (degrees[from] || 0) + 1;
    degrees[to] = (degrees[to] || 0) + 1;
  });

  const topConnected = Object.entries(degrees)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, deg]) => ({ id, degree: deg, ...SYMPTOMS[id] }));

  return {
    totalSymptoms: Object.keys(SYMPTOMS).length,
    totalCorrelations: CORRELATIONS.length,
    positiveCount: positiveCorr.length,
    negativeCount: negativeCorr.length,
    avgAbsR: avgR.toFixed(3),
    maxAbsR: maxR.toFixed(3),
    minAbsR: minR.toFixed(3),
    topConnected,
    source: '400-patient chart review (Pages 36-38)',
  };
}
