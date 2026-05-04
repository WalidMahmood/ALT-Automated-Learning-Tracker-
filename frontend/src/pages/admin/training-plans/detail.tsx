
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    ArrowLeft, Pencil, Trash2, BookOpen, Clock, Users,
    Plus, Save, X, UserPlus, FileText, CheckCircle2,
    Info, Brain, Play, RefreshCw,
    Loader2, MoreVertical, ArrowUpFromLine, ArrowDownFromLine, GripVertical
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { TopicPicker } from '@/components/forms/topic-picker'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { getDescendantTopics } from '@/lib/hierarchy'
import { useAppSelector } from '@/lib/store/hooks'
import api from '@/lib/api'
import type { TrainingPlan, PlanTopic, Topic, Entry } from '@/lib/types'
import { toast } from 'sonner'
import { LMSCoursesTab } from '@/components/lnd/lms-courses-tab'
import { PlanApprovalPanel } from '@/components/lnd/plan-approval-panel'

// ─── Roadmap Section Colors ───────────────────────────────
const SECTION_COLORS = [
    { bg: 'bg-violet-500/15', border: 'border-violet-500/50', text: 'text-violet-700 dark:text-violet-400', accent: 'bg-violet-500' },
    { bg: 'bg-blue-500/15', border: 'border-blue-500/50', text: 'text-blue-700 dark:text-blue-400', accent: 'bg-blue-500' },
    { bg: 'bg-emerald-500/15', border: 'border-emerald-500/50', text: 'text-emerald-700 dark:text-emerald-400', accent: 'bg-emerald-500' },
    { bg: 'bg-amber-500/15', border: 'border-amber-500/50', text: 'text-amber-700 dark:text-amber-400', accent: 'bg-amber-500' },
    { bg: 'bg-rose-500/15', border: 'border-rose-500/50', text: 'text-rose-700 dark:text-rose-400', accent: 'bg-rose-500' },
    { bg: 'bg-cyan-500/15', border: 'border-cyan-500/50', text: 'text-cyan-700 dark:text-cyan-400', accent: 'bg-cyan-500' },
    { bg: 'bg-orange-500/15', border: 'border-orange-500/50', text: 'text-orange-700 dark:text-orange-400', accent: 'bg-orange-500' },
    { bg: 'bg-pink-500/15', border: 'border-pink-500/50', text: 'text-pink-700 dark:text-pink-400', accent: 'bg-pink-500' },
]

// ─── Section node type ────────────────────────────────────
interface SectionNode {
    topicId: number
    name: string
    hours: number
    benchmarkHours: number
    nodeType: 'topic' | 'section'
    children: SectionNode[]
}

