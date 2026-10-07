import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Eye, MessageCircleQuestion, Flag, BookOpen, RotateCcw } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface DiagnosisCandidate {
  id: string;
  name: string;
  description: string;
  confidence: number;
  cues: string[];
  steps: string[];
}

export interface DiagnosisResult {
  candidates: DiagnosisCandidate[];
  notes?: string;
}

interface DiagnosisPanelProps {
  diagnosis: DiagnosisResult;
  selectedId: string;
  onSelect: (id: string) => void;
  onRerun: (extraContext: string) => void;
  onCorrection: (text: string) => Promise<boolean>;
  onSkip: () => void;
  isDiagnosing: boolean;
}

const LOW_CONFIDENCE_THRESHOLD = 60;

const QUICK_QUESTIONS: { q: string; options: string[] }[] = [
  { q: 'Which leaves were hit first?', options: ['Lower / older', 'Upper / new growth', 'All over'] },
  { q: 'How fast did it spread?', options: ['Within days', '1 to 2 weeks', 'Gradual, over weeks'] },
  { q: 'What do the marks look like?', options: ['Spots with rings', 'Plain yellowing', 'Brown or crispy edges'] },
];

export default function DiagnosisPanel({
  diagnosis,
  selectedId,
  onSelect,
  onRerun,
  onCorrection,
  onSkip,
  isDiagnosing,
}: DiagnosisPanelProps) {
  const [wrongCues, setWrongCues] = useState<Record<number, boolean>>({});
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionSent, setCorrectionSent] = useState(false);
  const [sending, setSending] = useState(false);

  // A fresh diagnosis resets the panel's interactive state.
  useEffect(() => {
    setWrongCues({});
    setShowAlternatives(false);
    setQuestionsOpen(false);
    setAnswers({});
    setCorrectionOpen(false);
    setCorrectionText('');
    setCorrectionSent(false);
  }, [diagnosis]);

  const candidates = diagnosis.candidates;
  const top = candidates[0];
  const isLow = !top || top.confidence < LOW_CONFIDENCE_THRESHOLD;
  const showList = isLow || showAlternatives;
  const wrongCueTexts = Object.keys(wrongCues)
    .filter(k => wrongCues[Number(k)])
    .map(k => top.cues[Number(k)])
    .filter(Boolean);

  const rerunWithCorrections = () => {
    if (wrongCueTexts.length === 0) return;
    onRerun(
      `The gardener says these observations were wrong and should not be relied on: "${wrongCueTexts.join('"; "')}". Re-rank your candidates without them.`
    );
  };

  const rerunWithAnswers = () => {
    const parts = QUICK_QUESTIONS.map((qq, i) =>
      answers[i] !== undefined ? `${qq.q} ${qq.options[answers[i]]}` : null
    ).filter(Boolean);
    if (parts.length === 0) return;
    onRerun(`The gardener answered follow-up questions: ${parts.join('; ')}. Use these to refine your ranking.`);
  };

  const sendCorrection = async () => {
    if (!correctionText.trim() || sending) return;
    setSending(true);
    const ok = await onCorrection(correctionText.trim());
    setSending(false);
    if (ok) setCorrectionSent(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 space-y-4"
    >
      {/* Confidence banner */}
      <div
        className={cn(
          'rounded-xl border p-3',
          isLow ? 'border-amber-600/40 bg-amber-500/10' : 'border-primary/40 bg-primary/10'
        )}
      >
        <span
          className={cn(
            'inline-block rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white mb-1.5',
            isLow ? 'bg-amber-700' : 'bg-primary text-on-primary'
          )}
        >
          {isLow ? 'Low confidence' : `Fairly confident · ${top.confidence}%`}
        </span>
        <p className="text-sm text-on-surface leading-snug">
          {isLow
            ? <>I&apos;m not sure yet — here are the <strong>3 closest matches</strong>. Nothing here is a diagnosis.</>
            : <><strong>{top.name}</strong> is the most likely cause.</>}
        </p>
        {diagnosis.notes && (
          <p className="text-xs text-on-surface-variant mt-1 italic">{diagnosis.notes}</p>
        )}
      </div>

      {/* What I noticed (transparency + audit) */}
      {top && top.cues.length > 0 && (
        <div className="rounded-xl border border-outline-variant/20 bg-surface p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1 flex items-center gap-1.5">
            <Eye size={12} /> What I noticed
          </p>
          {top.cues.map((cue, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5 border-t border-dashed border-outline-variant/30 first:border-t-0">
              <span className={cn('text-xs flex-1 leading-snug', wrongCues[i] && 'line-through text-on-surface-variant')}>
                {cue}
              </span>
              <button
                type="button"
                disabled={isDiagnosing}
                onClick={() => setWrongCues(prev => ({ ...prev, [i]: !prev[i] }))}
                className="text-[11px] font-semibold text-on-surface-variant underline shrink-0 disabled:opacity-50"
              >
                {wrongCues[i] ? 'undo' : 'not true'}
              </button>
            </div>
          ))}
          {wrongCueTexts.length > 0 && (
            <button
              type="button"
              disabled={isDiagnosing}
              onClick={rerunWithCorrections}
              className="mt-2 w-full py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RotateCcw size={14} /> Re-check with my corrections
            </button>
          )}
        </div>
      )}

      {/* Fairly-confident: top pick + first steps */}
      {!showList && top && (
        <div className="rounded-xl border border-outline-variant/20 bg-surface p-3 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">First steps</p>
          <ul className="space-y-1.5">
            {top.steps.slice(0, 3).map((s, i) => (
              <li key={i} className="text-xs text-on-surface-variant flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /> {s}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={isDiagnosing}
            onClick={() => { onSelect(top.id); }}
            className="w-full py-3 rounded-xl bg-primary text-on-primary text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Use this diagnosis
          </button>
          <button
            type="button"
            disabled={isDiagnosing}
            onClick={() => setShowAlternatives(true)}
            className="w-full py-2.5 rounded-xl border border-outline-variant/30 text-on-surface text-xs font-bold disabled:opacity-50"
          >
            I&apos;m not sure — show other options
          </button>
        </div>
      )}

      {/* Low-confidence shortlist (exactly 3) */}
      {showList && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-1">
            Possible causes
          </p>
          {candidates.slice(0, 3).map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={isDiagnosing}
              onClick={() => onSelect(c.id)}
              className={cn(
                'w-full text-left rounded-xl border p-3 bg-surface transition-all disabled:opacity-50',
                selectedId === c.id
                  ? 'border-primary ring-1 ring-primary'
                  : 'border-outline-variant/20 hover:border-primary/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-on-surface">{c.name}</p>
                <span className="text-xs font-black text-on-surface-variant shrink-0">{c.confidence}%</span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5 leading-snug">{c.description}</p>
              <div className="h-1.5 rounded-full bg-surface-container-high mt-2 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${c.confidence}%` }} />
              </div>
            </button>
          ))}
          <p className="text-[11px] text-on-surface-variant leading-snug px-1">
            Tap one to use it below. Picking one tells the app what you went with.
          </p>
        </div>
      )}

      {/* Fallback: quick questions */}
      <div>
        <button
          type="button"
          disabled={isDiagnosing}
          onClick={() => setQuestionsOpen(o => !o)}
          className="w-full py-2.5 rounded-xl border border-outline-variant/30 text-on-surface text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <MessageCircleQuestion size={14} />
          {questionsOpen ? 'Hide questions' : 'Rather answer 3 quick questions?'}
        </button>
        {questionsOpen && (
          <div className="mt-2 rounded-xl border border-outline-variant/20 bg-surface p-3 space-y-3">
            {QUICK_QUESTIONS.map((qq, qi) => (
              <div key={qi} className="border-t border-outline-variant/20 pt-2.5 first:border-t-0 first:pt-0">
                <p className="text-xs font-bold text-on-surface mb-1.5">{qi + 1}. {qq.q}</p>
                <div className="flex flex-wrap gap-1.5">
                  {qq.options.map((opt, oi) => (
                    <button
                      key={oi}
                      type="button"
                      disabled={isDiagnosing}
                      onClick={() => setAnswers(prev => ({ ...prev, [qi]: oi }))}
                      className={cn(
                        'text-[11px] font-semibold rounded-full px-3 py-1.5 border disabled:opacity-50',
                        answers[qi] === oi
                          ? 'bg-primary text-on-primary border-primary'
                          : 'border-outline-variant/30 text-on-surface'
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={isDiagnosing || Object.keys(answers).length === 0}
              onClick={rerunWithAnswers}
              className="w-full py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RotateCcw size={14} /> Apply answers & re-check
            </button>
          </div>
        )}
      </div>

      {/* Failure state: report a wrong call */}
      <div>
        <button
          type="button"
          onClick={() => setCorrectionOpen(o => !o)}
          className="w-full text-center text-xs font-bold text-primary py-1 flex items-center justify-center gap-1.5"
        >
          <Flag size={12} /> {correctionOpen ? 'Hide correction form' : 'None of these look right'}
        </button>
        {correctionOpen && !correctionSent && (
          <div className="mt-2 rounded-xl border border-outline-variant/20 bg-surface p-3">
            <p className="text-[11px] text-on-surface-variant leading-snug">
              Tell us what it actually was. This switches you to manual entry and logs the miss so future suggestions improve.
            </p>
            <textarea
              value={correctionText}
              onChange={(e) => setCorrectionText(e.target.value)}
              placeholder="e.g. Pretty sure it was spider mites, I saw webbing"
              className="w-full mt-2 p-3 text-xs bg-surface-container-high rounded-xl border-none focus:ring-2 focus:ring-primary min-h-[64px]"
            />
            <button
              type="button"
              disabled={!correctionText.trim() || isDiagnosing || sending}
              onClick={sendCorrection}
              className="mt-2 px-4 py-2 rounded-full bg-primary text-on-primary text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send correction'}
            </button>
          </div>
        )}
        {correctionSent && (
          <p className="mt-2 text-[11px] text-on-surface-variant bg-surface-container-high rounded-xl p-3 leading-snug">
            <AlertTriangle size={12} className="inline mr-1" />
            Correction logged — thanks. Describe the issue manually in the fields below.
          </p>
        )}
      </div>

      {/* User control: skip AI entirely */}
      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-xs font-bold text-on-surface-variant py-1 flex items-center justify-center gap-1.5"
      >
        <BookOpen size={12} /> Skip AI — browse the guide
      </button>

      {isDiagnosing && (
        <p className="text-center text-xs text-on-surface-variant flex items-center justify-center gap-2">
          <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Re-checking…
        </p>
      )}
    </motion.div>
  );
}
