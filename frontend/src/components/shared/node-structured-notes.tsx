import { Eye, Brain, BookOpen, ShieldAlert, Target } from 'lucide-react'

interface NodeStructuredNotesProps {
  summary: string
  evidence?: string | null
  llmReasoning?: string | null
  llmResponse?: string | null
  ragAnalysis?: string | null
  guards?: string[]
  remaining?: string[] | null
}

/**
 * Renders structured breakdown of a pipeline node's reasoning.
 * Falls back to legacy "Examiner Notes" display for old DB entries
 * that don't have the v8.0 structured fields.
 *
 * Order: Summary → Evidence → LLM CoT (if present) → RAG Analysis → Guards → Remaining
 * When llmResponse exists, llmReasoning is skipped (it's extracted from the same response).
 */
export function NodeStructuredNotes({
  summary,
  evidence,
  llmReasoning,
  llmResponse,
  ragAnalysis,
  guards = [],
  remaining,
}: NodeStructuredNotesProps) {
  const hasStructured = evidence || llmReasoning || llmResponse || ragAnalysis || guards.length > 0 || (remaining && remaining.length > 0)

  const textStyle = { wordBreak: 'break-word' as const, overflowWrap: 'anywhere' as const }

  if (!hasStructured) {
    return (
      <div className="p-2.5 rounded-md bg-card border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Examiner Notes</p>
        <p className="text-[12px] leading-relaxed text-foreground/80 break-words" style={textStyle}>{summary}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Summary — always shown */}
      <div className="p-2.5 rounded-md bg-card border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Summary</p>
        <p className="text-[12px] leading-relaxed text-foreground/80 break-words" style={textStyle}>{summary}</p>
      </div>

      {/* Evidence — pure data/facts the node used */}
      {evidence && (
        <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700/50">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Eye className="w-3 h-3" />Evidence
          </p>
          <p className="text-[12px] leading-relaxed text-foreground/70 whitespace-pre-wrap break-words" style={textStyle}>{evidence}</p>
        </div>
      )}

      {/* LLM Chain of Thought — full raw LLM response (when present, replaces AI Reasoning) */}
      {llmResponse && (
        <div className="p-2.5 rounded-md bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/40">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" />LLM Chain of Thought <span className="font-normal text-violet-500 dark:text-violet-500 ml-1">(llama3.1 raw response)</span>
          </p>
          <div className="p-2 rounded bg-violet-100/50 dark:bg-violet-900/30 border border-violet-200/60 dark:border-violet-800/30">
            <p className="text-xs leading-relaxed text-violet-900/90 dark:text-violet-200/90 whitespace-pre-wrap break-words font-mono" style={textStyle}>
              {llmResponse}
            </p>
          </div>
        </div>
      )}

      {/* AI Reasoning — only shown when NO llmResponse (logic nodes that have reasoning text) */}
      {!llmResponse && llmReasoning && (
        <div className="p-2.5 rounded-md bg-violet-50/50 dark:bg-violet-950/10 border border-violet-200/60 dark:border-violet-800/30">
          <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Brain className="w-3 h-3" />AI Reasoning
          </p>
          <p className="text-[12px] leading-relaxed text-foreground/70 whitespace-pre-wrap break-words" style={textStyle}>{llmReasoning}</p>
        </div>
      )}

      {/* RAG Analysis — knowledge base matching results */}
      {ragAnalysis && (
        <div className="p-2.5 rounded-md bg-purple-50/50 dark:bg-purple-950/10 border border-purple-200/60 dark:border-purple-800/30">
          <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <BookOpen className="w-3 h-3" />RAG Analysis
          </p>
          <p className="text-[12px] leading-relaxed text-foreground/70 whitespace-pre-wrap break-words" style={textStyle}>{ragAnalysis}</p>
        </div>
      )}

      {/* Guards — triggered guardrails/penalties */}
      {guards.length > 0 && (
        <div className="p-2.5 rounded-md bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/60 dark:border-amber-800/30">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <ShieldAlert className="w-3 h-3" />Guards Triggered
          </p>
          <ul className="space-y-0.5">
            {guards.map((g, gi) => (
              <li key={gi} className="text-[12px] leading-relaxed text-amber-800/80 dark:text-amber-200/80 flex items-start gap-1">
                <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Remaining Topics — uncovered subtopics */}
      {remaining && remaining.length > 0 && (
        <div className="p-2.5 rounded-md bg-blue-50/50 dark:bg-blue-950/10 border border-blue-200/60 dark:border-blue-800/30">
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Target className="w-3 h-3" />Remaining Topics ({remaining.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {remaining.map((t, ti) => (
              <span key={ti} className="text-[11px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/30">{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