export default function TrainingPlanDetailPage() {
    const { id, userId } = useParams<{ id: string, userId?: string }>()
    const navigate = useNavigate()
    const { user } = useAppSelector((state) => state.auth)

    const [plan, setPlan] = useState<TrainingPlan | null>(null)
    const [topics, setTopics] = useState<Topic[]>([])
    const [sectionNodes, setSectionNodes] = useState<SectionNode[]>([])
    const [userEstimates, setUserEstimates] = useState<Record<number, number>>({})
    const [selectedUserEstimate, setSelectedUserEstimate] = useState<any | null>(null)
    const [allUsers, setAllUsers] = useState<any[]>([])
    const [userEntries, setUserEntries] = useState<Entry[]>([])
    const [loading, setLoading] = useState(true)
    const [mode, setMode] = useState<'view' | 'edit'>('view')
    const [formData, setFormData] = useState<Partial<TrainingPlan>>({
        plan_name: '',
        description: '',
        is_active: true,
        plan_topics: [],
    })

    // Generation state
    const [generatingResources, setGeneratingResources] = useState(false)
    const [generatingKB, setGeneratingKB] = useState(false)

    // Drag-and-drop state (edit mode)
    const [dragIndex, setDragIndex] = useState<number | null>(null)
    const [dropIndex, setDropIndex] = useState<number | null>(null)

    // Insert topic state (edit mode)
    const [insertAt, setInsertAt] = useState<{ index: number; position: 'above' | 'below' } | null>(null)
    const [genProgress, setGenProgress] = useState<{current?: number; total?: number; topic?: string} | null>(null)

    // Redirect non-admins
    if (user?.role !== 'admin') {
        return <Navigate to="/dashboard" replace />
    }

    // Fetch plan details, topics, and users
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const [planRes, topicsRes, usersRes] = await Promise.all([
                    api.get(`/training-plans/${id}/`),
                    api.get('/topics/'),
                    api.get('/users/')
                ])
                setPlan(planRes.data)
                setFormData(planRes.data)
                setTopics(topicsRes.data)
                const users = usersRes.data.results || (Array.isArray(usersRes.data) ? usersRes.data : [])
                setAllUsers(users)
            } catch (error) {
                console.error('Failed to fetch plan details:', error)
                toast.error('Failed to load training plan')
            } finally {
                setLoading(false)
            }
        }
        if (id) fetchData()

        // Fetch specific user estimate if userId is present
        if (id && userId) {
            api.get(`/training-plans/${id}/estimate/${userId}/`)
                .then(res => setSelectedUserEstimate(res.data))
                .catch(err => console.error('Failed to fetch user estimate', err))
            // Fetch user entries for completion tracking
            api.get(`/entries/`, { params: { user: userId, page_size: 500 } })
                .then(res => {
                    const data = res.data.results || (Array.isArray(res.data) ? res.data : [])
                    setUserEntries(data)
                })
                .catch(err => console.error('Failed to fetch user entries', err))
        } else {
            setSelectedUserEstimate(null)
            setUserEntries([])
        }
    }, [id, userId])

    const isView = mode === 'view'

    // ─── Build section nodes from plan_topics ─────────────────
    useEffect(() => {
        const planTopics = [...(formData.plan_topics || [])].sort(
            (a, b) => (a.sequence_order || 0) - (b.sequence_order || 0)
        )

        // 1. Build flat map
        const flatNodes = new Map<number, SectionNode>()
        for (const pt of planTopics) {
            const topicId = pt.topic_id || pt.topic?.id || 0
            const topicObj = topics.find(t => t.id === topicId)
            const topicName = pt.topic?.name || topicObj?.name || `Topic ${topicId}`
            const baseHours = Number(pt.expected_hours) || 0
            const multiplier = selectedUserEstimate?.multipliers?.total || 1.0
            const hours = baseHours * multiplier
            const benchmarkHours = Number(topicObj?.benchmark_hours) || 0

            flatNodes.set(topicId, {
                topicId,
                name: topicName,
                hours,
                benchmarkHours,
                nodeType: pt.node_type || 'topic',
                children: []
            })
        }

        // 2. Build tree
        const roots: SectionNode[] = []
        let currentSection: SectionNode | null = null

        for (const pt of planTopics) {
            const topicId = pt.topic_id || pt.topic?.id || 0
            const node = flatNodes.get(topicId)
            if (!node) continue

            const parentId = pt.topic?.parent_id
            if (pt.node_type === 'section') {
                currentSection = node
                roots.push(node)
            } else if (parentId && flatNodes.has(parentId)) {
                flatNodes.get(parentId)!.children.push(node)
            } else if (currentSection) {
                currentSection.children.push(node)
            } else {
                roots.push(node)
            }
        }

        // 3. Roll up hours for sections
        const rollup = (node: SectionNode) => {
            if (node.children.length > 0) {
                node.children.forEach(rollup)
                node.hours = node.children.reduce((sum, c) => sum + c.hours, 0)
                node.benchmarkHours = node.children.reduce((sum, c) => sum + c.benchmarkHours, 0)
            }
        }
        roots.forEach(rollup)

        setSectionNodes(roots)
    }, [formData.plan_topics, topics, selectedUserEstimate])

    // Fetch estimates for assigned users
    useEffect(() => {
        const fetchEstimates = async () => {
            if (!formData.assignments || formData.assignments.length === 0) return

            const estimates: Record<number, number> = {}

            await Promise.all(formData.assignments.map(async (a: any) => {
                try {
                    const userId = a.user?.id || a.user_id
                    const res = await api.get(`/training-plans/${id}/estimate/${userId}/`)
                    estimates[userId] = res.data.estimated_hours
                } catch (err) {
                    console.error(`Failed to fetch estimate for user ${a.user_id}`, err)
                }
            }))

            setUserEstimates(estimates)
        }

        if (isView && id) {
            fetchEstimates()
        }
    }, [formData.assignments, isView, id])

    const handleAssignUser = async (userId: number) => {
        if (!plan) return
        try {
            await api.post(`/training-plans/${plan.id}/assign/`, { user_ids: [userId] })
            const res = await api.get(`/training-plans/${plan.id}/`)
            setPlan(res.data)
            setFormData(res.data)
            toast.success('User assigned successfully')
        } catch (error) {
            console.error('Failed to assign user:', error)
            toast.error('Failed to assign user')
        }
    }

    const handleAddTopic = (topicId: number) => {
        if (isView) return
        const topic = topics.find(t => t.id === topicId)
        if (!topic) return

        const descendants = getDescendantTopics(topicId, topics)
        const topicsToAdd = [topic, ...descendants]

        const currentPlanTopics = formData.plan_topics || []
        const newTopics: PlanTopic[] = []
        let nextSequence = currentPlanTopics.length + 1

        for (const t of topicsToAdd) {
            if (currentPlanTopics.some(pt => (pt.topic_id || pt.topic?.id) === t.id)) {
                continue
            }
            newTopics.push({
                topic_id: t.id,
                topic: t,
                expected_hours: t.benchmark_hours,
                sequence_order: nextSequence++
            } as PlanTopic)
        }

        if (newTopics.length > 0) {
            setFormData({
                ...formData,
                plan_topics: [...currentPlanTopics, ...newTopics]
            })
        }
    }

    const handleRemoveTopic = (topicId: number) => {
        if (isView) return
        setFormData({
            ...formData,
            plan_topics: formData.plan_topics?.filter(pt => (pt.topic_id || pt.topic?.id) !== topicId)
        })
    }

    const handleUpdateHours = (topicId: number, hours: number) => {
        if (isView) return
        setFormData({
            ...formData,
            plan_topics: formData.plan_topics?.map(pt =>
                (pt.topic_id || pt.topic?.id) === topicId ? { ...pt, expected_hours: hours } : pt
            )
        })
    }

    // ─── Insert Topic Above/Below ─────────────────────────
    const handleInsertTopic = (topicId: number, refIndex: number, position: 'above' | 'below') => {
        if (isView) return
        const topic = topics.find(t => t.id === topicId)
        if (!topic) return

        const descendants = getDescendantTopics(topicId, topics)
        const topicsToAdd = [topic, ...descendants]
        const currentPlanTopics = [...(formData.plan_topics || [])].sort(
            (a, b) => (a.sequence_order || 0) - (b.sequence_order || 0)
        )

        const newTopics: PlanTopic[] = []
        for (const t of topicsToAdd) {
            if (currentPlanTopics.some(pt => (pt.topic_id || pt.topic?.id) === t.id)) continue
            newTopics.push({
                topic_id: t.id,
                topic: t,
                expected_hours: t.benchmark_hours,
                sequence_order: 0,
                node_type: t.parent_id ? 'topic' : 'topic',
            } as PlanTopic)
        }

        if (newTopics.length === 0) {
            setInsertAt(null)
            return
        }

        const insertIndex = position === 'above' ? refIndex : refIndex + 1
        const updated = [...currentPlanTopics]
        updated.splice(insertIndex, 0, ...newTopics)

        // Renumber sequence_order
        updated.forEach((pt, i) => { pt.sequence_order = i + 1 })

        setFormData({ ...formData, plan_topics: updated })
        setInsertAt(null)
    }

    // ─── Drag-and-Drop Reordering ─────────────────────────
    const handleDragStart = useCallback((index: number) => {
        setDragIndex(index)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropIndex(index)
    }, [])

    const handleDragEnd = useCallback(() => {
        setDragIndex(null)
        setDropIndex(null)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        if (dragIndex === null || dragIndex === targetIndex) {
            handleDragEnd()
            return
        }

        const sorted = [...(formData.plan_topics || [])].sort(
            (a, b) => (a.sequence_order || 0) - (b.sequence_order || 0)
        )

        const [moved] = sorted.splice(dragIndex, 1)
        sorted.splice(targetIndex, 0, moved)

        // Renumber
        sorted.forEach((pt, i) => { pt.sequence_order = i + 1 })

        setFormData({ ...formData, plan_topics: sorted })
        handleDragEnd()
    }, [dragIndex, formData, handleDragEnd])

    const handleSave = async () => {
        try {
            const response = await api.put(`/training-plans/${id}/`, formData)
            setPlan(response.data)
            setFormData(response.data)
            setMode('view')
            toast.success('Training plan updated')
        } catch (error) {
            console.error('Failed to save plan:', error)
            toast.error('Failed to save changes')
        }
    }

    const handleDelete = async () => {
        const confirmed = window.confirm('Archive this training plan? It will be moved to the archived tab.')
        if (confirmed) {
            try {
                await api.delete(`/training-plans/${id}/`)
                toast.success('Training plan archived')
                navigate('/admin/training-plans')
            } catch (error) {
                console.error('Failed to archive plan:', error)
                toast.error('Failed to archive plan')
            }
        }
    }

    const handleCancel = () => {
        if (plan) setFormData(plan)
        setMode('view')
    }

    // ─── Generation Handlers ──────────────────────────────
    const pollGeneration = async (taskId: string, type: 'resources' | 'kb') => {
        const setGenerating = type === 'resources' ? setGeneratingResources : setGeneratingKB
        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/topics/generation/status/${taskId}/`)
                const data = res.data
                if (data.progress) {
                    setGenProgress(data.progress)
                }
                if (data.status === 'SUCCESS' || data.status === 'FAILURE') {
                    clearInterval(interval)
                    setGenerating(false)
                    setGenProgress(null)
                    if (data.status === 'SUCCESS') {
                        const r = data.result || {}
                        const parts = []
                        if (r.generated > 0) parts.push(`${r.generated} generated`)
                        if (r.skipped > 0) parts.push(`${r.skipped} skipped`)
                        if (r.failed > 0) parts.push(`${r.failed} failed`)
                        const label = type === 'resources' ? 'Resource' : 'KB'
                        if (r.generated > 0) {
                            toast.success(`${label} generation done: ${parts.join(', ')}`)
                        } else if (r.failed > 0) {
                            toast.error(`${label} generation: ${parts.join(', ')}`)
                        } else {
                            toast.info(`${label} generation: ${parts.join(', ') || 'nothing to do'}`)
                        }
                        // Refresh plan data
                        const planRes = await api.get(`/training-plans/${id}/`)
                        setPlan(planRes.data)
                        setFormData(planRes.data)
                    } else {
                        toast.error(`Generation failed: ${data.error || 'Unknown error'}`)
                    }
                }
            } catch {
                clearInterval(interval)
                setGenerating(false)
                setGenProgress(null)
            }
        }, 3000)
    }

    const handleGenerateResources = async () => {
        if (!plan) return
        setGeneratingResources(true)
        setGenProgress(null)
        try {
            const res = await api.post('/topics/resources/generate/', { plan_id: plan.id, force: true })
            toast.info('Resource generation started...')
            pollGeneration(res.data.task_id, 'resources')
        } catch (error: any) {
            setGeneratingResources(false)
            const msg = error?.response?.data?.error || 'Failed to start resource generation'
            toast.error(msg)
        }
    }

    const handleGenerateKB = async () => {
        if (!plan) return
        setGeneratingKB(true)
        setGenProgress(null)
        try {
            const res = await api.post('/topics/knowledge/generate/', { plan_id: plan.id })
            toast.info('KB generation started...')
            pollGeneration(res.data.task_id, 'kb')
        } catch (error: any) {
            setGeneratingKB(false)
            const msg = error?.response?.data?.error || 'Failed to start KB generation'
            toast.error(msg)
        }
    }

    const totalHours = formData.plan_topics?.reduce((sum, pt) => sum + Number(pt.expected_hours), 0) || 0
    const totalTopicCount = (formData.plan_topics || []).filter(pt => pt.node_type !== 'section').length

    // Users already assigned
    const assignedUserIds = new Set((formData.assignments || []).map((a: any) => a.user_id || a.user?.id))
    const unassignedUsers = allUsers.filter((u: any) => u.role === 'learner' && !assignedUserIds.has(u.id))

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center space-y-3">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                    <p className="text-muted-foreground text-sm">Loading training plan...</p>
                </div>
            </div>
        )
    }

    if (!plan) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center space-y-3">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">Training plan not found</p>
                    <Button variant="outline" onClick={() => navigate('/admin/training-plans')}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Plans
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => userId ? navigate(`/admin/training-plans/${id}`) : navigate('/admin/training-plans')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {isView ? (userId ? `Personalized Plan: ${formData.plan_name}` : formData.plan_name) : 'Edit Training Plan'}
                            </h1>
                            <Badge variant={formData.is_archived ? 'outline' : (formData.is_active ? 'default' : 'secondary')}>
                                {formData.is_archived ? 'Archived' : (formData.is_active ? 'Active' : 'Draft')}
                            </Badge>
                            {userId && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    Est. for User #{userId}
                                </Badge>
                            )}
                            {selectedUserEstimate?.breakdown && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1 cursor-help hover:opacity-80 transition-opacity">
                                                <Badge variant="secondary" className="gap-1.5 h-6 px-2 bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                                                    <Clock className="h-3 w-3" />
                                                    {Math.round(selectedUserEstimate.estimated_hours)}h
                                                </Badge>
                                                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="p-0 overflow-hidden border-none shadow-xl" side="bottom" align="start">
                                            <div className="w-64">
                                                <div className="bg-white dark:bg-slate-950 p-4 space-y-4">
                                                    <div className="flex items-center justify-between border-b pb-2">
                                                        <span className="text-sm font-semibold">Estimation V2 Breakdown</span>
                                                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tight">Context-Aware</Badge>
                                                    </div>

                                                    <div className="space-y-3 mt-2">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <p className="text-xs font-medium">Base Benchmark</p>
                                                                <p className="text-[11px] text-muted-foreground italic">Template default</p>
                                                            </div>
                                                            <span className="text-sm font-mono">{selectedUserEstimate.benchmark_hours}h</span>
                                                        </div>

                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <p className="text-xs font-medium">Speed Factor</p>
                                                                <p className="text-[11px] text-muted-foreground italic">Exp & Expertise</p>
                                                            </div>
                                                            <span className={cn(
                                                                "text-sm font-mono",
                                                                selectedUserEstimate.breakdown.global_speed_factor < 1 ? "text-emerald-600" : "text-amber-600"
                                                            )}>
                                                                x{selectedUserEstimate.breakdown.global_speed_factor}
                                                            </span>
                                                        </div>

                                                        {selectedUserEstimate.breakdown.domain_penalty_hours > 0 && (
                                                            <div className="flex justify-between items-start pt-1 border-t border-dashed">
                                                                <div>
                                                                    <p className="text-xs font-medium text-amber-700 dark:text-amber-500">Domain Penalty</p>
                                                                    <p className="text-[11px] text-muted-foreground italic">Context switching cost</p>
                                                                </div>
                                                                <span className="text-sm font-mono text-amber-600">+{selectedUserEstimate.breakdown.domain_penalty_hours}h</span>
                                                            </div>
                                                        )}

                                                        {selectedUserEstimate.breakdown.language_penalty_hours > 0 && (
                                                            <div className="flex justify-between items-start pt-1 border-t border-dashed">
                                                                <div>
                                                                    <p className="text-xs font-medium text-rose-700 dark:text-rose-500">Language Friction</p>
                                                                    <p className="text-[11px] text-muted-foreground italic">Syntax/Tool unfamiliarity</p>
                                                                </div>
                                                                <span className="text-sm font-mono text-rose-600">+{selectedUserEstimate.breakdown.language_penalty_hours}h</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="pt-3 border-t flex justify-between items-center bg-emerald-50/50 dark:bg-emerald-950/20 -mx-4 px-4 py-2 mt-2">
                                                        <span className="text-sm font-bold">Total Estimated</span>
                                                        <span className="text-base font-black text-emerald-700 dark:text-emerald-400">
                                                            {Math.round(selectedUserEstimate.estimated_hours)}h
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {isView ? (formData.description || 'No description') : 'Modify settings, topics, and assignments'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isView ? (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleGenerateResources}
                                disabled={generatingResources || generatingKB}
                                className="gap-1.5 text-xs"
                            >
                                {generatingResources ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 text-red-500" />}
                                {generatingResources ? 'Generating...' : 'Generate Resources'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleGenerateKB}
                                disabled={generatingResources || generatingKB}
                                className="gap-1.5 text-xs"
                            >
                                {generatingKB ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5 text-purple-500" />}
                                {generatingKB ? 'Generating...' : 'Generate KB'}
                            </Button>
                            <Button variant="outline" onClick={() => setMode('edit')} className="gap-2">
                                <Pencil className="h-4 w-4" /> Edit
                            </Button>
                            <Button variant="ghost" onClick={handleDelete} className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" /> Archive
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={handleCancel} className="gap-2">
                                <X className="h-4 w-4" /> Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={!formData.plan_name || formData.plan_topics?.length === 0} className="gap-2">
                                <Save className="h-4 w-4" /> Save Changes
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <BookOpen className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalTopicCount}</p>
                            <p className="text-xs text-muted-foreground">Topics</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalHours.toFixed(0)}</p>
                            <p className="text-xs text-muted-foreground">Total Hours</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <Users className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{(formData.assignments || []).length}</p>
                            <p className="text-xs text-muted-foreground">Assigned Users</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Generation Progress */}
            {(generatingResources || generatingKB) && genProgress && (
                <Card className="border-primary/30 bg-primary/5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">
                                    {generatingResources ? 'Generating Resources' : 'Generating KB'}
                                    {genProgress.current && genProgress.total ? ` (${genProgress.current}/${genProgress.total})` : ''}
                                </p>
                                {genProgress.topic && (
                                    <p className="text-xs text-muted-foreground truncate">Processing: {genProgress.topic}</p>
                                )}
                            </div>
                            {genProgress.current && genProgress.total && (
                                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary rounded-full transition-all duration-500"
                                        style={{ width: `${(genProgress.current / genProgress.total) * 100}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Plan Info (edit mode only) */}
            {!isView && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Plan Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="plan_name">Plan Name</Label>
                                <Input
                                    id="plan_name"
                                    value={formData.plan_name}
                                    onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                                    placeholder="e.g., Junior Frontend Bootcamp"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                <Select
                                    value={formData.is_active ? 'active' : 'draft'}
                                    onValueChange={(v) => setFormData({ ...formData, is_active: v === 'active' })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active (Available for assignment)</SelectItem>
                                        <SelectItem value="draft">Draft (Admin only)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Plan Objective / Target Role</Label>
                            <Input
                                id="description"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe the goal of this path..."
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Assigned Users */}
            {isView && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CardTitle className="text-base">Assigned Users</CardTitle>
                                <Badge variant="secondary" className="text-xs h-5 px-1.5 font-medium bg-muted/50">
                                    {(formData.assignments || []).length} assigned
                                </Badge>
                            </div>
                            {unassignedUsers.length > 0 && (
                                <Select onValueChange={(v) => handleAssignUser(Number(v))}>
                                    <SelectTrigger className="w-[200px] h-8 text-xs">
                                        <div className="flex items-center gap-1.5">
                                            <UserPlus className="h-3 w-3" />
                                            <SelectValue placeholder="Assign learner..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {unassignedUsers.map((u: any) => (
                                            <SelectItem key={u.id} value={String(u.id)}>
                                                {u.full_name || u.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {(formData.assignments || []).length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 border rounded-lg border-dashed bg-muted/30">
                                <Users className="h-8 w-8 text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">No learners assigned yet</p>
                                <p className="text-xs text-muted-foreground mt-1">Use the dropdown above to assign learners</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {(formData.assignments || []).map((assignment: any) => (
                                    <div
                                        key={assignment.id}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                            (assignment.user?.id || assignment.user_id) == userId ? "bg-primary/10 border-primary shadow-sm" : "bg-muted/30 hover:bg-muted/50"
                                        )}
                                        onClick={() => navigate(`/admin/training-plans/${id}/user/${assignment.user?.id || assignment.user_id}`)}
                                    >
                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                                            {(assignment.user?.full_name || assignment.user?.email || '?')[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {assignment.user?.full_name || assignment.user?.email || `User #${assignment.user_id}`}
                                            </p>
                                            <p className="text-xs text-muted-foreground flex items-center gap-2">
                                                {assignment.assigned_at ? `Assigned ${format(new Date(assignment.assigned_at), 'MMM d, yyyy')}` : ''}
                                                {userEstimates[assignment.user?.id || assignment.user_id] && (
                                                    <span className="flex items-center gap-1 text-primary font-medium">
                                                        • Est. ~{Math.round(userEstimates[assignment.user?.id || assignment.user_id])}h
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Plan Approval Workflow */}
            {isView && plan && (
                <PlanApprovalPanel planId={plan.id} planName={plan.plan_name} />
            )}

            {/* Topics — Edit mode: flat list with add/remove; View mode: roadmap graph */}
            {!isView && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CardTitle className="text-base">Topics</CardTitle>
                                <Badge variant="secondary" className="text-xs h-5 px-1.5 font-medium bg-muted/50">
                                    {totalHours.toFixed(1)}h total
                                </Badge>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-7 px-2 text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                                    onClick={() => window.open('/admin/topics', '_blank')}
                                >
                                    <Plus className="mr-1 h-3 w-3" />
                                    Create New Topic
                                </Button>
                                <div className="w-56">
                                    <TopicPicker
                                        allTopics={topics}
                                        excludeTopicIds={formData.plan_topics?.map(pt => pt.topic_id || pt.topic?.id).filter((id): id is number => id !== undefined) || []}
                                        onSelect={(id) => handleAddTopic(id)}
                                        placeholder="Add Topic..."
                                    />
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                            {(!formData.plan_topics || formData.plan_topics.length === 0) ? (
                                <div className="flex flex-col items-center justify-center py-12 border rounded-lg border-dashed border-2 bg-muted/30">
                                    <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
                                    <p className="text-sm text-muted-foreground font-medium">No topics added yet</p>
                                    <p className="text-xs text-muted-foreground mt-1">Use the topic picker above to add topics</p>
                                </div>
                            ) : (
                                formData.plan_topics
                                    .slice()
                                    .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
                                    .map((pt, index) => {
                                        const topicId = pt.topic_id || pt.topic?.id || 0
                                        const topicName = pt.topic?.name || topics.find(t => t.id === topicId)?.name || 'Unknown'
                                        const isSection = pt.node_type === 'section'
                                        const isDragging = dragIndex === index
                                        const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index
                                        return (
                                            <div key={`${topicId}-${index}`} className="space-y-1">
                                                {/* Insert-above picker */}
                                                {insertAt?.index === index && insertAt?.position === 'above' && (
                                                    <div className="flex items-center gap-2 p-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 animate-in fade-in slide-in-from-top-1 duration-200">
                                                        <ArrowUpFromLine className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        <div className="flex-1">
                                                            <TopicPicker
                                                                allTopics={topics}
                                                                excludeTopicIds={formData.plan_topics?.map(p => p.topic_id || p.topic?.id).filter((id): id is number => id !== undefined) || []}
                                                                onSelect={(id) => handleInsertTopic(id, index, 'above')}
                                                                placeholder="Select topic to insert above..."
                                                            />
                                                        </div>
                                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setInsertAt(null)}>
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Topic row */}
                                                <div
                                                    draggable
                                                    onDragStart={() => handleDragStart(index)}
                                                    onDragOver={(e) => handleDragOver(e, index)}
                                                    onDragEnd={handleDragEnd}
                                                    onDrop={(e) => handleDrop(e, index)}
                                                    className={cn(
                                                        "flex items-center gap-2 p-2.5 rounded-lg border transition-all duration-150",
                                                        isSection ? "bg-muted/50 border-dashed font-semibold" : "bg-card hover:bg-muted/30",
                                                        isDragging && "opacity-40 scale-[0.97] ring-1 ring-primary/30",
                                                        isDropTarget && "border-primary border-2 bg-primary/5 shadow-sm"
                                                    )}
                                                >
                                                    {/* Drag handle */}
                                                    <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                                                        <GripVertical className="h-4 w-4" />
                                                    </div>

                                                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                                                        {isSection ? '§' : '•'}
                                                    </div>
                                                    <p className={cn("flex-1 truncate text-sm", isSection ? "font-semibold" : "font-medium")}>
                                                        {topicName}
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        {isSection ? (
                                                            <span className="text-sm font-medium text-primary min-w-[3rem] text-center">
                                                                {Number(pt.expected_hours).toFixed(1)}
                                                            </span>
                                                        ) : (
                                                            <Input
                                                                type="number"
                                                                className="w-16 h-7 text-xs px-2"
                                                                value={pt.expected_hours}
                                                                onChange={e => handleUpdateHours(topicId, Number(e.target.value))}
                                                                step="0.5"
                                                                min="0"
                                                            />
                                                        )}
                                                        <span className="text-xs text-muted-foreground w-3">h</span>
                                                    </div>

                                                    {/* Dropdown menu */}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                                                <MoreVertical className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-44">
                                                            <DropdownMenuItem onClick={() => setInsertAt({ index, position: 'above' })}>
                                                                <ArrowUpFromLine className="h-3.5 w-3.5 mr-2" />
                                                                Insert above
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setInsertAt({ index, position: 'below' })}>
                                                                <ArrowDownFromLine className="h-3.5 w-3.5 mr-2" />
                                                                Insert below
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                onClick={() => handleRemoveTopic(topicId)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                                                Remove
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>

                                                {/* Insert-below picker */}
                                                {insertAt?.index === index && insertAt?.position === 'below' && (
                                                    <div className="flex items-center gap-2 p-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                                        <ArrowDownFromLine className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        <div className="flex-1">
                                                            <TopicPicker
                                                                allTopics={topics}
                                                                excludeTopicIds={formData.plan_topics?.map(p => p.topic_id || p.topic?.id).filter((id): id is number => id !== undefined) || []}
                                                                onSelect={(id) => handleInsertTopic(id, index, 'below')}
                                                                placeholder="Select topic to insert below..."
                                                            />
                                                        </div>
                                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setInsertAt(null)}>
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* LMS Courses Tab — Edit mode only */}
            {!isView && (
                <LMSCoursesTab
                    existingLmsCourseIds={
                        (formData.plan_topics || [])
                            .filter((pt: any) => pt.source === 'lms' && pt.lms_course_id)
                            .map((pt: any) => pt.lms_course_id)
                    }
                    onAddCourse={(course) => {
                        const currentPlanTopics = formData.plan_topics || []
                        const nextSequence = currentPlanTopics.length + 1
                        const newPt = {
                            topic_id: null,
                            topic: null,
                            expected_hours: 8, // default for LMS courses
                            sequence_order: nextSequence,
                            node_type: 'topic',
                            source: 'lms',
                            lms_course_id: course.id,
                            lms_course_name: course.fullname,
                        } as any
                        setFormData({
                            ...formData,
                            plan_topics: [...currentPlanTopics, newPt],
                        })
                    }}
                    editable={true}
                />
            )}

            {/* Roadmap Graph — View mode only */}
            {isView && sectionNodes.length > 0 && (
                <div className="relative pb-12 max-w-4xl mx-auto">
                    {/* Central spine */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border -translate-x-1/2 z-0" />

                    <div className="relative z-10 space-y-0">
                        {sectionNodes.map((section, idx) => {
                            const isLeft = idx % 2 === 0
                            const colors = SECTION_COLORS[idx % SECTION_COLORS.length]

                            return (
                                <div key={section.topicId} className="relative group">
                                    {/* Center dot on spine */}
                                    <div className="absolute left-1/2 -translate-x-1/2 top-6 z-20">
                                        <div className={`h-4 w-4 rounded-full ${colors.accent} ring-4 ring-background shadow-lg transition-transform group-hover:scale-110`} />
                                    </div>

                                    {/* Section card — alternating left/right */}
                                    <div className={cn("flex", isLeft ? 'justify-start pr-[52%]' : 'justify-end pl-[52%]')}>
                                        <div className={cn(
                                            "w-full rounded-xl border-2 p-4 transition-all duration-300",
                                            "hover:shadow-xl hover:scale-[1.01] bg-card",
                                            colors.border
                                        )}>
                                            {/* Section header */}
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className={cn(
                                                    "flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold text-white shadow-sm",
                                                    colors.accent
                                                )}>
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={cn("font-bold text-sm tracking-tight capitalize", colors.text)}>
                                                        {section.name}
                                                    </h3>
                                                    <p className="text-[11px] font-medium text-muted-foreground">
                                                        {section.children.length} topics {userId
                                                            ? `• ~${section.hours.toFixed(0)}h est. / ${section.benchmarkHours.toFixed(0)}h benchmark`
                                                            : `• ${section.benchmarkHours.toFixed(0)}h benchmark`
                                                        }
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Recursive Topic nodes inside section */}
                                            {section.children.length > 0 && (
                                                <div className="space-y-2">
                                                    {section.children.map((child, cIdx) => (
                                                        <AdminTopicItem
                                                            key={cIdx}
                                                            node={child}
                                                            colors={colors}
                                                            userEntries={userEntries}
                                                            showProgress={!!userId}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Connector arm from spine to card */}
                                    <div className={cn(
                                        "absolute top-7 h-0.5 opacity-30",
                                        colors.accent,
                                        isLeft ? 'left-1/2 right-[52%]' : 'left-[52%] right-1/2'
                                    )} />

                                    {/* Spacing */}
                                    <div className="h-8" />
                                </div>
                            )
                        })}

                        {/* End marker */}
                        <div className="flex justify-center pt-4">
                            <div className="flex items-center gap-2 px-6 py-2 rounded-full bg-white border border-border shadow-sm">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold text-foreground">
                                    {formData.plan_name} Path
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {/* Empty state for view mode */}
            {isView && sectionNodes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
                    <BookOpen className="h-12 w-12 mb-4 opacity-50" />
                    <p className="font-medium">No roadmap data</p>
                    <p className="text-sm">This plan has no topics to visualize.</p>
                </div>
            )}
        </div>
    )
}

function AdminTopicItem({ node, colors, depth = 0, userEntries = [], showProgress = false }: {
    node: SectionNode;
    colors: typeof SECTION_COLORS[0];
    depth?: number;
    userEntries?: Entry[];
    showProgress?: boolean;
}) {
    const [expanded, setExpanded] = useState(false)
    const [activeTab, setActiveTab] = useState<'resources' | 'kb'>('resources')
    const [resources, setResources] = useState<any[]>([])
    const [kb, setKb] = useState<any>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [regenerating, setRegenerating] = useState(false)
    const [kbEditing, setKbEditing] = useState(false)
    const [kbForm, setKbForm] = useState<any>({})

    // Determine completion status from user entries' is_completed field
    const topicEntries = userEntries.filter(e => e.topic === node.topicId)
    const isCompleted = topicEntries.some(e => e.is_completed)
    const isInProgress = !isCompleted && topicEntries.length > 0
    const totalHoursLogged = topicEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0)

    // Fetch resources + KB on expand
    const handleExpand = async () => {
        if (node.nodeType === 'section') return
        const willExpand = !expanded
        setExpanded(willExpand)
        if (willExpand && resources.length === 0 && !kb) {
            setDetailLoading(true)
            try {
                const [resRes, kbRes] = await Promise.all([
                    api.get(`/topics/${node.topicId}/resources/`),
                    api.get(`/topics/knowledge/${node.topicId}/`),
                ])
                setResources(resRes.data || [])
                setKb(kbRes.data?.exists ? kbRes.data : null)
                if (kbRes.data?.exists) {
                    setKbForm({
                        what_it_is: kbRes.data.what_it_is || '',
                        what_you_will_learn: kbRes.data.what_you_will_learn || [],
                        subtopics: kbRes.data.subtopics || [],
                        validation_keywords: kbRes.data.validation_keywords || [],
                    })
                }
            } catch { /* silently handle */ }
            setDetailLoading(false)
        }
    }

    const handleDeleteResource = async (resourceId: number) => {
        try {
            await api.delete(`/topics/resources/${resourceId}/`)
            setResources(prev => prev.filter(r => r.id !== resourceId))
            toast.success('Resource removed')
        } catch {
            toast.error('Failed to remove resource')
        }
    }

    const handleRegenerateResource = async () => {
        setRegenerating(true)
        try {
            const res = await api.post('/topics/resources/generate/', {
                topic_id: node.topicId,
                force: true,
            })
            toast.info(`Regenerating resource for "${node.name}"...`)
            // Poll for completion
            const taskId = res.data.task_id
            const poll = setInterval(async () => {
                try {
                    const status = await api.get(`/topics/generation/status/${taskId}/`)
                    if (status.data.status === 'SUCCESS' || status.data.status === 'FAILURE') {
                        clearInterval(poll)
                        setRegenerating(false)
                        if (status.data.status === 'SUCCESS') {
                            toast.success(`Resource regenerated for "${node.name}"`)
                            // Refresh resources
                            const resRes = await api.get(`/topics/${node.topicId}/resources/`)
                            setResources(resRes.data || [])
                        } else {
                            toast.error('Regeneration failed')
                        }
                    }
                } catch {
                    clearInterval(poll)
                    setRegenerating(false)
                }
            }, 2000)
        } catch {
            setRegenerating(false)
            toast.error('Failed to start regeneration')
        }
    }

    const handleSaveKb = async () => {
        try {
            const res = await api.patch(`/topics/knowledge/${node.topicId}/`, kbForm)
            setKb(res.data)
            setKbEditing(false)
            toast.success('KB updated')
        } catch {
            toast.error('Failed to update KB')
        }
    }

    const formatDuration = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
    const formatViews = (c: number) => c >= 1_000_000 ? `${(c / 1_000_000).toFixed(1)}M` : c >= 1_000 ? `${(c / 1_000).toFixed(0)}K` : String(c)

    return (
        <div className="space-y-1.5">
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer",
                    "bg-white dark:bg-slate-900 border-border hover:shadow-md transition-all duration-200 group/item",
                    depth > 0 ? "shadow-sm" : "",
                    expanded && "ring-1 ring-primary/30 shadow-md",
                    showProgress && isCompleted && "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20",
                    showProgress && isInProgress && "border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/10"
                )}
                onClick={handleExpand}
            >
                {showProgress && node.nodeType !== 'section' ? (
                    <div className="shrink-0">
                        {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : isInProgress ? (
                            <Clock className="h-4 w-4 text-blue-500" />
                        ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                        )}
                    </div>
                ) : (
                    <div className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0 transition-transform group-hover/item:scale-125",
                        colors.accent
                    )} />
                )}
                <span className={cn(
                    "text-xs font-semibold flex-1 truncate capitalize tracking-tight",
                    depth > 0 ? "text-[11px] font-medium" : "text-foreground"
                )}>
                    {node.name}
                </span>

                {/* Resource count + KB status indicators */}
                {node.nodeType !== 'section' && !showProgress && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        {resources.length > 0 ? (
                            <span className="text-[9px] font-mono text-red-600 dark:text-red-400 whitespace-nowrap bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded leading-none flex items-center gap-0.5" title="YouTube resources">
                                <Play className="h-2.5 w-2.5" />{resources.length}
                            </span>
                        ) : expanded && !detailLoading ? (
                            <span className="text-[9px] text-muted-foreground/50 whitespace-nowrap">No videos</span>
                        ) : null}
                        {kb ? (
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="KB exists" />
                        ) : expanded && !detailLoading ? (
                            <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" title="No KB" />
                        ) : null}
                    </div>
                )}

                {showProgress ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                        {totalHoursLogged > 0 && (
                            <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded leading-none" title="Hours logged">
                                {totalHoursLogged.toFixed(1)}h <span className="text-[8px] opacity-70">logged</span>
                            </span>
                        )}
                        <span className="text-[10px] font-mono text-violet-600 dark:text-violet-400 whitespace-nowrap bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded leading-none" title="Estimated hours">
                            {node.hours.toFixed(1)}h <span className="text-[8px] opacity-70">est.</span>
                        </span>
                        {node.benchmarkHours > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap bg-muted/50 px-1.5 py-0.5 rounded leading-none" title="Benchmark hours">
                                {node.benchmarkHours.toFixed(1)}h <span className="text-[8px] opacity-70">bench.</span>
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap bg-muted/50 px-1.5 py-0.5 rounded leading-none" title="Benchmark hours">
                        {node.benchmarkHours > 0 ? `${node.benchmarkHours.toFixed(1)}h` : `${node.hours.toFixed(1)}h`}
                    </span>
                )}
            </div>

            {/* Expandable Detail Panel */}
            {expanded && node.nodeType !== 'section' && (
                <div className="ml-5 border rounded-lg bg-muted/10 p-3 animate-in slide-in-from-top-2 duration-200 space-y-3">
                    {/* Tabs */}
                    <div className="flex gap-1 border-b pb-2">
                        <button
                            className={cn(
                                "text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
                                activeTab === 'resources' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                            )}
                            onClick={() => setActiveTab('resources')}
                        >
                            <Play className="h-3 w-3 inline mr-1" />Resources ({resources.length})
                        </button>
                        <button
                            className={cn(
                                "text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
                                activeTab === 'kb' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                            )}
                            onClick={() => setActiveTab('kb')}
                        >
                            <Brain className="h-3 w-3 inline mr-1" />Knowledge {kb ? '✓' : '✗'}
                        </button>
                    </div>

                    {detailLoading ? (
                        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-xs">Loading...</span>
                        </div>
                    ) : activeTab === 'resources' ? (
                        /* Resources Tab */
                        <div className="space-y-2">
                            <div className="flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] gap-1"
                                    disabled={regenerating}
                                    onClick={(e) => { e.stopPropagation(); handleRegenerateResource() }}
                                >
                                    {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                    {regenerating ? 'Regenerating...' : 'Regenerate'}
                                </Button>
                            </div>
                            {resources.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-3">No resources yet. Click "Regenerate" or use bulk "Generate Resources".</p>
                            ) : (
                                resources.map((res: any) => (
                                    <div key={res.id} className="flex gap-2 items-start p-2 rounded border bg-background/80 group/res">
                                        {/* Thumbnail */}
                                        <a href={res.url} target="_blank" rel="noopener noreferrer" className="shrink-0 w-24 h-14 rounded overflow-hidden bg-muted block">
                                            {res.thumbnail_url ? (
                                                <img src={res.thumbnail_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center"><Play className="h-4 w-4 text-muted-foreground" /></div>
                                            )}
                                        </a>
                                        <div className="flex-1 min-w-0">
                                            <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium line-clamp-2 hover:text-primary transition-colors">
                                                {res.title}
                                            </a>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{res.channel_name} • {formatDuration(res.duration_minutes)} • {formatViews(res.view_count)} views</p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 opacity-0 group-hover/res:opacity-100 text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDeleteResource(res.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        /* KB Tab */
                        <div className="space-y-3">
                            {!kb ? (
                                <p className="text-xs text-muted-foreground text-center py-3">No KB entry for this topic. Use "Generate KB" to create one.</p>
                            ) : kbEditing ? (
                                <div className="space-y-3">
                                    <div>
                                        <Label className="text-[11px] font-medium">What it is</Label>
                                        <Input
                                            className="text-xs h-8 mt-1"
                                            value={kbForm.what_it_is}
                                            onChange={e => setKbForm({ ...kbForm, what_it_is: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-medium">What you will learn (one per line)</Label>
                                        <textarea
                                            className="w-full text-xs border rounded-md p-2 mt-1 bg-background min-h-[80px] resize-y"
                                            value={(kbForm.what_you_will_learn || []).join('\n')}
                                            onChange={e => setKbForm({ ...kbForm, what_you_will_learn: e.target.value.split('\n').filter(Boolean) })}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-medium">Subtopics (comma-separated)</Label>
                                        <Input
                                            className="text-xs h-8 mt-1"
                                            value={(kbForm.subtopics || []).join(', ')}
                                            onChange={e => setKbForm({ ...kbForm, subtopics: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-medium">Validation Keywords (comma-separated)</Label>
                                        <Input
                                            className="text-xs h-8 mt-1"
                                            value={(kbForm.validation_keywords || []).join(', ')}
                                            onChange={e => setKbForm({ ...kbForm, validation_keywords: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveKb}>
                                            <Save className="h-3 w-3" />Save KB
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setKbEditing(false)}>Cancel</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div>
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">What it is</p>
                                        <p className="text-xs mt-0.5">{kb.what_it_is}</p>
                                    </div>
                                    {kb.what_you_will_learn?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">What you will learn</p>
                                            <ul className="mt-0.5 space-y-0.5">
                                                {kb.what_you_will_learn.slice(0, 5).map((item: string, i: number) => (
                                                    <li key={i} className="text-[11px] text-foreground/80">• {item}</li>
                                                ))}
                                                {kb.what_you_will_learn.length > 5 && (
                                                    <li className="text-[10px] text-muted-foreground italic">+{kb.what_you_will_learn.length - 5} more</li>
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                    {kb.subtopics?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Subtopics</p>
                                            <div className="flex flex-wrap gap-1 mt-0.5">
                                                {kb.subtopics.slice(0, 8).map((s: string, i: number) => (
                                                    <Badge key={i} variant="secondary" className="text-[9px] h-4 px-1.5">{s}</Badge>
                                                ))}
                                                {kb.subtopics.length > 8 && (
                                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">+{kb.subtopics.length - 8}</Badge>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 mt-1" onClick={() => setKbEditing(true)}>
                                        <Pencil className="h-2.5 w-2.5" />Edit KB
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Recursive Children with L-shape line */}
            {node.children.length > 0 && (
                <div className="pl-4 ml-3.5 border-l border-dashed border-muted-foreground/30 space-y-1.5 pt-1 pb-1">
                    {node.children.map((child, cIdx) => (
                        <AdminTopicItem
                            key={cIdx}
                            node={child}
                            colors={colors}
                            depth={depth + 1}
                            userEntries={userEntries}
                            showProgress={showProgress}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
