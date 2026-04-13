/**
 * RoadmapGraph - A custom flowchart-style roadmap visualization matching roadmap.sh style.
 * Renders topic sections as connected nodes in a vertical staggered flow with a central spine.
 */
import { useMemo, useState } from 'react'
import type { TrainingPlan, Entry } from '@/lib/types'
import { CheckCircle2, Clock, Circle, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RoadmapGraphProps {
    plan: TrainingPlan
    entries?: Entry[]  // To calculate progress per topic
    hoursMultiplier?: number  // Personalized time estimation multiplier (default 1.0)
    topicEstimates?: Map<number, number>  // Per-topic estimated hours from API
    onTopicClick?: (topicId: number) => void
}

type TopicStatus = 'not-started' | 'in-progress' | 'completed'

interface TopicNode {
    topicId: number
    name: string
    hours: number
    nodeType: 'topic' | 'section'
    status: TopicStatus
    progress: number  // 0-100
    hoursLogged: number
    children: TopicNode[]
}

// Visual style constants
const SECTION_COLORS = [
    { bg: 'bg-violet-500/10', border: 'border-violet-500/40', text: 'text-violet-700 dark:text-violet-400', accent: 'bg-violet-500', icon: 'text-violet-500' },
    { bg: 'bg-blue-500/10', border: 'border-blue-500/40', text: 'text-blue-700 dark:text-blue-400', accent: 'bg-blue-500', icon: 'text-blue-500' },
    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-700 dark:text-emerald-400', accent: 'bg-emerald-500', icon: 'text-emerald-500' },
    { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-700 dark:text-amber-400', accent: 'bg-amber-500', icon: 'text-amber-500' },
    { bg: 'bg-rose-500/10', border: 'border-rose-500/40', text: 'text-rose-700 dark:text-rose-400', accent: 'bg-rose-500', icon: 'text-rose-500' },
    { bg: 'bg-cyan-500/10', border: 'border-cyan-500/40', text: 'text-cyan-700 dark:text-cyan-400', accent: 'bg-cyan-500', icon: 'text-cyan-500' },
]



function StatusIcon({ status }: { status: TopicStatus }) {
    switch (status) {
        case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        case 'in-progress': return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
        default: return <Circle className="h-4 w-4 text-muted-foreground opacity-50" />
    }
}

export default function RoadmapGraph({ plan, entries = [], hoursMultiplier = 1.0, topicEstimates, onTopicClick }: RoadmapGraphProps) {
    // Build topic nodes with progress data
    const nodes = useMemo(() => {
        // Group entries by topic
        const entryByTopic = new Map<number, { hours: number; count: number; isCompleted: boolean }>()
        for (const entry of entries) {
            const topicId = typeof entry.topic === 'number' ? entry.topic : entry.topic_details?.id
            if (topicId) {
                const existing = entryByTopic.get(topicId) || { hours: 0, count: 0, isCompleted: false }
                existing.hours += Number(entry.hours) || 0
                existing.count += 1
                if (entry.is_completed) existing.isCompleted = true
                entryByTopic.set(topicId, existing)
            }
        }

        // 1. Build flat map of TopicNodes
        const flatNodes = new Map<number, TopicNode>()
        const sortedPlanTopics = [...(plan.plan_topics || [])].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))

        for (const pt of sortedPlanTopics) {
            const topicId = pt.topic_id || pt.topic?.id || 0
            const name = pt.topic?.name || `Topic ${topicId}`
            const logData = entryByTopic.get(topicId) || { hours: 0, count: 0, isCompleted: false }
            // Use per-topic estimate from API if available; fall back to benchmark * global multiplier
            const perTopicHours = topicEstimates?.get(topicId)
            const expectedHours = perTopicHours !== undefined
                ? perTopicHours
                : Math.round(((Number(pt.expected_hours) || 0) * hoursMultiplier) * 10) / 10

            const progress = expectedHours > 0
                ? Math.min(100, Math.round((logData.hours / expectedHours) * 100))
                : (logData.hours > 0 ? 100 : 0)

            let status: TopicStatus = 'not-started'
            if (logData.isCompleted) status = 'completed'
            else if (logData.hours > 0) status = 'in-progress'

            flatNodes.set(topicId, {
                topicId,
                name,
                hours: expectedHours,
                nodeType: pt.node_type || 'topic',
                status,
                progress,
                hoursLogged: logData.hours,
                children: []
            })
        }

        // 2. Build tree structure
        const roots: TopicNode[] = []
        let currentSection: TopicNode | null = null

        for (const pt of sortedPlanTopics) {
            const topicId = pt.topic_id || pt.topic?.id || 0
            const node = flatNodes.get(topicId)
            if (!node) continue

            const parentId = pt.topic?.parent_id
            if (pt.node_type === 'section') {
                currentSection = node
                roots.push(node)
            } else if (parentId && flatNodes.has(parentId)) {
                // Topic has a parent that is also in this plan
                flatNodes.get(parentId)!.children.push(node)
            } else if (currentSection) {
                currentSection.children.push(node)
            } else {
                roots.push(node)
            }
        }

        // 3. Roll up status/hours for sections
        const rollup = (node: TopicNode) => {
            if (node.children.length > 0) {
                node.children.forEach(rollup)
                const allDone = node.children.every(c => c.status === 'completed')
                const anyStarted = node.children.some(c => c.status !== 'not-started')
                node.status = allDone ? 'completed' : anyStarted ? 'in-progress' : 'not-started'
                node.progress = Math.round(
                    node.children.reduce((sum, c) => sum + c.progress, 0) / node.children.length
                )
                node.hours = node.children.reduce((sum, c) => sum + c.hours, 0)
                node.hoursLogged = node.children.reduce((sum, c) => sum + c.hoursLogged, 0)
            }
        }
        roots.forEach(rollup)

        return roots
    }, [plan.plan_topics, entries, hoursMultiplier, topicEstimates])

    if (nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <BookOpen className="h-12 w-12 mb-4 opacity-50" />
                <p className="font-medium">No roadmap data</p>
                <p className="text-sm">This plan has no topics to visualize.</p>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Roadmap Flow - Staggered Layout */}
            <div className="relative pb-12 max-w-4xl mx-auto">
                {/* Central spine */}
                <div className="absolute left-4 sm:left-1/2 top-0 bottom-0 w-0.5 bg-border sm:-translate-x-1/2 z-0" />

                <div className="relative z-10 space-y-0">
                    {nodes.map((sectionNode, idx) => {
                        const isLeft = idx % 2 === 0
                        const colors = SECTION_COLORS[idx % SECTION_COLORS.length]

                        return (
                            <div key={sectionNode.topicId} className="relative group">
                                {/* Center dot on spine */}
                                <div className="absolute left-4 sm:left-1/2 -translate-x-[7px] sm:-translate-x-1/2 top-6 z-20">
                                    <div className={cn(
                                        "h-4 w-4 rounded-full ring-4 ring-background shadow-sm transition-colors",
                                        sectionNode.status === 'completed' ? 'bg-emerald-500' :
                                            sectionNode.status === 'in-progress' ? 'bg-blue-500 animate-pulse' :
                                                colors.accent
                                    )} />
                                </div>

                                {/* Section card */}
                                <div className={cn(
                                    "flex flex-col sm:flex-row items-start",
                                    isLeft ? "sm:justify-start sm:pr-[50%]" : "sm:justify-end sm:pl-[50%]",
                                    "pl-12 sm:pl-0"
                                )}>
                                    <div className={cn(
                                        "w-full sm:mx-8 rounded-xl border-2 p-4 transition-all duration-300",
                                        "hover:shadow-lg hover:scale-[1.01] bg-card",
                                        sectionNode.status === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5' :
                                            sectionNode.status === 'in-progress' ? 'border-blue-500/30 bg-blue-500/5' :
                                                colors.border,
                                    )}>
                                        {/* Section Header */}
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold text-white shadow-sm",
                                                    colors.accent
                                                )}>
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <h3 className={cn("font-bold text-sm", colors.text)}>{sectionNode.name}</h3>
                                                    <p className="text-xs text-muted-foreground font-medium">
                                                        {sectionNode.children.length} topics • {(Number(sectionNode.hoursLogged) || 0).toFixed(1)}h logged
                                                    </p>
                                                </div>
                                            </div>
                                            <StatusIcon status={sectionNode.status} />
                                        </div>

                                        {/* Child Topics Rendering */}
                                        {sectionNode.children.length > 0 && (
                                            <div className="space-y-2">
                                                {sectionNode.children.map(child => (
                                                    <TopicItem
                                                        key={child.topicId}
                                                        node={child}
                                                        onTopicClick={onTopicClick}
                                                        colors={colors}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Connector arm from spine to card (Desktop only) */}
                                <div className={cn(
                                    "hidden sm:block absolute top-7 h-0.5 opacity-30",
                                    colors.accent,
                                    isLeft ? "left-1/2 right-[50%]" : "left-[50%] right-1/2"
                                )}></div>

                                {/* Connector arm (Mobile) */}
                                <div className={cn(
                                    "sm:hidden absolute top-7 left-4 w-8 h-0.5 opacity-30",
                                    colors.accent
                                )}></div>

                                {/* Spacing */}
                                <div className="h-6" />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function TopicItem({ node, onTopicClick, colors, depth = 0 }: {
    node: TopicNode;
    onTopicClick?: (topicId: number) => void;
    colors: typeof SECTION_COLORS[0];
    depth?: number;
}) {
    const [expanded, setExpanded] = useState(false)
    const [resources, setResources] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [fetched, setFetched] = useState(false)

    const handleClick = () => {
        if (node.nodeType === 'section') return
        const willExpand = !expanded
        setExpanded(willExpand)
        // Notify parent (for any external tracking)
        onTopicClick?.(node.topicId)
        // Fetch resources on first expand
        if (willExpand && !fetched) {
            setLoading(true)
            import('@/lib/api').then(({ default: api }) => {
                api.get(`/topics/${node.topicId}/resources/`)
                    .then(res => setResources(res.data || []))
                    .catch(() => setResources([]))
                    .finally(() => {
                        setLoading(false)
                        setFetched(true)
                    })
            })
        }
    }

    const formatDuration = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
    const formatViews = (c: number) => c >= 1_000_000 ? `${(c / 1_000_000).toFixed(1)}M` : c >= 1_000 ? `${(c / 1_000).toFixed(0)}K` : String(c)

    return (
        <div className="space-y-1.5">
            <div
                className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all duration-200",
                    "hover:bg-accent/50 hover:shadow-sm group/topic",
                    node.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20' :
                        node.status === 'in-progress' ? 'bg-blue-500/5 border-blue-500/20' :
                            "bg-background/90",
                    depth > 0 ? "shadow-sm" : "",
                    expanded && "ring-1 ring-primary/30 shadow-md"
                )}
                onClick={handleClick}
            >
                <div className="pt-0.5">
                    <StatusIcon status={node.status} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                            "text-sm font-medium truncate capitalize",
                            node.status === 'completed' ? 'text-emerald-700 dark:text-emerald-400' :
                                node.status === 'in-progress' ? 'text-blue-700 dark:text-blue-400' :
                                    "text-foreground",
                            depth > 0 ? "text-[11px]" : ""
                        )}>
                            {node.name}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                            {node.hoursLogged.toFixed(1)}h
                        </span>
                    </div>

                    {/* Progress bar for in-progress items */}
                    {node.status === 'in-progress' && node.progress > 0 && (
                        <div className="mt-1.5 h-1 w-full bg-muted/50 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${node.progress}%` }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Inline Resources Panel */}
            {expanded && node.nodeType !== 'section' && (
                <div className="ml-5 border rounded-lg bg-muted/10 p-3 animate-in slide-in-from-top-2 duration-200 space-y-2">
                    {loading ? (
                        <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground">
                            <BookOpen className="h-3.5 w-3.5 animate-pulse" />
                            <span className="text-xs">Loading resources...</span>
                        </div>
                    ) : resources.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">No resources available for this topic yet.</p>
                    ) : (
                        resources.map((res: any) => (
                            <a
                                key={res.id}
                                href={res.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex gap-3 p-2 rounded-lg border bg-background/50 hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 group/res"
                            >
                                {/* Thumbnail */}
                                <div className="shrink-0 w-24 h-14 rounded overflow-hidden bg-muted">
                                    {res.thumbnail_url ? (
                                        <img src={res.thumbnail_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium line-clamp-2 group-hover/res:text-primary transition-colors">{res.title}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {res.channel_name} • {formatDuration(res.duration_minutes)} • {formatViews(res.view_count)} views
                                    </p>
                                </div>
                            </a>
                        ))
                    )}
                </div>
            )}

            {/* Recursive Children with L-shape line */}
            {node.children.length > 0 && (
                <div className="pl-4 ml-3.5 border-l border-dashed border-muted-foreground/30 space-y-1.5 pt-1 pb-1">
                    {node.children.map(child => (
                        <TopicItem
                            key={child.topicId}
                            node={child}
                            onTopicClick={onTopicClick}
                            colors={colors}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

