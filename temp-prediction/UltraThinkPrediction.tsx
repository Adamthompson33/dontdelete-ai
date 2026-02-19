'use client';

import { useState, useMemo } from 'react';
import { predict } from '@/lib/prediction';
import type { MatchupPrediction, DomainSummary, RiskFlag, FactorScore } from '@/lib/prediction';
import type { Fighter, Matchup } from '@/types/fighter';

// ────────────────────────────────────────────────────────────────────
// PROPS
// ────────────────────────────────────────────────────────────────────

interface UltraThinkPredictionProps {
  matchup: Matchup;
  eventDate: string;
  eventCity?: string;
}

// ────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────

export default function UltraThinkPrediction({
  matchup,
  eventDate,
  eventCity,
}: UltraThinkPredictionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'zodiac' | 'numerology' | 'metrics' | 'timing'>('overview');

  const prediction = useMemo(
    () =>
      predict({
        fighter1: matchup.fighter1,
        fighter2: matchup.fighter2,
        eventDate,
        eventCity,
        isMainEvent: matchup.cardPosition === 'Main Event',
        isTitleFight: matchup.isTitle,
      }),
    [matchup, eventDate, eventCity]
  );

  const f1 = matchup.fighter1;
  const f2 = matchup.fighter2;

  return (
    <div className="mt-4">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full group"
      >
        <div
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#1a0a0a] via-[#0a0a1a] to-[#0a1a1a] border-2 border-[#FFD700]/30 hover:border-[#FFD700] transition-all"
          style={{ clipPath: 'polygon(0 0, 100% 0, 98% 100%, 2% 100%)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[#FFD700] text-lg">🧠</span>
            <span
              className="font-black tracking-[0.2em] text-[#FFD700] uppercase text-sm"
              style={{ fontFamily: 'Impact, sans-serif' }}
            >
              ULTRA THINK PREDICTION
            </span>
          </div>

          {/* Quick Probability Preview */}
          <div className="flex items-center gap-4">
            <ProbabilityChip
              name={f1.name.split(' ').pop() || f1.name}
              prob={prediction.fighter1WinProbability}
              color="red"
            />
            <span className="text-gray-600 text-xs font-bold">VS</span>
            <ProbabilityChip
              name={f2.name.split(' ').pop() || f2.name}
              prob={prediction.fighter2WinProbability}
              color="blue"
            />
            <span className="text-gray-500 text-xl transition-transform group-hover:text-[#FFD700]">
              {isExpanded ? '▲' : '▼'}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="border-2 border-t-0 border-[#FFD700]/20 bg-[#0a0a0a] overflow-hidden">
          {/* Verdict Banner */}
          <VerdictBanner
            narrative={prediction.narrative}
            confidence={prediction.confidence}
          />

          {/* Win Probability Bar */}
          <div className="px-6 py-4">
            <WinProbabilityBar
              fighter1={f1}
              fighter2={f2}
              f1Prob={prediction.fighter1WinProbability}
              f2Prob={prediction.fighter2WinProbability}
            />
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-800 px-4">
            {(['overview', 'zodiac', 'numerology', 'metrics', 'timing'] as const).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-black tracking-wider uppercase transition-all border-b-2 ${
                    activeTab === tab
                      ? 'text-[#FFD700] border-[#FFD700]'
                      : 'text-gray-500 border-transparent hover:text-gray-300'
                  }`}
                  style={{ fontFamily: 'Impact, sans-serif' }}
                >
                  {tab === 'overview' && '🎯 '}
                  {tab === 'zodiac' && '🐉 '}
                  {tab === 'numerology' && '🔢 '}
                  {tab === 'metrics' && '📊 '}
                  {tab === 'timing' && '⏱️ '}
                  {tab.toUpperCase()}
                </button>
              )
            )}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <OverviewTab
                prediction={prediction}
                fighter1={f1}
                fighter2={f2}
              />
            )}
            {activeTab !== 'overview' && (
              <DomainTab
                domain={activeTab}
                prediction={prediction}
                fighter1={f1}
                fighter2={f2}
              />
            )}
          </div>

          {/* Method + Upset Footer */}
          <div className="px-6 pb-6 flex gap-4">
            <div className="flex-1 p-3 bg-[#141414] border border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1" style={{ fontFamily: 'Impact, sans-serif' }}>
                Method Prediction
              </p>
              <p className="text-sm font-bold text-white">
                {prediction.narrative.methodPrediction}
              </p>
            </div>
            <div className="flex-1 p-3 bg-[#141414] border border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1" style={{ fontFamily: 'Impact, sans-serif' }}>
                Upset Angle
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">
                {prediction.narrative.upsetAngle}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS (Single Responsibility — each renders one piece)
// ────────────────────────────────────────────────────────────────────

function ProbabilityChip({
  name,
  prob,
  color,
}: {
  name: string;
  prob: number;
  color: 'red' | 'blue';
}) {
  const bgColor = color === 'red' ? 'bg-[#D20A0A]/20' : 'bg-[#00D4FF]/20';
  const textColor = color === 'red' ? 'text-[#ff4444]' : 'text-[#00D4FF]';
  const borderColor = color === 'red' ? 'border-[#D20A0A]/30' : 'border-[#00D4FF]/30';

  return (
    <div className={`px-3 py-1 ${bgColor} border ${borderColor} text-center`}>
      <span className={`text-xs font-bold ${textColor}`}>
        {name} {prob}%
      </span>
    </div>
  );
}

function VerdictBanner({
  narrative,
  confidence,
}: {
  narrative: MatchupPrediction['narrative'];
  confidence: number;
}) {
  return (
    <div className="px-6 py-4 bg-gradient-to-r from-[#1a0a00] via-[#0a0a0a] to-[#000a1a] border-b border-gray-800">
      <p
        className="text-sm font-black tracking-wider text-[#FFD700] mb-2"
        style={{ fontFamily: 'Impact, sans-serif' }}
      >
        {narrative.verdict}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">CONFIDENCE:</span>
        <div className="w-24 h-1.5 bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-[#FFD700] transition-all"
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-400">{(confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function WinProbabilityBar({
  fighter1,
  fighter2,
  f1Prob,
  f2Prob,
}: {
  fighter1: Fighter;
  fighter2: Fighter;
  f1Prob: number;
  f2Prob: number;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs font-bold text-[#ff4444]">
          {fighter1.name.split(' ').pop()} — {f1Prob}%
        </span>
        <span className="text-xs font-bold text-[#00D4FF]">
          {f2Prob}% — {fighter2.name.split(' ').pop()}
        </span>
      </div>
      <div className="h-6 flex overflow-hidden border-2 border-black">
        <div
          className="h-full bg-gradient-to-r from-[#D20A0A] to-[#ff3333] transition-all duration-700 flex items-center justify-end pr-2"
          style={{ width: `${f1Prob}%` }}
        >
          {f1Prob >= 30 && (
            <span className="text-[10px] font-black text-white/80">{f1Prob}%</span>
          )}
        </div>
        <div
          className="h-full bg-gradient-to-r from-[#00D4FF] to-[#0088FF] transition-all duration-700 flex items-center pl-2"
          style={{ width: `${f2Prob}%` }}
        >
          {f2Prob >= 30 && (
            <span className="text-[10px] font-black text-white/80">{f2Prob}%</span>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  prediction,
  fighter1,
  fighter2,
}: {
  prediction: MatchupPrediction;
  fighter1: Fighter;
  fighter2: Fighter;
}) {
  return (
    <div className="space-y-6">
      {/* Key Factors */}
      {prediction.narrative.keyFactors.length > 0 && (
        <div>
          <h4
            className="text-xs font-black tracking-[0.2em] text-gray-400 uppercase mb-3"
            style={{ fontFamily: 'Impact, sans-serif' }}
          >
            KEY FACTORS
          </h4>
          <div className="space-y-2">
            {prediction.narrative.keyFactors.map((factor, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm text-gray-300"
              >
                <span className="text-[#FFD700]">▸</span>
                {factor}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Domain Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {prediction.domainSummaries.map((summary) => (
          <DomainSummaryCard
            key={summary.domain}
            summary={summary}
            fighter1={fighter1}
            fighter2={fighter2}
          />
        ))}
      </div>

      {/* Risk Flags */}
      {prediction.risks.length > 0 && (
        <div>
          <h4
            className="text-xs font-black tracking-[0.2em] text-[#D20A0A] uppercase mb-3"
            style={{ fontFamily: 'Impact, sans-serif' }}
          >
            ⚠️ RISK FLAGS
          </h4>
          <div className="space-y-2">
            {prediction.risks.map((risk, i) => (
              <RiskFlagCard
                key={i}
                risk={risk}
                fighterName={
                  risk.fighterId === fighter1.id ? fighter1.name : fighter2.name
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DomainSummaryCard({
  summary,
  fighter1,
  fighter2,
}: {
  summary: DomainSummary;
  fighter1: Fighter;
  fighter2: Fighter;
}) {
  const advantage = summary.netAdvantage;
  const favoredColor =
    advantage > 0.5 ? 'border-l-[#D20A0A]' : advantage < -0.5 ? 'border-l-[#00D4FF]' : 'border-l-gray-600';
  const favoredName =
    advantage > 0.5
      ? fighter1.name
      : advantage < -0.5
        ? fighter2.name
        : 'Even';

  return (
    <div
      className={`p-3 bg-[#141414] border border-gray-800 border-l-4 ${favoredColor}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs font-black tracking-wider text-gray-300 uppercase"
          style={{ fontFamily: 'Impact, sans-serif' }}
        >
          {summary.label}
        </span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 ${
            advantage > 0.5
              ? 'bg-[#D20A0A]/20 text-[#ff4444]'
              : advantage < -0.5
                ? 'bg-[#00D4FF]/20 text-[#00D4FF]'
                : 'bg-gray-800 text-gray-400'
          }`}
        >
          {favoredName}
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
        {summary.headline}
      </p>
    </div>
  );
}

function DomainTab({
  domain,
  prediction,
  fighter1,
  fighter2,
}: {
  domain: string;
  prediction: MatchupPrediction;
  fighter1: Fighter;
  fighter2: Fighter;
}) {
  const domainScores = prediction.scores.filter((s) => s.domain === domain);
  const domainRisks = prediction.risks.filter((r) => {
    // Map risk categories to domains loosely
    if (domain === 'zodiac') return r.category === 'enemy-year';
    if (domain === 'numerology')
      return ['injury', 'karmic', 'cycle-end'].includes(r.category);
    return false;
  });

  return (
    <div className="space-y-4">
      {domainScores.length === 0 ? (
        <p className="text-gray-500 text-sm italic">
          No significant findings in this domain for this matchup.
        </p>
      ) : (
        <div className="space-y-3">
          {domainScores
            .sort(
              (a, b) =>
                Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight)
            )
            .map((score) => (
              <ScoreCard
                key={score.key}
                score={score}
                fighter1={fighter1}
                fighter2={fighter2}
              />
            ))}
        </div>
      )}

      {domainRisks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <h4 className="text-xs font-bold text-[#D20A0A] mb-2 uppercase tracking-wider">
            Domain Risks
          </h4>
          {domainRisks.map((risk, i) => (
            <RiskFlagCard
              key={i}
              risk={risk}
              fighterName={
                risk.fighterId === fighter1.id ? fighter1.name : fighter2.name
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreCard({
  score,
  fighter1,
  fighter2,
}: {
  score: FactorScore;
  fighter1: Fighter;
  fighter2: Fighter;
}) {
  const direction =
    score.value > 0
      ? fighter1.name
      : score.value < 0
        ? fighter2.name
        : 'Neutral';
  const directionColor =
    score.value > 0
      ? 'text-[#ff4444]'
      : score.value < 0
        ? 'text-[#00D4FF]'
        : 'text-gray-400';
  const severityColors: Record<string, string> = {
    info: 'border-l-gray-500',
    caution: 'border-l-[#FFD700]',
    warning: 'border-l-[#ff8800]',
    danger: 'border-l-[#D20A0A]',
  };
  const borderColor = severityColors[score.severity || 'info'];

  const impact = Math.abs(score.value * score.weight);
  const impactLabel =
    impact > 3 ? 'HIGH' : impact > 1.5 ? 'MED' : 'LOW';
  const impactColor =
    impact > 3
      ? 'text-[#FFD700]'
      : impact > 1.5
        ? 'text-gray-300'
        : 'text-gray-500';

  return (
    <div
      className={`p-3 bg-[#0f0f0f] border border-gray-800 border-l-4 ${borderColor}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-300">{score.label}</span>
          <span className={`text-[10px] font-bold ${impactColor}`}>
            [{impactLabel}]
          </span>
        </div>
        <span className={`text-[10px] font-bold ${directionColor}`}>
          → {direction}
          {score.value !== 0 && ` (${score.value > 0 ? '+' : ''}${score.value.toFixed(1)})`}
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{score.reasoning}</p>
    </div>
  );
}

function RiskFlagCard({
  risk,
  fighterName,
}: {
  risk: RiskFlag;
  fighterName: string;
}) {
  const severityColors: Record<string, { bg: string; text: string; border: string }> = {
    low: { bg: 'bg-gray-800/50', text: 'text-gray-400', border: 'border-gray-700' },
    medium: { bg: 'bg-[#FFD700]/10', text: 'text-[#FFD700]', border: 'border-[#FFD700]/30' },
    high: { bg: 'bg-[#ff8800]/10', text: 'text-[#ff8800]', border: 'border-[#ff8800]/30' },
    extreme: { bg: 'bg-[#D20A0A]/10', text: 'text-[#ff4444]', border: 'border-[#D20A0A]/30' },
  };

  const colors = severityColors[risk.severity] || severityColors.low;

  return (
    <div className={`p-2 ${colors.bg} border ${colors.border} flex items-start gap-2`}>
      <span className={`text-[10px] font-black uppercase tracking-wider ${colors.text} whitespace-nowrap mt-0.5`}>
        {risk.severity === 'extreme' ? '🚨' : risk.severity === 'high' ? '⚠️' : '⚡'} {fighterName}
      </span>
      <div>
        <span className={`text-xs font-bold ${colors.text}`}>{risk.label}</span>
        <p className="text-[11px] text-gray-400 mt-0.5">{risk.detail}</p>
      </div>
    </div>
  );
}
