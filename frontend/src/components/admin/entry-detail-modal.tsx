import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'
import { Entry, User, Topic, NodeResult, FinalDecisionResult } from '@/lib/types'
import { useAppSelector } from '@/lib/store/hooks'
import {
    Brain,
    Clock,
    FileSearch,
    Target,
    Scale,
    CheckCircle2,
    Flag,
    HelpCircle,
    Zap,
    Timer,
    XCircle,
    Loader2,
    ChevronDown,
    ChevronRight,
    Layers,
    Lightbulb,
    CircleDot,
    ArrowRight,
    Info,
    TrendingUp,
    ShieldCheck,
    ShieldAlert,
    Minus,
    Eye,
} from 'lucide-react'

interface EntryDetailModalProps {
    entry: Entry | null
    onClose: () => void
    onOverride?: (entry: Entry) => void
}

export function EntryDetailModal({
    entry,
    onClose,
    onOverride
}: EntryDetailModalProps) {
    const { users } = useAppSelector((state) => state.users)
    const { topics } = useAppSelector((state) => state.topics)
    const { entries } = useAppSelector((state) => state.entries)
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

    if (!entry) return null

    const entryUser = users.find((u: User) => u.id === entry.user)
    const topic = topics.find((t: Topic) => t.id === entry.topic)

    const toggleNode = (key: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    return (
        <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader>
                    <div className="flex justify-between items-start pr-8">
                        <div>
                            <DialogTitle className="text-xl">ENTRY (#{entry.id})</DialogTitle>
                            <DialogDescription className="text-sm">
                                {topic ? `Topic: ${topic.name}` : entry.project_name ? `Project: ${entry.project_name}` : 'No topic/project'}
                                {entry.intent && (
                                    <span className="ml-2 text-xs">
                                        ({entry.intent.replace('_', ' ')})
                                    </span>
                                )}
                            </DialogDescription>
                        </div>
                        <Badge variant={entry.status === 'flagged' ? 'destructive' : 'outline'} className="text-sm px-3 py-1">
                            {entry.status.toUpperCase()}
                        </Badge>
                    </div>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    <div className="md:col-span-2 space-y-6">
                        <div>
                            <h3 className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Learner Details</h3>
                            <div className="p-3 bg-muted/20 rounded border text-sm">
                                {entryUser?.name} (ID: {entryUser?.id})
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Detailed Description</h3>
                            <div className="p-4 bg-muted/30 rounded-lg text-sm leading-relaxed border whitespace-pre-wrap break-words overflow-wrap-break-word max-w-full">
                                {entry.learned_text}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-destructive mb-1 uppercase tracking-wider">Blockers Encountered</h3>
                            <div className={cn(
                                "p-4 rounded-lg text-sm border",
                                entry.blockers_text ? "bg-destructive/5 text-destructive border-destructive/20" : "bg-muted/10 text-muted-foreground border-border"
                            )}>
                                {(() => {
                                    const text = entry.blockers_text || '';
                                    if (!text) return <span className="italic opacity-70">None reported</span>;

                                    const parts = text.split(':');
                                    const potentialType = parts[0]?.trim();
                                    const description = parts.length > 1 ? parts.slice(1).join(':').trim() : text;
                                    const validTypes = ['Technical', 'Environmental', 'Personal', 'Resource', 'Other'];

                                    if (parts.length > 1 && validTypes.includes(potentialType)) {
                                        return (
                                            <div className="flex flex-col gap-2 min-w-0">
                                                <Badge variant="destructive" className="w-fit px-2 py-0.5 text-xs uppercase font-bold tracking-wider">{potentialType}</Badge>
                                                <span className="leading-relaxed text-foreground/80 break-words overflow-hidden" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{description}</span>
                                            </div>
                                        )
                                    }
                                    return <span className="break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{text}</span>;
                                })()}
                            </div>
                        </div>

                        {/* ═══════════════════════════════════════════════════════ */}
                        {/* AI BRAIN ANALYSIS — Graph Scorecard + Examiner Report */}
                        {/* ═══════════════════════════════════════════════════════ */}
                        <div className="pt-4 border-t">
                            {/* ── Header ── */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
                                        <Brain className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-foreground tracking-tight">AI Brain Analysis</h3>
                                        <p className="text-xs text-muted-foreground">5-Node v6.0 Dual Pipeline &middot; {entry.intent?.replace('_', ' ') || 'deep learning'}</p>
                                    </div>
                                </div>
                                {entry.admin_override ? (
                                    <Badge className="text-xs font-bold uppercase px-3 py-1 border-0 shadow-sm bg-blue-500/15 text-blue-700 dark:text-blue-400">
                                        <Zap className="w-3.5 h-3.5 mr-1.5" />OVERRIDDEN
                                    </Badge>
                                ) : entry.ai_decision && (
                                    <Badge className={cn(
                                        "text-xs font-bold uppercase px-3 py-1 border-0 shadow-sm",
                                        entry.ai_decision === 'approve' && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                                        entry.ai_decision === 'flag' && "bg-red-500/15 text-red-700 dark:text-red-400",
                                        entry.ai_decision === 'pending' && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                                    )}>
                                        {entry.ai_decision === 'approve' && <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                                        {entry.ai_decision === 'flag' && <Flag className="w-3.5 h-3.5 mr-1.5" />}
                                        {entry.ai_decision === 'pending' && <HelpCircle className="w-3.5 h-3.5 mr-1.5" />}
                                        {entry.ai_decision}
                                    </Badge>
                                )}
                            </div>

                            {/* ── Confidence Gauge ── */}
                            {entry.ai_confidence != null && Number(entry.ai_confidence) >= 0 && (() => {
                                const confidence = Number(entry.ai_confidence)
                                return (
                                    <div className="mb-4 p-3 rounded-lg bg-muted/30 border">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-medium text-muted-foreground">Confidence Score</span>
                                            <span className={cn("text-sm font-bold tabular-nums",
                                                confidence >= 85 ? "text-emerald-600" : confidence >= 70 ? "text-amber-600" : "text-red-600"
                                            )}>{confidence.toFixed(1)}%</span>
                                        </div>
                                        <div className="relative h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                            <div className={cn("h-full rounded-full transition-all duration-700 ease-out",
                                                confidence >= 85 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" :
                                                    confidence >= 70 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                                                        "bg-gradient-to-r from-red-400 to-red-500"
                                            )} style={{ width: `${Math.min(confidence, 100)}%` }} />
                                            <div className="absolute top-0 left-[70%] w-px h-full bg-foreground/20" title="Flag threshold" />
                                            <div className="absolute top-0 left-[85%] w-px h-full bg-foreground/20" title="Approve threshold" />
                                        </div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-xs text-muted-foreground">0%</span>
                                            <div className="flex gap-3">
                                                <span className="text-xs text-red-500/70">Pending &lt;70</span>
                                                <span className="text-xs text-amber-500/70">Flag 70-84</span>
                                                <span className="text-xs text-emerald-500/70">Approve 85+</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">100%</span>
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* ── Main Pipeline Content ── */}
                            {entry.ai_status === 'timeout' ? (
                                <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-amber-50/50 dark:bg-amber-950/10">
                                    <Timer className="w-8 h-8 text-amber-600" />
                                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Analysis Timed Out</p>
                                    <p className="text-xs text-muted-foreground">Pipeline exceeded the 25s soft limit. Entry flagged for manual review.</p>
                                </div>
                            ) : entry.ai_status === 'error' ? (
                                <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-red-50/50 dark:bg-red-950/10">
                                    <XCircle className="w-8 h-8 text-red-600" />
                                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Analysis Error</p>
                                    <p className="text-xs text-muted-foreground">AI pipeline failed. Please review manually.</p>
                                </div>
                            ) : entry.ai_chain_of_thought && Object.keys(entry.ai_chain_of_thought).length > 0 ? (() => {
                                const cot = entry.ai_chain_of_thought as Record<string, any>
                                const resolveNode = (key: string) => cot[key] ?? (key === 'final_decision' ? cot['final_reasoning'] : undefined)
                                const isStructured = (val: any): val is NodeResult => val && typeof val === 'object' && 'summary' in val && 'path' in val

                                /* ── Legacy string parser: extract score/path from old plain-text format ── */
                                const parseLegacy = (key: string, raw: string) => {
                                    let score: number | null = null
                                    let path: string = 'logic'
                                    const text = String(raw)

                                    // Extract score
                                    const scoreMatch = text.match(/Score:\s*(\d+\.?\d*)/i)
                                    if (scoreMatch) {
                                        let s = parseFloat(scoreMatch[1])
                                        if (s <= 1.0) s = Math.round(s * 100)
                                        score = Math.round(Math.min(s, 100))
                                    }
                                    // Relevance: "Relevance: 0.10"
                                    if (score === null && key === 'progress_analysis') {
                                        const rm = text.match(/(?:Relevance|Progress|Confidence):\s*(\d+\.?\d*)/i)
                                        if (rm) { let s = parseFloat(rm[1]); score = s <= 1 ? Math.round(s * 100) : Math.round(Math.min(s, 100)) }
                                    }
                                    // Final decision: "Confidence: 13.6%"
                                    if (key === 'final_decision') {
                                        const cm = text.match(/Confidence:\s*(\d+\.?\d*)%/i)
                                        if (cm) score = Math.round(parseFloat(cm[1]))
                                        // Extract per-dimension scores
                                        const tm = text.match(/Time:\s*(\d+\.?\d*)%?/); const qm = text.match(/Quality:\s*(\d+\.?\d*)%?/); const rm2 = text.match(/Relevance:\s*(\d+\.?\d*)%?/)
                                        if (tm && qm && rm2) {
                                            const parsedScores = { time: Math.round(parseFloat(tm[1])), quality: Math.round(parseFloat(qm[1])), relevance: Math.round(parseFloat(rm2[1])) }
                                            const wm = text.match(/T(\d+)%.*Q(\d+)%.*R(\d+)%/)
                                            const parsedWeights = wm ? { time: parseInt(wm[1]), quality: parseInt(wm[2]), relevance: parseInt(wm[3]) } : null
                                            const bm = text.match(/Blocker\s*boost:\s*\+?(\d+\.?\d*)%?/i); const pm = text.match(/PENALTY:\s*-?(\d+\.?\d*)%/i)
                                            const dm = text.match(/Decision:\s*(\w+)/i)
                                            return {
                                                score, path,
                                                finalData: { scores: parsedScores, weights: parsedWeights, blocker_boost: bm ? parseFloat(bm[1]) : 0, penalty: pm ? `Smart penalty: -${pm[1]}%` : '', reason: '', decision: dm ? dm[1].toLowerCase() : '' }
                                            }
                                        }
                                    }
                                    // Detect path
                                    if (/circuit\s*breaker|forced\s*logic|skipped\s*AI/i.test(text)) path = 'breaker'
                                    else if (/\bLLM\b.*invok|AI\s*(?:score|analys|legitimacy)/i.test(text) && !/breaker|fallback/i.test(text)) path = 'ai'

                                    return { score, path, finalData: null }
                                }

                                const NODE_DEFS = [
                                    { key: 'context_analysis', label: 'Context Gatherer', shortLabel: 'Context', desc: 'Gathers all prior entries, copy-paste detection, progress coherence, blockers', icon: <Layers className="w-3.5 h-3.5" />, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/40', ring: 'ring-slate-300 dark:ring-slate-700', accent: 'border-l-slate-400' },
                                    { key: 'time_analysis', label: 'Time Reasoner', shortLabel: 'Time', desc: 'LLM assesses if hours are reasonable given context, experience & blockers', icon: <Clock className="w-3.5 h-3.5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40', ring: 'ring-blue-300 dark:ring-blue-700', accent: 'border-l-blue-400' },
                                    { key: 'content_analysis', label: 'Content Validator', shortLabel: 'Content', desc: 'LLM validates genuine learning/work, topic match, depth vs hours', icon: <FileSearch className="w-3.5 h-3.5" />, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/40', ring: 'ring-cyan-300 dark:ring-cyan-700', accent: 'border-l-cyan-400' },
                                    { key: 'progress_analysis', label: 'Progress Analyzer', shortLabel: 'Progress', desc: 'LLM checks progress coherence, completion justification, pace', icon: <Target className="w-3.5 h-3.5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40', ring: 'ring-emerald-300 dark:ring-emerald-700', accent: 'border-l-emerald-400' },
                                    { key: 'final_decision', label: 'Verdict Agent', shortLabel: 'Verdict', desc: 'LLM synthesizes all node findings into final connected decision', icon: <Scale className="w-3.5 h-3.5" />, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/40', ring: 'ring-rose-300 dark:ring-rose-700', accent: 'border-l-rose-500' },
                                ]

                                const activeNodes = NODE_DEFS.filter(n => resolveNode(n.key)).map((n, idx) => {
                                    const raw = resolveNode(n.key)
                                    const s = isStructured(raw)
                                    let score: number | null = null; let path: string | null = null; let legacyFinal: any = null; let pathReason: string | null = null; let llmResponse: string | null = null
                                    if (s) {
                                        score = raw.score ?? null; path = raw.path; pathReason = (raw as any).path_reason || null; llmResponse = (raw as any).llm_raw_response || null
                                    } else {
                                        const parsed = parseLegacy(n.key, String(raw))
                                        score = parsed.score; path = parsed.path; legacyFinal = parsed.finalData
                                    }
                                    const summary = s ? raw.summary : String(raw)
                                    const details = s ? (typeof raw.details === 'string' ? raw.details : raw.details ? JSON.stringify(raw.details, null, 2) : null) : null
                                    return { ...n, idx, raw, structured: s, score, path, summary, details, legacyFinal, pathReason, llmResponse }
                                })

                                const gradeFor = (score: number | null) => {
                                    if (score === null) return { label: '—', color: 'text-muted-foreground', bg: 'bg-muted/50' }
                                    if (score >= 90) return { label: 'A+', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' }
                                    if (score >= 80) return { label: 'A', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' }
                                    if (score >= 70) return { label: 'B', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' }
                                    if (score >= 50) return { label: 'C', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' }
                                    return { label: 'F', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' }
                                }

                                const pathMeta = (p: string | null) => {
                                    switch (p) {
                                        case 'logic': return { label: 'Logic', icon: <ShieldCheck className="w-3 h-3" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', explain: 'Pure rules & math — no AI model called.' }
                                        case 'ai': return { label: 'AI Model', icon: <Brain className="w-3 h-3" />, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800', explain: 'Ollama LLM (llama3.1) invoked for analysis.' }
                                        case 'breaker': return { label: 'Breaker', icon: <Timer className="w-3 h-3" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', explain: 'Circuit breaker triggered — AI too slow, fell back to logic.' }
                                        case 'skipped': return { label: 'Skipped', icon: <Minus className="w-3 h-3" />, color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-muted', explain: 'Node skipped — not applicable for this entry.' }
                                        default: return null
                                    }
                                }

                                const passCount = activeNodes.filter(n => n.score !== null && n.score >= 50).length
                                const failCount = activeNodes.filter(n => n.score !== null && n.score < 50).length
                                const breakerCount = activeNodes.filter(n => n.path === 'breaker').length

                                return (
                                    <div className="space-y-3">
                                        {/* ═══ GRAPH SCORECARD ═══ */}
                                        <div className="rounded-xl border overflow-hidden">
                                            <div className="px-3 py-2.5 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-b flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <TrendingUp className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                                                    <span className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Examiner Scorecard</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    {passCount > 0 && <span className="text-emerald-600 font-semibold">{passCount} Passed</span>}
                                                    {failCount > 0 && <span className="text-red-600 font-semibold">{failCount} Failed</span>}
                                                    {breakerCount > 0 && <span className="text-amber-600 font-semibold">{breakerCount} Breaker</span>}
                                                </div>
                                            </div>

                                            {/* ── Mini Flow Graph ── */}
                                            <div className="px-4 py-3 bg-muted/10">
                                                <div className="flex items-center justify-between">
                                                    {activeNodes.map((n, i) => {
                                                        const g = gradeFor(n.score)
                                                        const scoreColor = n.score === null ? 'border-muted bg-muted/30' :
                                                            n.score >= 80 ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' :
                                                                n.score >= 50 ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' :
                                                                    'border-red-400 bg-red-50 dark:bg-red-950/30'
                                                        return (
                                                            <React.Fragment key={n.key}>
                                                                {i > 0 && (
                                                                    <div className="flex-1 flex items-center px-0.5">
                                                                        <div className="h-px flex-1 bg-border" />
                                                                        <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                                                    </div>
                                                                )}
                                                                <div className="flex flex-col items-center gap-1 min-w-0">
                                                                    <div className={cn("w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all", scoreColor)}>
                                                                        {n.score !== null ? (
                                                                            <span className={cn("text-xs font-bold tabular-nums", g.color)}>{n.score}</span>
                                                                        ) : (
                                                                            <span className={cn("", n.color)}>{n.icon}</span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-[48px]">{n.shortLabel}</span>
                                                                    {n.score !== null && (
                                                                        <span className={cn("text-xs font-bold px-1 rounded", g.bg, g.color)}>{g.label}</span>
                                                                    )}
                                                                </div>
                                                            </React.Fragment>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ═══ DETAILED EXAMINER REPORT ═══ */}
                                        <div className="rounded-xl border overflow-hidden bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-900/50 dark:to-slate-950">
                                            <div className="px-3 py-2 border-b bg-muted/20">
                                                <div className="flex items-center gap-2">
                                                    <CircleDot className="w-3.5 h-3.5 text-indigo-500" />
                                                    <span className="text-xs font-bold uppercase tracking-wider text-foreground/80">Detailed Examiner Report</span>
                                                    <span className="text-xs text-muted-foreground ml-auto">Click to expand</span>
                                                </div>
                                            </div>

                                            <div className="relative">
                                                {/* Vertical connecting line */}
                                                <div className="absolute left-[23px] top-4 bottom-4 w-px bg-gradient-to-b from-violet-300 via-indigo-300 to-rose-300 dark:from-violet-700 dark:via-indigo-700 dark:to-rose-700" />

                                                {activeNodes.map((n, i) => {
                                                    const isExpanded = expandedNodes.has(n.key)
                                                    const isFinal = n.key === 'final_decision'
                                                    const pm = pathMeta(n.path)
                                                    const g = gradeFor(n.score)
                                                    const passed = n.score === null || n.score >= 50
                                                    // For final decision: get structured or legacy parsed data
                                                    const fd = isFinal ? (n.structured ? n.raw as FinalDecisionResult : null) : null
                                                    const lfd = isFinal ? n.legacyFinal : null

                                                    return (
                                                        <div key={n.key} className="relative pl-5 pr-3 py-2">
                                                            {/* Node circle on the line */}
                                                            <div className={cn(
                                                                "absolute left-3 top-[18px] w-[21px] h-[21px] rounded-full border-2 flex items-center justify-center z-10",
                                                                passed ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40" : "border-red-400 bg-red-50 dark:bg-red-950/40",
                                                                n.score === null && "border-slate-300 bg-slate-50 dark:bg-slate-800 dark:border-slate-600"
                                                            )}>
                                                                <span className="text-xs font-bold tabular-nums text-muted-foreground">{n.idx}</span>
                                                            </div>

                                                            {/* Card */}
                                                            <div
                                                                className={cn(
                                                                    "ml-5 rounded-lg border-l-[3px] border transition-all cursor-pointer select-none",
                                                                    n.accent,
                                                                    isExpanded ? "ring-1 shadow-sm bg-card" : "hover:bg-muted/20",
                                                                    isExpanded && n.ring,
                                                                )}
                                                                onClick={() => toggleNode(n.key)}
                                                            >
                                                                {/* Card header */}
                                                                <div className="flex items-center gap-2.5 p-2.5">
                                                                    <div className={cn("p-1 rounded-md shrink-0", n.bg)}>
                                                                        <span className={n.color}>{n.icon}</span>
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="text-xs font-bold text-foreground">{n.label}</span>
                                                                            {pm && (
                                                                                <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0 rounded border text-xs font-semibold", pm.bg, pm.color, pm.border)}>
                                                                                    {pm.icon}{pm.label}
                                                                                </span>
                                                                            )}
                                                                            {n.score !== null && (
                                                                                <span className={cn("px-1.5 py-0 rounded text-xs font-bold", g.bg, g.color)}>
                                                                                    {n.score}% ({g.label})
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {/* Score bar */}
                                                                        {n.score !== null && (
                                                                            <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                                                <div className={cn("h-full rounded-full transition-all duration-500",
                                                                                    n.score >= 80 ? "bg-emerald-500" : n.score >= 50 ? "bg-amber-500" : "bg-red-500"
                                                                                )} style={{ width: `${Math.min(n.score, 100)}%` }} />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        {passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <ShieldAlert className="w-3.5 h-3.5 text-red-500" />}
                                                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                                                                    </div>
                                                                </div>

                                                                {/* Expanded: Examiner Details */}
                                                                {isExpanded && (
                                                                    <div className="px-3 pb-3 space-y-2 border-t bg-muted/5">
                                                                        <div className="pt-2" />

                                                                        {/* What this node does */}
                                                                        <p className="text-xs text-muted-foreground italic">{n.desc}</p>

                                                                        {/* Path explanation — prefer backend path_reason over generic */}
                                                                        {pm && (
                                                                            <div className={cn("flex items-start gap-2 p-2 rounded-md border text-xs", pm.bg, pm.border)}>
                                                                                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                                                <span>{n.pathReason || (<><strong>Path: {pm.label}</strong> — {pm.explain}</>)}</span>
                                                                            </div>
                                                                        )}

                                                                        {/* AI Chain of Thought — full LLM response like LangSmith */}
                                                                        {n.llmResponse && (
                                                                            <div className="p-2.5 rounded-md bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/40">
                                                                                <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                                                                    <Brain className="w-3.5 h-3.5" />LLM Chain of Thought <span className="font-normal text-violet-500 dark:text-violet-500 ml-1">(llama3.1 raw response)</span>
                                                                                </p>
                                                                                <div className="p-2 rounded bg-violet-100/50 dark:bg-violet-900/30 border border-violet-200/60 dark:border-violet-800/30">
                                                                                    <p className="text-xs leading-relaxed text-violet-900/90 dark:text-violet-200/90 whitespace-pre-wrap break-words font-mono" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                                                        {n.llmResponse}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Examiner notes (summary) */}
                                                                        <div className="p-2.5 rounded-md bg-card border">
                                                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Examiner Notes</p>
                                                                            <p className="text-[12px] leading-relaxed text-foreground/80 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                                                {n.summary}
                                                                            </p>
                                                                        </div>

                                                                        {/* Final Decision: dimension breakdown (structured) */}
                                                                        {isFinal && fd && fd.scores && (
                                                                            <div className="space-y-2">
                                                                                {fd.reason && (
                                                                                    <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
                                                                                        <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-0.5"><Lightbulb className="w-3 h-3 inline mr-1 -mt-0.5" />Why this decision</p>
                                                                                        <p className="text-[12px] leading-relaxed text-rose-900/80 dark:text-rose-200/80 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{fd.reason}</p>
                                                                                    </div>
                                                                                )}
                                                                                {fd.node_verdicts && (
                                                                                    <div className="flex gap-2">
                                                                                        {Object.entries(fd.node_verdicts).map(([k, v]) => {
                                                                                            const vLabel: Record<string, string> = { time: 'Time', content: 'Content', progress: 'Progress' }
                                                                                            const vColor = v === 'PASS' ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-800' : v === 'FAIL' ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/20 dark:border-red-800' : 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/20 dark:border-amber-800'
                                                                                            return <div key={k} className={cn('px-2 py-0.5 rounded border text-xs font-semibold', vColor)}>{vLabel[k] || k}: {v}</div>
                                                                                        })}
                                                                                    </div>
                                                                                )}
                                                                                <div className="grid grid-cols-3 gap-2">
                                                                                    {Object.entries(fd.scores).map(([dim, val]) => {
                                                                                        const dimLabel: Record<string, string> = { time: 'Time', quality: 'Content', relevance: 'Progress' }
                                                                                        const dg = gradeFor(val)
                                                                                        return (
                                                                                            <div key={dim} className="p-2 rounded-lg border bg-card text-center space-y-0.5">
                                                                                                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{dimLabel[dim] || dim}</p>
                                                                                                <p className={cn("text-base font-bold tabular-nums", dg.color)}>{val}%</p>
                                                                                                <div className="h-1 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", val >= 80 ? "bg-emerald-500" : val >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(val, 100)}%` }} /></div>
                                                                                            </div>
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {fd.penalty && fd.penalty !== 'none' && fd.penalty !== '' && <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded border border-red-200 dark:border-red-800"><XCircle className="w-3 h-3" />{fd.penalty}</div>}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Final Decision: legacy parsed breakdown */}
                                                                        {isFinal && !fd && lfd && lfd.scores && (
                                                                            <div className="space-y-2">
                                                                                <div className="grid grid-cols-3 gap-2">
                                                                                    {Object.entries(lfd.scores as Record<string, number>).map(([dim, val]) => {
                                                                                        const dimLabel: Record<string, string> = { time: 'Time', quality: 'Content', relevance: 'Progress' }
                                                                                        const dg = gradeFor(val)
                                                                                        return (
                                                                                            <div key={dim} className="p-2 rounded-lg border bg-card text-center space-y-0.5">
                                                                                                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{dimLabel[dim] || dim}</p>
                                                                                                <p className={cn("text-base font-bold tabular-nums", dg.color)}>{val}%</p>
                                                                                                <div className="h-1 rounded-full bg-muted overflow-hidden"><div className={cn("h-full rounded-full", val >= 80 ? "bg-emerald-500" : val >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(val, 100)}%` }} /></div>
                                                                                            </div>
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {lfd.penalty && <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded border border-red-200 dark:border-red-800"><XCircle className="w-3 h-3" />{lfd.penalty}</div>}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Full details (structured only) */}
                                                                        {n.details && (
                                                                            <div className="p-2 rounded-md bg-muted/30 border">
                                                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Full Details</p>
                                                                                <div className="text-xs leading-relaxed text-foreground/70 whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                                                    {n.details}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {/* Pipeline end marker */}
                                            <div className="flex justify-center py-2 border-t bg-muted/5">
                                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border">
                                                    <CircleDot className="w-3 h-3 text-muted-foreground" />
                                                    <span className="text-xs font-medium text-muted-foreground">Pipeline Complete</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })() : entry.ai_status === 'pending' ? (
                                <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-indigo-50/50 dark:bg-indigo-950/10">
                                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                    <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400">Analyzing Entry...</p>
                                    <p className="text-xs text-muted-foreground">Running through 6-node AI pipeline.</p>
                                </div>
                            ) : (
                                <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center">
                                    <Brain className="w-8 h-8 text-muted-foreground" />
                                    <p className="text-sm text-muted-foreground">Not analyzed yet.</p>
                                </div>
                            )}

                            {/* Override button */}
                            <div className="mt-3">
                                <Button variant="outline" size="sm"
                                    className="w-full border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/50 font-medium"
                                    onClick={() => onOverride && onOverride(entry)}>
                                    <Zap className="w-3.5 h-3.5 mr-1.5" />Override Status
                                </Button>
                            </div>

                            {/* Override Info */}
                            {entry.admin_override && (
                                <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-start gap-2">
                                        <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">Admin Override</p>
                                            {entry.admin && <p className="text-xs text-blue-700 dark:text-blue-300">By: {entry.admin.full_name || entry.admin.email}</p>}
                                            {entry.override_at && <p className="text-xs text-blue-600 dark:text-blue-400">{new Date(entry.override_at).toLocaleString()}</p>}
                                            {entry.override_reason && <p className="text-xs text-blue-700 dark:text-blue-300 mt-1"><span className="font-medium">Reason:</span> {entry.override_reason.replace(/_/g, ' ')}</p>}
                                            {entry.override_comment && <p className="text-xs text-blue-700 dark:text-blue-300 italic">"{entry.override_comment}"</p>}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* ═══ How AI Decides — Brain Workflow ═══ */}
                        <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
                            <button
                                onClick={() => setExpandedNodes(prev => {
                                    const next = new Set(prev)
                                    next.has('brain-card') ? next.delete('brain-card') : next.add('brain-card')
                                    return next
                                })}
                                className="w-full px-4 py-3 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-b flex items-center justify-between"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="p-1 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600">
                                        <Brain className="w-3 h-3 text-white" />
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">How AI Decides</span>
                                </div>
                                {expandedNodes.has('brain-card') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                            {expandedNodes.has('brain-card') && (
                                <div className="p-3 space-y-2.5">
                                    <p className="text-xs text-muted-foreground">6-Node LangGraph Pipeline v4.1 — Every entry passes through this</p>
                                    {[
                                        {
                                            num: 0, label: 'Context Builder', mode: 'logic' as const,
                                            what: 'Researches the learner before scoring begins',
                                            checks: ['Prior entries on this topic/project', 'Copy-paste detection (Jaccard similarity)', 'Progress % coherence check', 'Learner velocity & avg hours'],
                                        },
                                        {
                                            num: 1, label: 'Time Validation', mode: 'hybrid' as const,
                                            what: 'Math baseline + AI contextual check',
                                            checks: ['Expected hours = benchmark × difficulty × experience × intent × velocity', 'AI reads description depth to validate time claim', 'Blended 50% math + 50% AI score'],
                                        },
                                        {
                                            num: 2, label: 'Quality Analysis', mode: 'ai' as const,
                                            what: 'AI evaluates substance & genuine understanding',
                                            checks: ['Does it name specific concepts, tools, techniques?', 'Depth matches hours claimed?', 'Risk-adaptive: low/medium/high risk prompts', 'Copy-paste penalty applied after AI scoring'],
                                        },
                                        {
                                            num: 3, label: 'Topic Relevance', mode: 'ai' as const,
                                            what: 'AI checks content matches assigned topic/project',
                                            checks: ['For topics: is this actually about the topic?', 'For projects: matches project description?', 'Global Wisdom: learns from admin corrections'],
                                        },
                                        {
                                            num: 4, label: 'Blocker Analysis', mode: 'conditional' as const,
                                            what: 'Validates blockers & applies time boost',
                                            checks: ['Known categories → auto boost by detail level', 'Unknown/other → AI judges legitimacy', 'Legitimate blocker = time boost for the entry'],
                                        },
                                        {
                                            num: 5, label: 'Weighted Decision', mode: 'logic' as const,
                                            what: 'Combines all scores with intent-specific weights',
                                            checks: ['Score = (Time × Wt) + (Quality × Wt) + (Relevance × Wt)', 'Weights change per intent (see below)', '+ Blocker boost added on top'],
                                        },
                                    ].map((node) => (
                                        <div key={node.num} className={cn(
                                            "p-2 rounded-lg border",
                                            node.mode === 'ai' ? "bg-violet-50/50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-800/40" :
                                                node.mode === 'hybrid' ? "bg-indigo-50/50 dark:bg-indigo-950/10 border-indigo-200 dark:border-indigo-800/40" :
                                                    node.mode === 'conditional' ? "bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800/40" :
                                                        "bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/40"
                                        )}>
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full border flex items-center justify-center text-xs font-bold shrink-0",
                                                    node.mode === 'ai' ? "border-violet-400 bg-violet-100 dark:bg-violet-900/40 text-violet-600" :
                                                        node.mode === 'hybrid' ? "border-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600" :
                                                            node.mode === 'conditional' ? "border-amber-400 bg-amber-100 dark:bg-amber-900/40 text-amber-600" :
                                                                "border-slate-300 bg-slate-100 dark:bg-slate-800 text-slate-500"
                                                )}>{node.num}</div>
                                                <span className="text-xs font-bold text-foreground">{node.label}</span>
                                                {node.mode === 'ai' && <span className="text-xs px-1 rounded bg-violet-200 dark:bg-violet-800/40 text-violet-700 dark:text-violet-300 font-bold">AI</span>}
                                                {node.mode === 'hybrid' && <span className="text-xs px-1 rounded bg-indigo-200 dark:bg-indigo-800/40 text-indigo-700 dark:text-indigo-300 font-bold">HYBRID</span>}
                                                {node.mode === 'conditional' && <span className="text-xs px-1 rounded bg-amber-200 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 font-bold">COND</span>}
                                            </div>
                                            <p className="text-xs text-muted-foreground italic mb-1">{node.what}</p>
                                            <div className="space-y-0.5">
                                                {node.checks.map((c, ci) => (
                                                    <div key={ci} className="flex items-start gap-1">
                                                        <span className="text-xs text-muted-foreground mt-0.5">•</span>
                                                        <span className="text-xs text-foreground/70 leading-tight">{c}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Decision tiers */}
                                    <div className="border-t pt-2 space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Decision Tiers</p>
                                        <div className="flex gap-1.5">
                                            <div className="flex-1 p-1.5 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-center">
                                                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">≥ 85%</p>
                                                <p className="text-xs text-emerald-600 dark:text-emerald-500 font-semibold">APPROVE</p>
                                            </div>
                                            <div className="flex-1 p-1.5 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-center">
                                                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">70-84%</p>
                                                <p className="text-xs text-amber-600 dark:text-amber-500 font-semibold">FLAG</p>
                                            </div>
                                            <div className="flex-1 p-1.5 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-center">
                                                <p className="text-xs font-bold text-red-700 dark:text-red-400">&lt; 70%</p>
                                                <p className="text-xs text-red-600 dark:text-red-500 font-semibold">PENDING</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Weights by intent */}
                                    <div className="border-t pt-2 space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Weights by Intent</p>
                                        <div className="grid grid-cols-2 gap-1">
                                            {[
                                                { intent: 'L&D Tasks', w: 'T40 Q40 R20' },
                                                { intent: 'SBU Tasks', w: 'T50 Q30 R20' },
                                            ].map(({ intent, w }) => (
                                                <div key={intent} className="p-1 rounded border bg-muted/20 text-center">
                                                    <p className="text-xs font-semibold text-foreground/80">{intent}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{w}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Safety nets */}
                                    <div className="border-t pt-2 space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Safety Nets</p>
                                        <div className="space-y-0.5">
                                            {[
                                                { icon: <Timer className="w-2.5 h-2.5 text-amber-500" />, text: 'Circuit breakers skip AI if pipeline exceeds 23s' },
                                                { icon: <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" />, text: 'Logic fallback if any LLM call fails' },
                                                { icon: <Brain className="w-2.5 h-2.5 text-violet-500" />, text: 'Global Wisdom: AI learns from admin corrections' },
                                                { icon: <Eye className="w-2.5 h-2.5 text-blue-500" />, text: 'Full LLM chain-of-thought stored for traceability' },
                                            ].map((item, i) => (
                                                <div key={i} className="flex items-center gap-1.5 text-xs">
                                                    {item.icon}
                                                    <span className="text-foreground/70">{item.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="rounded-lg border bg-card p-4 space-y-4">
                            <h3 className="text-sm font-bold border-b pb-2">Entry Metadata</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Date</span>
                                    <span className="font-medium">{entry.date}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Time Spent</span>
                                    <span className="font-bold">{entry.hours}h</span>
                                </div>
                                {topic && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Benchmark</span>
                                        <span className="font-medium">{topic.benchmark_hours}h expected</span>
                                    </div>
                                )}
                                {topic && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Difficulty</span>
                                        <span className="font-medium">{'★'.repeat(topic.difficulty)}{'☆'.repeat(5 - topic.difficulty)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Intent</span>
                                    <Badge variant="outline" className="text-xs">{entry.intent?.replace('_', ' ') || '—'}</Badge>
                                </div>
                                <Separator />
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Progress</span>
                                    <span className="font-medium">
                                        {(() => {
                                            if (topic?.parent_id) {
                                                const parentTopic = topics.find(t => t.id === topic.parent_id)
                                                if (parentTopic) {
                                                    const childTopics = topics.filter(t => t.parent_id === parentTopic.id)
                                                    if (childTopics.length > 0) {
                                                        const totalProgress = childTopics.reduce((sum, child) => {
                                                            const childEntries = entries.filter(e => e.topic === child.id && e.user === entry.user)
                                                            const maxP = childEntries.length > 0 ? Math.max(...childEntries.map(e => Number(e.progress_percent) || 0)) : 0
                                                            return sum + maxP
                                                        }, 0)
                                                        return Math.round(totalProgress / childTopics.length)
                                                    }
                                                }
                                            }
                                            return Math.round(Number(entry.progress_percent) || 0)
                                        })()}%
                                    </span>
                                </div>
                                {entry.is_completed && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Completed</span>
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    </div>
                                )}
                                {topic && entry.hours > 0 && (
                                    <>
                                        <Separator />
                                        <div className="text-xs text-muted-foreground space-y-1">
                                            <p className="font-semibold text-foreground text-xs">Time vs Benchmark</p>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                                    <div className={cn("h-full rounded-full",
                                                        entry.hours <= topic.benchmark_hours * 1.2 ? "bg-emerald-500" :
                                                            entry.hours <= topic.benchmark_hours * 1.5 ? "bg-amber-500" : "bg-red-500"
                                                    )} style={{ width: `${Math.min((entry.hours / topic.benchmark_hours) * 100, 100)}%` }} />
                                                </div>
                                                <span className="tabular-nums font-medium">{((entry.hours / topic.benchmark_hours) * 100).toFixed(0)}%</span>
                                            </div>
                                            <p className="text-xs">{entry.hours}h of {topic.benchmark_hours}h benchmark</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Button className="w-full" variant="outline" onClick={onClose}>
                                Close View
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
