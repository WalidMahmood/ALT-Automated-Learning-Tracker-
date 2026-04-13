

import React, { useState } from 'react'
import { useAppSelector } from '@/lib/store/hooks'
import { NodeResult, FinalDecisionResult, Entry } from '@/lib/types'
import { OverrideModal } from '@/components/admin/override-modal'
import { NodeStructuredNotes } from '@/components/shared/node-structured-notes'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import {
    ArrowLeft,
    Brain,
    Clock,
    FileSearch,
    Target,
    AlertTriangle,
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
    BookOpen,
    Users,
    FileText,
} from 'lucide-react'

interface EntryDetailViewProps {
    entry: Entry
    onBack: () => void
    backLabel?: string
}

export function EntryDetailView({ entry, onBack, backLabel = "Back" }: EntryDetailViewProps) {
    const { topics } = useAppSelector((state) => state.topics)
    const { users } = useAppSelector((state) => state.users)
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
    const [overrideModalOpen, setOverrideModalOpen] = useState(false)

    const entryUser = users.find(u => u.id === entry.user)
    const entryTopic = topics.find(t => t.id === entry.topic)
    const isProject = entry.intent === 'sbu_tasks'

    const getTopicPath = (topicId: number | null) => {
        if (!topicId) return isProject ? (entry.project_name || 'Project') : '—'
        const t = topics.find(tp => tp.id === topicId)
        if (!t) return 'Unknown'
        if (t.parent_id) {
            const parent = topics.find(tp => tp.id === t.parent_id)
            if (parent?.parent_id) {
                const gp = topics.find(tp => tp.id === parent.parent_id)
                return `${gp?.name || '?'} → ${parent.name} → ${t.name}`
            }
            return `${parent?.name || '?'} → ${t.name}`
        }
        return t.name
    }

    const handleOverride = () => setOverrideModalOpen(true)
    const toggleNode = (key: string) => {
        setExpandedNodes(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
    }

    // ── AI Pipeline parsing ──
    const cot = (entry.ai_chain_of_thought || {}) as Record<string, any>
    const resolveNode = (key: string) => cot[key] ?? (key === 'final_decision' ? cot['final_reasoning'] : undefined)
    const isStructured = (val: any): val is NodeResult => val && typeof val === 'object' && 'summary' in val && 'path' in val

    const parseLegacy = (key: string, raw: string) => {
        let score: number | null = null; let path: string = 'logic'
        const text = String(raw)
        const scoreMatch = text.match(/Score:\s*(\d+\.?\d*)/i)
        if (scoreMatch) { let s = parseFloat(scoreMatch[1]); if (s <= 1.0) s = Math.round(s * 100); score = Math.round(Math.min(s, 100)) }
        if (score === null && key === 'progress_analysis') { const rm = text.match(/(?:Relevance|Progress|Confidence):\s*(\d+\.?\d*)/i); if (rm) { let s = parseFloat(rm[1]); score = s <= 1 ? Math.round(s * 100) : Math.round(Math.min(s, 100)) } }
        if (key === 'final_decision') {
            const cm = text.match(/Confidence:\s*(\d+\.?\d*)%/i); if (cm) score = Math.round(parseFloat(cm[1]))
            const tm = text.match(/Time:\s*(\d+\.?\d*)%?/); const qm = text.match(/Quality:\s*(\d+\.?\d*)%?/); const rm2 = text.match(/Relevance:\s*(\d+\.?\d*)%?/)
            if (tm && qm && rm2) {
                const parsedScores = { time: Math.round(parseFloat(tm[1])), quality: Math.round(parseFloat(qm[1])), relevance: Math.round(parseFloat(rm2[1])) }
                const wm = text.match(/T(\d+)%.*Q(\d+)%.*R(\d+)%/); const parsedWeights = wm ? { time: parseInt(wm[1]), quality: parseInt(wm[2]), relevance: parseInt(wm[3]) } : null
                const bm = text.match(/Blocker\s*boost:\s*\+?(\d+\.?\d*)%?/i); const pm = text.match(/PENALTY:\s*-?(\d+\.?\d*)%/i); const dm = text.match(/Decision:\s*(\w+)/i)
                return { score, path, finalData: { scores: parsedScores, weights: parsedWeights, blocker_boost: bm ? parseFloat(bm[1]) : 0, penalty: pm ? `Smart penalty: -${pm[1]}%` : '', reason: '', decision: dm ? dm[1].toLowerCase() : '' } }
            }
        }
        if (/circuit\s*breaker|forced\s*logic|skipped\s*AI/i.test(text)) path = 'breaker'
        else if (/\bLLM\b.*invok|AI\s*(?:score|analys|legitimacy)/i.test(text) && !/breaker|fallback/i.test(text)) path = 'ai'
        return { score, path, finalData: null }
    }

    const NODE_DEFS = [
        { key: 'context_analysis', label: 'Context Gatherer', shortLabel: 'Context', desc: 'Gathers all prior entries, copy-paste detection, progress coherence, blockers', icon: <Layers className="w-3.5 h-3.5" />, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/40', ring: 'ring-slate-300 dark:ring-slate-700', accent: 'border-l-slate-400' },
        { key: 'rag_context', label: 'RAG Knowledge', shortLabel: 'RAG', desc: 'Retrieves topic knowledge, subtopic coverage, and admin corrections from knowledge base', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/40', ring: 'ring-purple-300 dark:ring-purple-700', accent: 'border-l-purple-400' },
        { key: 'time_analysis', label: 'Time Reasoner', shortLabel: 'Time', desc: 'LLM assesses if hours are reasonable given context, experience, blockers & topic scope', icon: <Clock className="w-3.5 h-3.5" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/40', ring: 'ring-blue-300 dark:ring-blue-700', accent: 'border-l-blue-400' },
        { key: 'content_analysis', label: 'Content Validator', shortLabel: 'Content', desc: 'LLM validates genuine learning/work using topic knowledge, subtopic coverage & admin corrections', icon: <FileSearch className="w-3.5 h-3.5" />, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-100 dark:bg-cyan-900/40', ring: 'ring-cyan-300 dark:ring-cyan-700', accent: 'border-l-cyan-400' },
        { key: 'progress_analysis', label: 'Progress Analyzer', shortLabel: 'Progress', desc: 'LLM checks progress coherence, completion justification, subtopic coverage vs claimed progress', icon: <Target className="w-3.5 h-3.5" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40', ring: 'ring-emerald-300 dark:ring-emerald-700', accent: 'border-l-emerald-400' },
        { key: 'final_decision', label: 'Verdict Agent', shortLabel: 'Verdict', desc: 'LLM synthesizes all node findings into confidence score → decision', icon: <Scale className="w-3.5 h-3.5" />, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/40', ring: 'ring-rose-300 dark:ring-rose-700', accent: 'border-l-rose-500' },
    ]

    const activeNodes = NODE_DEFS.filter(n => resolveNode(n.key)).map((n, idx) => {
        const raw = resolveNode(n.key)
        const s = isStructured(raw)
        let score: number | null = null; let path: string | null = null; let legacyFinal: any = null; let pathReason: string | null = null; let llmResponse: string | null = null
        if (s) { score = raw.score ?? null; path = raw.path; pathReason = (raw as any).path_reason || null; llmResponse = (raw as any).llm_raw_response || null }
        else { const parsed = parseLegacy(n.key, String(raw)); score = parsed.score; path = parsed.path; legacyFinal = parsed.finalData }
        const summary = s ? raw.summary : String(raw)
        const details = s ? (typeof raw.details === 'string' ? raw.details : raw.details ? JSON.stringify(raw.details, null, 2) : null) : null
        const evidence = s ? (raw as any).evidence || null : null
        const llmReasoning = s ? (raw as any).llm_reasoning || null : null
        const ragAnalysis = s ? (raw as any).rag_analysis || null : null
        const guards: string[] = s ? ((raw as any).guards || []) : []
        const remaining: string[] | null = s ? ((raw as any).remaining || null) : null
        return { ...n, idx, raw, structured: s, score, path, summary, details, legacyFinal, pathReason, llmResponse, evidence, llmReasoning, ragAnalysis, guards, remaining }
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
            case 'hybrid': return { label: 'Hybrid', icon: <Brain className="w-3 h-3" />, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800', explain: 'Math baseline blended 50/50 with AI contextual check.' }
            case 'breaker': return { label: 'Breaker', icon: <Timer className="w-3 h-3" />, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', explain: 'Circuit breaker triggered — AI too slow, fell back to logic.' }
            case 'skipped': return { label: 'Skipped', icon: <Minus className="w-3 h-3" />, color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-muted', explain: 'Node skipped — not applicable for this entry.' }
            default: return null
        }
    }

    const passCount = activeNodes.filter(n => n.score !== null && n.score >= 50).length
    const failCount = activeNodes.filter(n => n.score !== null && n.score < 50).length
    const breakerCount = activeNodes.filter(n => n.path === 'breaker').length

    return (
        <div className="space-y-6">
            {/* Header bar with back button */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-lg font-bold tracking-tight">Entry #{entry.id} Details</h1>
                    <p className="text-xs text-muted-foreground">
                        {entryUser?.name || 'Unknown'} &middot; {entry.date} &middot; {isProject ? `🛠️ ${entry.project_name}` : getTopicPath(entry.topic)}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {entry.ai_decision && (
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
                    {entry.admin_override && (
                        <Badge className="text-xs font-bold uppercase px-3 py-1 border-0 shadow-sm bg-blue-500/15 text-blue-700 dark:text-blue-400">
                            <Zap className="w-3.5 h-3.5 mr-1.5" />OVERRIDDEN
                        </Badge>
                    )}
                    <Badge variant={entry.status === 'flagged' || entry.status === 'rejected' ? 'destructive' : 'outline'} className="text-xs font-bold uppercase">
                        {entry.status}
                    </Badge>
                </div>
            </div>

            {/* ═══ FUTURISTIC DIAMOND PIPELINE ═══ */}
            <style>{`
                @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 8px currentColor, 0 0 16px currentColor; } 50% { box-shadow: 0 0 16px currentColor, 0 0 32px currentColor; } }
                @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                @keyframes fadeUp { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
                @keyframes flowDown { 0% { background-position: 0 -200%; } 100% { background-position: 0 200%; } }
                @keyframes flowRight { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                @keyframes diamondSpin { 0% { transform: rotate(45deg); } 100% { transform: rotate(405deg); } }
                @keyframes flowDash { to { stroke-dashoffset: -24; } }
                .pipe-fade { animation: fadeUp 0.6s ease forwards; opacity:0; }
                .pipe-fade-d1 { animation-delay: 0.1s; }
                .pipe-fade-d2 { animation-delay: 0.2s; }
                .pipe-fade-d3 { animation-delay: 0.3s; }
                .pipe-fade-d4 { animation-delay: 0.5s; }
                .pipe-fade-d5 { animation-delay: 0.7s; }
                .glow-dot-v2 { animation: pulseGlow 2.5s ease-in-out infinite; }
                .shimmer-bar { background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%); background-size: 200% 100%; animation: shimmer 3s linear infinite; }
                .diamond-icon { animation: diamondSpin 8s linear infinite; }
                .flow-connector-v { background: linear-gradient(180deg, transparent 0%, var(--fc-color, #a78bfa) 30%, var(--fc-color, #a78bfa) 70%, transparent 100%); background-size: 100% 200%; animation: flowDown 2s linear infinite; }
                .flow-connector-h { background: linear-gradient(90deg, transparent 0%, var(--fc-color, #a78bfa) 30%, var(--fc-color, #a78bfa) 70%, transparent 100%); background-size: 200% 100%; animation: flowRight 2s linear infinite; }
            `}</style>
            {(() => {
                // All nodes
                const contextNode = activeNodes.find(n => n.key === 'context_analysis')
                const ragNode = activeNodes.find(n => n.key === 'rag_context')
                const timeNode = activeNodes.find(n => n.key === 'time_analysis')
                const contentNode = activeNodes.find(n => n.key === 'content_analysis')
                const progressNode = activeNodes.find(n => n.key === 'progress_analysis')
                const verdictNode = activeNodes.find(n => n.key === 'final_decision')
                const confidence = entry.ai_confidence != null ? Number(entry.ai_confidence) : null

                // Extract only the final reasoning sentence, not numbered analysis
                const getReasoning = (node: typeof timeNode, skipFirstLine = false): string => {
                    if (!node) return 'No analysis available'
                    let text = node.llmReasoning || node.summary || ''
                    text = String(text).replace(/Baseline\s*\d+[\s+\-×÷*/().\d]+=?\s*\d*%?/gi, '').trim()
                    // For analysis nodes: extract only the part after the last "Reasoning:" marker
                    const reasoningIdx = text.lastIndexOf('Reasoning:')
                    if (reasoningIdx > 0) {
                        text = text.substring(reasoningIdx + 'Reasoning:'.length).trim()
                    } else if (skipFirstLine) {
                        // For verdict: skip first math/formula line
                        const lines = text.split(/[.\n]/).filter((l: string) => l.trim())
                        if (lines.length > 1) text = lines.slice(1).join('. ').trim()
                    }
                    return text || 'Analysis completed'
                }

                // Parse evidence into separate key:value chips
                const parseEvidenceItems = (node: typeof timeNode): Array<{ label: string, value: string }> => {
                    if (!node) return []
                    const ev = node.evidence
                    let rawItems: string[] = []
                    if (Array.isArray(ev)) rawItems = ev.map(e => String(e))
                    else if (typeof ev === 'string' && ev.trim()) rawItems = [ev]
                    else if (node.summary && (node.key === 'context_analysis' || node.key === 'rag_context')) rawItems = [node.summary]
                    if (rawItems.length === 0) return []

                    const parsed: Array<{ label: string, value: string }> = []
                    for (const item of rawItems) {
                        const str = String(item).trim()
                        // Use matchAll to find all "Key: value" pairs where Key is 1-4 words
                        // Each key starts with a capital letter; value runs until the next key or end
                        const kvRegex = /([A-Z][A-Za-z\-\/]*(?:[\s][a-z]+)*(?:[\s][A-Za-z\-\/]+)*)\s*:\s*/g
                        const keyPositions: Array<{ label: string, start: number, valueStart: number }> = []
                        let m: RegExpExecArray | null
                        while ((m = kvRegex.exec(str)) !== null) {
                            keyPositions.push({ label: m[1].trim(), start: m.index, valueStart: m.index + m[0].length })
                        }

                        if (keyPositions.length > 0) {
                            // Extract value for each key: from valueStart to the start of the next key
                            for (let k = 0; k < keyPositions.length; k++) {
                                const valEnd = k < keyPositions.length - 1 ? keyPositions[k + 1].start : str.length
                                const value = str.substring(keyPositions[k].valueStart, valEnd).replace(/[,.;\s]+$/, '').trim()
                                if (value) {
                                    parsed.push({ label: keyPositions[k].label, value })
                                }
                            }
                            // If there's text before the first key, add it
                            if (keyPositions[0].start > 0) {
                                const prefix = str.substring(0, keyPositions[0].start).trim()
                                if (prefix.length > 2) parsed.unshift({ label: '', value: prefix })
                            }
                        } else if (str.length > 2) {
                            parsed.push({ label: '', value: str })
                        }
                    }
                    return parsed
                }

                // Guards per node
                const getGuards = (node: typeof timeNode): string[] => {
                    if (!node) return []
                    return node.guards || []
                }

                const pathLabel = (path: string | null) => {
                    if (!path) return { text: '—', cls: 'text-muted-foreground bg-muted/30' }
                    if (path === 'pass') return { text: 'PASS', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' }
                    if (path === 'concern') return { text: 'CONCERN', cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30' }
                    if (path === 'breaker') return { text: 'BREAKER', cls: 'text-red-400 bg-red-500/15 border-red-500/30' }
                    return { text: path.toUpperCase(), cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30' }
                }

                // Verdict info
                const vRaw = verdictNode?.raw as any
                const nodeVerdicts = vRaw?.node_verdicts || null
                const guardsTriggered: string[] = vRaw?.guards_triggered || verdictNode?.guards || []
                const guardsSilenced: string[] = vRaw?.guards_silenced || []
                const verdictReasoning = getReasoning(verdictNode, true)

                // Big gauge SVG
                const ScoreGauge = ({ score, size = 80 }: { score: number | null, size?: number }) => {
                    const r = (size / 2) - 8
                    const circ = 2 * Math.PI * r
                    const strokeColor = score === null ? '#6b7280' : score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
                    const glowFilter = score !== null && score < 50 ? 'drop-shadow(0 0 6px #ef4444)' : score !== null && score >= 80 ? 'drop-shadow(0 0 6px #10b981)' : ''
                    return (
                        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: glowFilter }}>
                            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" opacity="0.15" />
                            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                                stroke={strokeColor} strokeWidth="6" strokeLinecap="round"
                                strokeDasharray={`${((score ?? 0) / 100) * circ} ${circ}`}
                                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                                style={{ transition: 'stroke-dasharray 1.2s ease' }}
                            />
                            <text x={size / 2} y={size / 2 - 2} textAnchor="middle" className="fill-foreground font-black" style={{ fontSize: `${size * 0.28}px` }}>
                                {score !== null ? score : '—'}
                            </text>
                            <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: `${size * 0.12}px`, letterSpacing: '1.5px' }}>
                                {score !== null ? (score >= 80 ? 'PASS' : score >= 50 ? 'FAIR' : 'FAIL') : ''}
                            </text>
                        </svg>
                    )
                }

                // Evidence chip grid (premium parsed view)
                const EvidenceGrid = ({ items, accent = 'blue' }: { items: Array<{ label: string, value: string }>, accent?: string }) => {
                    if (items.length === 0) return null
                    const dotColor = accent === 'purple' ? 'bg-purple-400' : accent === 'cyan' ? 'bg-cyan-400' : accent === 'emerald' ? 'bg-emerald-400' : 'bg-blue-400'
                    const borderColor = accent === 'purple' ? 'border-purple-500/20' : accent === 'cyan' ? 'border-cyan-500/20' : accent === 'emerald' ? 'border-emerald-500/20' : 'border-blue-500/20'
                    return (
                        <div className="rounded-xl border bg-muted/5 p-4 space-y-2.5">
                            <p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-2">
                                📎 Evidence
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {items.map((item, i) => (
                                    <div key={i} className={cn("rounded-lg border px-3 py-2 flex items-start gap-2 bg-card/50", borderColor)}>
                                        <div className={cn("h-2 w-2 rounded-full mt-1.5 shrink-0", dotColor)} />
                                        <div className="min-w-0">
                                            {item.label && (
                                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">{item.label}</span>
                                            )}
                                            <span className="text-xs text-foreground/80 break-words leading-relaxed" style={{ overflowWrap: 'anywhere' }}>{item.value}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                }

                // Analysis card (no built-in connector lines — SVG handles connections)
                const AnalysisCard = ({ node, label, icon, gradient, delay, accent }: {
                    node: typeof timeNode, label: string, icon: React.ReactNode, gradient: string, delay: string, accent: string
                }) => {
                    const score = node?.score ?? null
                    const pth = pathLabel(node?.path ?? null)
                    const reasoning = getReasoning(node)
                    const evidenceItems = parseEvidenceItems(node)
                    const guards = getGuards(node)
                    return (
                        <div className={`pipe-fade ${delay}`}>
                            <div className="rounded-2xl border overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1.5 bg-card w-full">
                                {/* Gradient header */}
                                <div className={cn("bg-gradient-to-r p-4 flex items-center justify-between", gradient)}>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-lg">
                                            {icon}
                                        </div>
                                        <span className="text-base font-black text-white tracking-wide">{label}</span>
                                    </div>
                                    <div className={cn("px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider", pth.cls)}>
                                        {pth.text}
                                    </div>
                                </div>
                                <div className="shimmer-bar h-0.5 w-full" />

                                {/* Body */}
                                <div className="p-5 space-y-4">
                                    {/* Score + Reasoning */}
                                    <div className="flex items-start gap-5">
                                        <div className="shrink-0">
                                            <ScoreGauge score={score} size={88} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground mb-2 flex items-center gap-1.5">
                                                <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Reasoning
                                            </p>
                                            <p className="text-sm leading-relaxed text-foreground/85 break-words" style={{ overflowWrap: 'anywhere' }}>
                                                {reasoning}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Evidence grid */}
                                    <EvidenceGrid items={evidenceItems} accent={accent} />

                                    {/* Guards Section */}
                                    {guards.length > 0 && (
                                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3.5 space-y-2">
                                            <p className="text-xs font-black uppercase tracking-[0.15em] text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                                🛡️ Guards Triggered
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {guards.map((g, i) => (
                                                    <span key={i} className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                                                        <AlertTriangle className="w-3.5 h-3.5" /> {g}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }

                // Support card (Context/RAG) — no connector lines, SVG handles connections
                const SupportCard = ({ node, label, icon, gradient, delay, accent }: {
                    node: typeof timeNode, label: string, icon: React.ReactNode, gradient: string, delay: string, accent: string
                }) => {
                    const evidenceItems = parseEvidenceItems(node)
                    return (
                        <div className={`pipe-fade ${delay}`}>
                            <div className="rounded-xl border overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card/80 backdrop-blur w-full">
                                <div className={cn("bg-gradient-to-r px-4 py-3 flex items-center gap-3", gradient)}>
                                    <div className="h-8 w-8 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center text-white">
                                        {icon}
                                    </div>
                                    <span className="text-sm font-black text-white tracking-wide">{label}</span>
                                </div>
                                <div className="p-4">
                                    {evidenceItems.length > 0 ? (
                                        <EvidenceGrid items={evidenceItems} accent={accent} />
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic">No evidence collected</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }



                // No separate BackboneConnector needed — connectors are inline grid-based

                return (
                    <div className="space-y-0">
                        {/* Hero Header */}
                        <div className="relative rounded-t-xl border border-b-0 overflow-hidden shadow-lg">
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 via-violet-500/5 to-indigo-900/5 dark:from-slate-900/30 dark:via-violet-900/15 dark:to-indigo-900/25" />
                            <div className="h-1.5 bg-gradient-to-r from-slate-500 via-purple-500 via-blue-500 via-cyan-500 via-emerald-500 to-rose-500" />
                            <div className="relative p-5 flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                                        {isProject ? <Layers className="w-5 h-5 text-white" /> : <BookOpen className="w-5 h-5 text-white" />}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black tracking-tight">{isProject ? entry.project_name : getTopicPath(entry.topic)}</h2>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {entryUser?.name || 'Unknown'} · {entry.date} · <span className="font-bold">{entry.hours}h</span> logged
                                            {entry.target_module && <span> · 📦 {entry.target_module}</span>}
                                            {entry.blockers_text && <span className="text-red-500 font-bold"> · ⚠️ Blocker</span>}
                                        </p>
                                    </div>
                                </div>
                                {entry.ai_decision && (
                                    <div className={cn(
                                        "px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest shadow-xl flex items-center gap-2",
                                        entry.ai_decision === 'approve' && "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-500/40",
                                        entry.ai_decision === 'flag' && "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-red-500/40",
                                        entry.ai_decision === 'pending' && "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/40",
                                    )}>
                                        {entry.ai_decision === 'approve' && <CheckCircle2 className="w-4 h-4" />}
                                        {entry.ai_decision === 'flag' && <Flag className="w-4 h-4" />}
                                        {entry.ai_decision === 'pending' && <HelpCircle className="w-4 h-4" />}
                                        {entry.ai_decision}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ═══ Diamond Pipeline Body ═══ */}
                        <div className="relative border border-t-0 rounded-b-xl overflow-hidden shadow-lg">
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-500/[0.02] to-violet-500/[0.03]" />

                            {/* ◆ ROW 1: Support Nodes (Context + RAG) */}
                            <div className="relative px-6 pt-8 pb-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <SupportCard node={contextNode} label="Context Gatherer" icon={<Layers className="w-4 h-4" />} gradient="from-slate-600 to-slate-700" delay="pipe-fade-d1" accent="slate" />
                                    <SupportCard node={ragNode} label="RAG Knowledge" icon={<BookOpen className="w-4 h-4" />} gradient="from-purple-600 to-violet-700" delay="pipe-fade-d2" accent="purple" />
                                </div>
                            </div>

                            {/* ═══ CSS EDGE: Support → Analysis (Merge then Branch) ═══ */}
                            {/* Uses flow-connector + glow-dot classes for premium beam animation */}
                            <div className="relative px-6" style={{ height: '60px', zIndex: 5, overflow: 'hidden' }}>
                                {/* Vertical line from Context card center (25%) - stays within connector div */}
                                <div className="absolute" style={{ left: '25%', top: 0, width: '2px', height: '25%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#94a3b8' } as React.CSSProperties} />
                                </div>
                                {/* Vertical line from RAG card center (75%) - stays within connector div */}
                                <div className="absolute" style={{ left: '75%', top: 0, width: '2px', height: '25%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#a78bfa' } as React.CSSProperties} />
                                </div>
                                {/* Horizontal merge line connecting both at 25% */}
                                <div className="absolute" style={{ left: '25%', top: '25%', width: '50%', height: '2px', transform: 'translateY(-50%)' }}>
                                    <div className="w-full h-full flow-connector-h" style={{ '--fc-color': '#a78bfa' } as React.CSSProperties} />
                                </div>
                                {/* Merge dot at center */}
                                <div className="absolute" style={{ left: '50%', top: '25%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="h-3 w-3 rounded-full glow-dot-v2" style={{ background: '#a78bfa', color: '#a78bfa' }} />
                                </div>
                                {/* Vertical line from merge dot down */}
                                <div className="absolute" style={{ left: '50%', top: '25%', width: '2px', height: '35%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#a78bfa' } as React.CSSProperties} />
                                </div>
                                {/* Horizontal branch line at 60% */}
                                <div className="absolute" style={{ left: '17%', top: '60%', width: '66%', height: '2px', transform: 'translateY(-50%)' }}>
                                    <div className="w-full h-full flow-connector-h" style={{ '--fc-color': '#22d3ee' } as React.CSSProperties} />
                                </div>
                                {/* Branch dot + line: Time at 17% - extends to bottom of connector div */}
                                <div className="absolute" style={{ left: '17%', top: '60%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="h-3 w-3 rounded-full glow-dot-v2" style={{ background: '#3b82f6', color: '#3b82f6' }} />
                                </div>
                                <div className="absolute" style={{ left: '17%', top: '60%', width: '2px', height: '40%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#3b82f6' } as React.CSSProperties} />
                                </div>
                                {/* Branch dot + line: Content at 50% - extends to bottom of connector div */}
                                <div className="absolute" style={{ left: '50%', top: '60%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="h-3 w-3 rounded-full glow-dot-v2" style={{ background: '#22d3ee', color: '#22d3ee' }} />
                                </div>
                                <div className="absolute" style={{ left: '50%', top: '60%', width: '2px', height: '40%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#22d3ee' } as React.CSSProperties} />
                                </div>
                                {/* Branch dot + line: Progress at 83% - extends to bottom of connector div */}
                                <div className="absolute" style={{ left: '83%', top: '60%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="h-3 w-3 rounded-full glow-dot-v2" style={{ background: '#10b981', color: '#10b981' }} />
                                </div>
                                <div className="absolute" style={{ left: '83%', top: '60%', width: '2px', height: '40%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#10b981' } as React.CSSProperties} />
                                </div>
                            </div>

                            {/* ◆ ROW 2: Analysis Nodes */}
                            <div className="relative px-6 pt-8 pb-8">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                    <AnalysisCard node={timeNode} label="Time Reasoner" icon={<Clock className="w-5 h-5" />} gradient="from-blue-500 to-indigo-600" delay="pipe-fade-d2" accent="blue" />
                                    <AnalysisCard node={contentNode} label="Content Validator" icon={<FileSearch className="w-5 h-5" />} gradient="from-cyan-500 to-teal-600" delay="pipe-fade-d3" accent="cyan" />
                                    <AnalysisCard node={progressNode} label="Progress Analyzer" icon={<Target className="w-5 h-5" />} gradient="from-emerald-500 to-green-600" delay="pipe-fade-d4" accent="emerald" />
                                </div>
                            </div>

                            {/* ═══ CSS EDGE: Analysis → Verdict (3 merge to 1) ═══ */}
                            <div className="relative px-6" style={{ height: '60px', zIndex: 5, overflow: 'hidden' }}>
                                {/* Vertical line from Time card (17%) - stays within connector div */}
                                <div className="absolute" style={{ left: '17%', top: 0, width: '2px', height: '30%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#3b82f6' } as React.CSSProperties} />
                                </div>
                                {/* Vertical line from Content card (50%) - stays within connector div */}
                                <div className="absolute" style={{ left: '50%', top: 0, width: '2px', height: '30%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#22d3ee' } as React.CSSProperties} />
                                </div>
                                {/* Vertical line from Progress card (83%) - stays within connector div */}
                                <div className="absolute" style={{ left: '83%', top: 0, width: '2px', height: '30%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#10b981' } as React.CSSProperties} />
                                </div>
                                {/* Horizontal merge line at 30% */}
                                <div className="absolute" style={{ left: '17%', top: '30%', width: '66%', height: '2px', transform: 'translateY(-50%)' }}>
                                    <div className="w-full h-full flow-connector-h" style={{ '--fc-color': '#f43f5e' } as React.CSSProperties} />
                                </div>
                                {/* Merge dot at center */}
                                <div className="absolute" style={{ left: '50%', top: '30%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="h-3 w-3 rounded-full glow-dot-v2" style={{ background: '#f43f5e', color: '#f43f5e' }} />
                                </div>
                                {/* Single vertical line down to verdict - extends to bottom of connector div */}
                                <div className="absolute" style={{ left: '50%', top: '30%', width: '2px', height: '70%', transform: 'translateX(-50%)' }}>
                                    <div className="w-full h-full flow-connector-v" style={{ '--fc-color': '#f43f5e' } as React.CSSProperties} />
                                </div>
                            </div>

                            {/* ◆ ROW 3: Verdict */}
                            <div className="relative px-6 pb-6 pipe-fade pipe-fade-d5">
                                <div className="rounded-2xl border-2 border-rose-500/20 overflow-hidden shadow-2xl shadow-rose-500/10 bg-gradient-to-br from-card via-card to-rose-500/[0.04]">
                                    {/* Verdict header */}
                                    <div className="bg-gradient-to-r from-rose-500 via-pink-600 to-violet-600 p-5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white shadow-lg">
                                                <Scale className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <span className="text-lg font-black text-white tracking-wide">Final Verdict</span>
                                                <p className="text-xs text-white/60 font-medium">All Nodes Synthesized</p>
                                            </div>
                                        </div>
                                        {confidence !== null && (
                                            <ScoreGauge score={Math.round(confidence)} size={80} />
                                        )}
                                    </div>
                                    <div className="shimmer-bar h-0.5 w-full" />

                                    {/* Verdict body */}
                                    <div className="p-6 space-y-4">
                                        {/* Node verdict pills */}
                                        {nodeVerdicts && (
                                            <div className="flex flex-wrap gap-2.5">
                                                {Object.entries(nodeVerdicts).map(([key, val]) => {
                                                    const labels: Record<string, string> = { time: '⏱️ Time', content: '📄 Content', progress: '🎯 Progress' }
                                                    return (
                                                        <div key={key} className={cn(
                                                            "px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 shadow-sm",
                                                            val === 'PASS' ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" :
                                                                val === 'FAIL' ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400" :
                                                                    "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
                                                        )}>
                                                            {val === 'PASS' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                                            {labels[key] || key}: {val as string}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}

                                        {/* Guards Section */}
                                        {(guardsTriggered.length > 0 || guardsSilenced.length > 0) && (
                                            <div className="rounded-xl border p-4 space-y-2.5">
                                                <p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground">🛡️ Guard System</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {guardsTriggered.map((g, i) => (
                                                        <div key={`t-${i}`} className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5 shadow-sm">
                                                            <AlertTriangle className="w-3.5 h-3.5" /> {g}
                                                        </div>
                                                    ))}
                                                    {guardsSilenced.map((g, i) => (
                                                        <div key={`s-${i}`} className="px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 text-xs font-medium text-muted-foreground flex items-center gap-1.5 line-through opacity-50">
                                                            🔇 {g}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Reasoning */}
                                        <div className="rounded-xl border bg-muted/10 p-4 space-y-2">
                                            <p className="text-xs font-black uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
                                                <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Reasoning
                                            </p>
                                            <p className="text-sm leading-relaxed text-foreground/85 break-words" style={{ overflowWrap: 'anywhere' }}>
                                                {verdictReasoning}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="h-5" />
                    </div>
                )
            })()}

            {/* Main 3-column layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left 2/3 — Entry content + AI Analysis */}
                <div className="md:col-span-2 space-y-8">
                    {/* Topic / Project */}
                    <div>
                        <h3 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-widest flex items-center gap-2">
                            <BookOpen className="h-3 w-3" /> {isProject ? 'Project' : 'Topic'}
                        </h3>
                        <div className="p-4 bg-muted/20 rounded-xl border text-sm font-medium">
                            {isProject ? (
                                <div className="space-y-1">
                                    <span className="flex items-center gap-1.5">🛠️ {entry.project_name}</span>
                                    {entry.project_description && (
                                        <p className="text-xs text-muted-foreground italic">{entry.project_description}</p>
                                    )}
                                </div>
                            ) : getTopicPath(entry.topic)}
                        </div>
                    </div>

                    {/* Learner Details */}
                    <div>
                        <h3 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-widest flex items-center gap-2">
                            <Users className="h-3 w-3" /> Learner Details
                        </h3>
                        <div className="p-4 bg-muted/20 rounded-xl border text-sm font-medium flex items-center justify-between">
                            <span>{entryUser?.name || 'Unknown User'}</span>
                            <span className="text-xs text-muted-foreground">ID: {entry.user}</span>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <h3 className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-widest flex items-center gap-2">
                            <FileText className="h-3 w-3" /> Detailed Description
                        </h3>
                        <div className="p-5 bg-card/50 rounded-xl text-sm leading-relaxed border shadow-inner whitespace-pre-wrap min-h-[120px] max-h-[400px] overflow-y-auto break-words">
                            {entry.learned_text}
                        </div>
                    </div>

                    {/* Blockers */}
                    <div>
                        <h3 className="text-xs font-bold text-destructive mb-2 uppercase tracking-widest flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3" /> Blockers Encountered
                        </h3>
                        <div className={cn(
                            "p-5 rounded-xl text-sm border shadow-sm font-medium",
                            entry.blockers_text ? "bg-destructive/5 text-destructive border-destructive/20" : "bg-muted/10 text-muted-foreground border-border"
                        )}>
                            {(() => {
                                const text = entry.blockers_text || ''
                                if (!text) return <span className="italic opacity-70">None reported</span>
                                const parts = text.split(':')
                                const potentialType = parts[0]?.trim()
                                const description = parts.length > 1 ? parts.slice(1).join(':').trim() : text
                                const validTypes = ['Technical', 'Environmental', 'Personal', 'Resource', 'Other']
                                if (parts.length > 1 && validTypes.includes(potentialType)) {
                                    return (
                                        <div className="flex flex-col gap-2 min-w-0">
                                            <Badge variant="destructive" className="w-fit px-2 py-0.5 text-xs uppercase font-bold tracking-wider">{potentialType}</Badge>
                                            <span className="leading-relaxed text-foreground/80 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{description}</span>
                                        </div>
                                    )
                                }
                                return <span className="break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{text}</span>
                            })()}
                        </div>
                    </div>

                    {/* ── AI Brain Analysis ── */}
                    <div className="pt-6 border-t">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
                                    <Brain className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-foreground tracking-tight">AI Brain Analysis</h3>
                                    <p className="text-xs text-muted-foreground">6-Node v7.0 RAG Pipeline &middot; {entry.intent?.replace('_', ' ') || 'deep learning'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Confidence Gauge */}
                        {entry.ai_confidence != null && Number(entry.ai_confidence) >= 0 && (() => {
                            const confidence = Number(entry.ai_confidence)
                            return (
                                <div className="mb-4 p-3 rounded-lg bg-muted/30 border">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-medium text-muted-foreground">Confidence Score</span>
                                        <span className={cn("text-sm font-bold tabular-nums",
                                            confidence >= 70 ? "text-emerald-600" : "text-amber-600"
                                        )}>{confidence.toFixed(1)}%</span>
                                    </div>
                                    <div className="relative h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                        <div className={cn("h-full rounded-full transition-all duration-700 ease-out",
                                            confidence >= 70 ? "bg-gradient-to-r from-emerald-400 to-emerald-500" :
                                                "bg-gradient-to-r from-amber-400 to-amber-500"
                                        )} style={{ width: `${Math.min(confidence, 100)}%` }} />
                                        <div className="absolute top-0 left-[40%] w-px h-full bg-foreground/20" title="Flag threshold" />
                                        <div className="absolute top-0 left-[80%] w-px h-full bg-foreground/20" title="Approve threshold" />
                                    </div>
                                    <div className="flex justify-between mt-1">
                                        <span className="text-xs text-muted-foreground">0%</span>
                                        <div className="flex gap-3">
                                            <span className="text-xs text-amber-500/70">Review &lt;70</span>
                                            <span className="text-xs text-emerald-500/70">Approved 70+</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">100%</span>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Pipeline content */}
                        {entry.ai_status === 'timeout' ? (
                            <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-amber-50/50 dark:bg-amber-950/10">
                                <Timer className="w-8 h-8 text-amber-600" />
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Analysis Timed Out</p>
                            </div>
                        ) : entry.ai_status === 'error' ? (
                            <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-red-50/50 dark:bg-red-950/10">
                                <XCircle className="w-8 h-8 text-red-600" />
                                <p className="text-sm font-medium text-red-700 dark:text-red-400">Analysis Error</p>
                            </div>
                        ) : activeNodes.length > 0 ? (
                            <div className="space-y-3">
                                {/* Graph Scorecard */}
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
                                                            {n.score !== null && <span className={cn("text-xs font-bold px-1 rounded", g.bg, g.color)}>{g.label}</span>}
                                                        </div>
                                                    </React.Fragment>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed Examiner Report */}
                                <div className="rounded-xl border overflow-hidden bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-900/50 dark:to-slate-950">
                                    <div className="px-3 py-2 border-b bg-muted/20">
                                        <div className="flex items-center gap-2">
                                            <CircleDot className="w-3.5 h-3.5 text-indigo-500" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-foreground/80">Detailed Examiner Report</span>
                                            <span className="text-xs text-muted-foreground ml-auto">Click to expand</span>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <div className="absolute left-[23px] top-4 bottom-4 w-px bg-gradient-to-b from-violet-300 via-indigo-300 to-rose-300 dark:from-violet-700 dark:via-indigo-700 dark:to-rose-700" />

                                        {activeNodes.map((n) => {
                                            const isExpanded = expandedNodes.has(n.key)
                                            const isFinal = n.key === 'final_decision'
                                            const pm = pathMeta(n.path)
                                            const g = gradeFor(n.score)
                                            const passed = n.score === null || n.score >= 50
                                            const fd = isFinal ? (n.structured ? n.raw as FinalDecisionResult : null) : null
                                            const lfd = isFinal ? n.legacyFinal : null

                                            return (
                                                <div key={n.key} className="relative pl-5 pr-3 py-2">
                                                    <div className={cn(
                                                        "absolute left-3 top-[18px] w-[21px] h-[21px] rounded-full border-2 flex items-center justify-center z-10",
                                                        passed ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40" : "border-red-400 bg-red-50 dark:bg-red-950/40",
                                                        n.score === null && "border-slate-300 bg-slate-50 dark:bg-slate-800 dark:border-slate-600"
                                                    )}>
                                                        <span className="text-xs font-bold tabular-nums text-muted-foreground">{n.idx}</span>
                                                    </div>

                                                    <div
                                                        className={cn(
                                                            "ml-5 rounded-lg border-l-[3px] border transition-all cursor-pointer select-none",
                                                            n.accent, isExpanded ? "ring-1 shadow-sm bg-card" : "hover:bg-muted/20", isExpanded && n.ring,
                                                        )}
                                                        onClick={() => toggleNode(n.key)}
                                                    >
                                                        <div className="flex items-center gap-2.5 p-2.5">
                                                            <div className={cn("p-1 rounded-md shrink-0", n.bg)}>
                                                                <span className={n.color}>{n.icon}</span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="text-xs font-bold text-foreground">{n.label}</span>
                                                                    {pm && <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0 rounded border text-xs font-semibold", pm.bg, pm.color, pm.border)}>{pm.icon}{pm.label}</span>}
                                                                    {n.score !== null && <span className={cn("px-1.5 py-0 rounded text-xs font-bold", g.bg, g.color)}>{n.score}% ({g.label})</span>}
                                                                </div>
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

                                                        {isExpanded && (
                                                            <div className="px-3 pb-3 space-y-2 border-t bg-muted/5">
                                                                <div className="pt-2" />
                                                                <p className="text-xs text-muted-foreground italic">{n.desc}</p>
                                                                {pm && (
                                                                    <div className={cn("flex items-start gap-2 p-2 rounded-md border text-xs", pm.bg, pm.color, pm.border)}>
                                                                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                                        <span>{n.pathReason || (<><strong>Path: {pm.label}</strong> — {pm.explain}</>)}</span>
                                                                    </div>
                                                                )}

                                                                <NodeStructuredNotes summary={n.summary} evidence={n.evidence} llmReasoning={n.llmReasoning} llmResponse={n.llmResponse} ragAnalysis={n.ragAnalysis} guards={n.guards} remaining={n.remaining} />

                                                                {/* Final decision details */}
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

                                                                {/* Full details (only when no LLM response and no structured evidence — avoids duplication) */}
                                                                {n.details && !n.llmResponse && !n.evidence && (
                                                                    <div className="p-2 rounded-md bg-muted/30 border">
                                                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Full Details</p>
                                                                        <div className="text-xs leading-relaxed text-foreground/70 whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{n.details}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    <div className="flex justify-center py-2 border-t bg-muted/5">
                                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border">
                                            <CircleDot className="w-3 h-3 text-muted-foreground" />
                                            <span className="text-xs font-medium text-muted-foreground">Pipeline Complete</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : entry.ai_status === 'pending' ? (
                            <div className="rounded-xl border p-6 flex flex-col items-center gap-3 text-center bg-indigo-50/50 dark:bg-indigo-950/10">
                                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400">Analyzing Entry...</p>
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
                                onClick={handleOverride}>
                                <Zap className="w-3.5 h-3.5 mr-1.5" />Override Status
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Right column — Metadata + How AI Decides */}
                <div className="space-y-6">
                    {/* Entry Metadata */}
                    <div className="rounded-2xl border bg-card p-6 space-y-6 shadow-sm">
                        <h3 className="text-sm font-bold border-b pb-3 flex items-center gap-2">
                            <Clock className="h-4 w-4" /> Entry Metadata
                        </h3>
                        <div className="space-y-5">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Logged On</span>
                                <span className="font-bold">{entry.date}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Time Spent</span>
                                <span className="font-bold text-primary">{entry.hours} hours</span>
                            </div>
                            {entryTopic && (
                                <>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Benchmark</span>
                                        <span className="font-medium">{entryTopic.benchmark_hours}h expected</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">Difficulty</span>
                                        <span className="font-medium">{'★'.repeat(entryTopic.difficulty)}{'☆'.repeat(5 - entryTopic.difficulty)}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Intent</span>
                                <Badge variant="outline" className="text-xs">{entry.intent?.replace('_', ' ') || '—'}</Badge>
                            </div>
                            {isProject && entry.project_name && (
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Project</span>
                                    <span className="font-medium text-xs truncate max-w-[140px]">{entry.project_name}</span>
                                </div>
                            )}
                            <Separator />
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Status</span>
                                <Badge variant="outline" className={cn(
                                    "text-xs font-bold",
                                    entry.is_completed ? "text-emerald-700 border-emerald-300 bg-emerald-50" : "text-muted-foreground"
                                )}>
                                    {entry.is_completed ? 'Completed' : 'In Progress'}
                                </Badge>
                            </div>
                            {entryTopic && entry.hours > 0 && (
                                <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                                    <p className="font-semibold text-foreground text-xs">Time vs Benchmark</p>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                            <div className={cn("h-full rounded-full",
                                                entry.hours <= entryTopic.benchmark_hours * 1.2 ? "bg-emerald-500" :
                                                    entry.hours <= entryTopic.benchmark_hours * 1.5 ? "bg-amber-500" : "bg-red-500"
                                            )} style={{ width: `${Math.min((entry.hours / entryTopic.benchmark_hours) * 100, 100)}%` }} />
                                        </div>
                                        <span className="tabular-nums font-medium">{((entry.hours / entryTopic.benchmark_hours) * 100).toFixed(0)}%</span>
                                    </div>
                                    <p className="text-xs">{entry.hours}h of {entryTopic.benchmark_hours}h benchmark</p>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-sm pt-2 border-t font-bold">
                                <span className="text-muted-foreground">Status</span>
                                <Badge variant={entry.status === 'flagged' || entry.status === 'rejected' ? 'destructive' : 'outline'} className="rounded-sm text-xs px-1.5 uppercase">
                                    {entry.status}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    {/* Admin Override Info */}
                    {entry.admin_override && (
                        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-start gap-2">
                                <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">Admin Override</p>
                                    {entry.admin && <p className="text-xs text-blue-700 dark:text-blue-300">By: {(entry.admin as any).full_name || (entry.admin as any).email}</p>}
                                    {entry.override_at && <p className="text-xs text-blue-600 dark:text-blue-400">{new Date(entry.override_at).toLocaleString()}</p>}
                                    {entry.override_reason && <p className="text-xs text-blue-700 dark:text-blue-300 mt-1"><span className="font-medium">Reason:</span> {entry.override_reason.replace(/_/g, ' ')}</p>}
                                    {entry.override_comment && <p className="text-xs text-blue-700 dark:text-blue-300 italic">"{entry.override_comment}"</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* How AI Decides */}
                    <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                        <div className="px-4 py-3 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-b">
                            <div className="flex items-center gap-2">
                                <div className="p-1 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600">
                                    <Brain className="w-3 h-3 text-white" />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">How AI Decides</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">6-Node v7.0 RAG Pipeline</p>
                        </div>
                        <div className="p-3 space-y-2.5">
                            {[
                                { num: 0, label: 'Context Gatherer', mode: 'logic' as const, what: 'Researches the learner before AI analysis begins', checks: ['Prior entries on this topic/project', 'Copy-paste detection (Jaccard + sequence similarity)', 'Progress % coherence check', 'Blocker parsing & categorization', 'Pace analysis & total hours invested'] },
                                { num: 1, label: 'RAG Knowledge', mode: 'logic' as const, what: 'Retrieves topic knowledge and admin corrections from knowledge base', checks: ['Exact topic lookup from PostgreSQL', 'Semantic fallback via ChromaDB embeddings', 'Subtopic coverage analysis (prior + current)', 'Admin wisdom retrieval (semantic matching)'] },
                                { num: 2, label: 'Time Reasoner', mode: 'ai' as const, what: 'LLM assesses if hours are reasonable with full context + topic scope', checks: ['Hours vs difficulty, experience, and benchmark', 'RAG: Topic scope and learning objectives', 'Blocker impact on time justification', 'First entry leniency, history comparison'] },
                                { num: 3, label: 'Content Validator', mode: 'ai' as const, what: 'LLM evaluates genuine learning using topic knowledge', checks: ['RAG: Compare entry against expected subtopics', 'Genuine understanding vs vague fluff?', 'New subtopics vs repeat of prior entries?', 'Coverage ratio vs claimed progress alignment', 'Admin corrections from knowledge base'] },
                                { num: 4, label: 'Progress Analyzer', mode: 'ai' as const, what: 'LLM checks completion claims & subtopic coverage', checks: ['Is claimed progress % realistic for hours invested?', 'RAG: Subtopic coverage vs completion claim', 'Progress timeline: steady or suspicious jumps?', 'Pace analysis: hours per % progress'] },
                                { num: 5, label: 'Verdict Agent', mode: 'ai' as const, what: 'LLM synthesizes ALL findings into confidence → decision', checks: ['Sees all node verdicts + RAG context', 'Confidence 70%+ → Approve', 'Confidence <70% → Pending (human review)'] },
                            ].map((node) => (
                                <div key={node.num} className={cn(
                                    "p-2 rounded-lg border",
                                    node.mode === 'ai' ? "bg-violet-50/50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-800/40" :
                                        "bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/40"
                                )}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className={cn(
                                            "w-4 h-4 rounded-full border flex items-center justify-center text-xs font-bold shrink-0",
                                            node.mode === 'ai' ? "border-violet-400 bg-violet-100 dark:bg-violet-900/40 text-violet-600" :
                                                "border-slate-300 bg-slate-100 dark:bg-slate-800 text-slate-500"
                                        )}>{node.num}</div>
                                        <span className="text-xs font-bold text-foreground">{node.label}</span>
                                        {node.mode === 'ai' && <span className="text-xs px-1 rounded bg-violet-200 dark:bg-violet-800/40 text-violet-700 dark:text-violet-300 font-bold">AI</span>}
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
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Decision Tiers (Confidence-Based)</p>
                                <div className="flex gap-1.5">
                                    <div className="flex-1 p-1.5 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-center">
                                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">APPROVE</p>
                                        <p className="text-xs text-emerald-600 dark:text-emerald-500 font-semibold">70%+</p>
                                    </div>
                                    <div className="flex-1 p-1.5 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-center">
                                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">REVIEW</p>
                                        <p className="text-xs text-amber-600 dark:text-amber-500 font-semibold">&lt;70%</p>
                                    </div>
                                </div>
                            </div>

                            {/* Safety nets */}
                            <div className="border-t pt-2 space-y-1">
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Safety Nets</p>
                                <div className="space-y-0.5">
                                    {[
                                        { icon: <Timer className="w-2.5 h-2.5 text-amber-500" />, text: 'Circuit breaker: 15s per node, 55s pipeline guard' },
                                        { icon: <ShieldCheck className="w-2.5 h-2.5 text-emerald-500" />, text: 'Logic fallback if LLM fails — never auto-approve' },
                                        { icon: <Brain className="w-2.5 h-2.5 text-violet-500" />, text: 'RAG: AI uses topic knowledge + admin corrections from ChromaDB' },
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
                    </div>

                    <Button className="w-full" variant="outline" onClick={onBack}>
                        <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />{backLabel}
                    </Button>
                </div>
            </div>

            {/* Override Modal */}
            <OverrideModal
                entry={overrideModalOpen ? entry : null}
                open={overrideModalOpen}
                onClose={() => setOverrideModalOpen(false)}
            />
        </div>
    )
}
