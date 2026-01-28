
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, FileText, Users, Pencil, Trash2, BookOpen, Clock, Eye } from 'lucide-react'
import { format } from 'date-fns'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { TopicPicker } from '@/components/forms/topic-picker'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import type { TrainingPlan, PlanTopic, Topic } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { Filter } from 'lucide-react'
import api from '@/lib/api'

export default function TrainingPlansPage() {
    const { user } = useAppSelector((state) => state.auth)
    const [plans, setPlans] = useState<TrainingPlan[]>([])
    const [topics, setTopics] = useState<Topic[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'archived'>('all')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingPlan, setEditingPlan] = useState<TrainingPlan | null>(null)
    const [dialogMode, setDialogMode] = useState<'view' | 'edit' | 'create'>('create')

    // Fetch plans and topics from API
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [plansRes, topicsRes] = await Promise.all([
                    api.get('/training-plans/'),
                    api.get('/topics/')
                ])
                setPlans(plansRes.data)
                setTopics(topicsRes.data)
            } catch (error) {
                console.error('Failed to fetch data:', error)
            }
        }
        fetchData()
    }, [])

    // Redirect non-admins
    if (user?.role !== 'admin') {
        return <Navigate to="/dashboard" replace />
    }

    const filteredPlans = useMemo(() => {
        return plans.filter((plan) => {
            const matchesSearch = plan.plan_name.toLowerCase().includes(searchQuery.toLowerCase())

            // Filter by status
            let matchesStatus = true
            if (statusFilter === 'archived') {
                matchesStatus = plan.is_archived === true
            } else if (statusFilter === 'active') {
                matchesStatus = plan.is_active && !plan.is_archived
            } else if (statusFilter === 'draft') {
                matchesStatus = !plan.is_active && !plan.is_archived
            } else if (statusFilter === 'all') {
                matchesStatus = !plan.is_archived // All active/draft, but not archived
            }

            return matchesSearch && matchesStatus
        })
    }, [searchQuery, statusFilter, plans])

    const handleCreate = () => {
        setEditingPlan(null)
        setDialogMode('create')
        setIsDialogOpen(true)
    }

    const handleView = (plan: TrainingPlan) => {
        setEditingPlan(plan)
        setDialogMode('view')
        setIsDialogOpen(true)
    }


    const handleDelete = async (id: number) => {
        const confirmed = window.confirm('Archive this training plan? It will be moved to the archived tab.')
        if (confirmed) {
            try {
                await api.delete(`/training-plans/${id}/`)
                setPlans(prev => prev.map(p => p.id === id ? { ...p, is_archived: true } : p))
                setIsDialogOpen(false)
                setEditingPlan(null)
            } catch (error) {
                console.error('Failed to archive plan:', error)
            }
        }
    }

    const handleRestore = async (id: number) => {
        const confirmed = window.confirm('Restore this training plan from archive?')
        if (confirmed) {
            try {
                await api.post(`/training-plans/${id}/restore/`)
                setPlans(prev => prev.map(p => p.id === id ? { ...p, is_archived: false } : p))
            } catch (error) {
                console.error('Failed to restore plan:', error)
            }
        }
    }

    const handleSave = async (planData: Partial<TrainingPlan>) => {
        try {
            if (editingPlan) {
                // Update existing plan
                const response = await api.put(`/training-plans/${editingPlan.id}/`, planData)
                setPlans(prev => prev.map(p => p.id === editingPlan.id ? response.data : p))
            } else {
                // Create new plan
                const response = await api.post('/training-plans/', planData)
                setPlans(prev => [...prev, response.data])
            }
            setIsDialogOpen(false)
            setEditingPlan(null)
        } catch (error) {
            console.error('Failed to save plan:', error)
        }
    }

    return (

        <>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Training Plans</h1>
                        <p className="text-muted-foreground">
                            Manage learning paths and assignments
                        </p>
                    </div>
                    <Button onClick={handleCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Plan
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="relative flex-1 min-w-[300px]">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search plans by name..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-8 bg-background/50"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-muted-foreground" />
                                    <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                                        <SelectTrigger className="w-[140px] h-9">
                                            <SelectValue placeholder="Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Plans</SelectItem>
                                            <SelectItem value="active">Active Only</SelectItem>
                                            <SelectItem value="draft">Drafts Only</SelectItem>
                                            <SelectItem value="archived">Archived</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                                <span>Showing {filteredPlans.length} plans</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Plan Name</TableHead>
                                    <TableHead>Topics</TableHead>
                                    <TableHead>Assigned Users</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPlans.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No training plans found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredPlans.map((plan) => (
                                        <TableRow
                                            key={plan.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => handleView(plan)}
                                        >
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-primary" />
                                                    {plan.plan_name}
                                                </div>
                                            </TableCell>
                                            <TableCell>{plan.plan_topics.length} topics</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-muted-foreground" />
                                                    {plan.assignments.length}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={plan.is_archived ? 'outline' : (plan.is_active ? 'default' : 'secondary')}>
                                                    {plan.is_archived ? 'Archived' : (plan.is_active ? 'Active' : 'Draft')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{format(new Date(plan.created_at), 'MMM d, yyyy')}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleView(plan); }}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    {plan.is_archived ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => { e.stopPropagation(); handleRestore(plan.id); }}
                                                            className="text-primary hover:text-primary"
                                                        >
                                                            <FileText className="h-4 w-4" />
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(plan.id); }}
                                                            className="text-destructive hover:text-destructive"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
            <PlanDialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                    setIsDialogOpen(open)
                    if (!open) {
                        setEditingPlan(null)
                        setDialogMode('create')
                    }
                }}
                plan={editingPlan}
                mode={dialogMode}
                setMode={setDialogMode}
                onSave={handleSave}
                handleDelete={handleDelete}
                topics={topics}
            />
        </>
    )
}

interface PlanDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    plan: TrainingPlan | null
    mode: 'view' | 'edit' | 'create'
    setMode: (mode: 'view' | 'edit' | 'create') => void
    onSave: (plan: Partial<TrainingPlan>) => void
    handleDelete: (id: number) => void
    topics: Topic[]
}

function PlanDialog({ open, onOpenChange, plan, mode, setMode, onSave, handleDelete, topics }: PlanDialogProps) {
    const isView = mode === 'view'

    const [formData, setFormData] = useState<Partial<TrainingPlan>>({
        plan_name: '',
        description: '',
        is_active: true,
        plan_topics: [],
    })

    useEffect(() => {
        if (open) {
            if (plan) {
                setFormData(plan)
            } else {
                setFormData({
                    plan_name: '',
                    description: '',
                    is_active: true,
                    plan_topics: [],
                })
            }
        }
    }, [open, plan, mode]) // Added mode dependency to ensure sync when switching to edit


    const handleAddTopic = (topicId: number) => {
        if (isView) return
        const topic = topics.find(t => t.id === topicId)
        if (!topic) return

        // Use topic_id or topic.id for comparison
        if (formData.plan_topics?.some(pt => (pt.topic_id || pt.topic?.id) === topicId)) {
            return
        }

        const newPlanTopic: Partial<PlanTopic> = {
            topic_id: topicId,
            topic: topic, // Include full topic for immediate UI update
            expected_hours: topic.benchmark_hours,
            sequence_order: (formData.plan_topics?.length || 0) + 1
        }

        setFormData({
            ...formData,
            plan_topics: [...(formData.plan_topics || []), newPlanTopic as PlanTopic]
        })
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (isView) return
        onSave(formData)
    }

    const totalHours = formData.plan_topics?.reduce((sum, pt) => sum + Number(pt.expected_hours), 0) || 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle>
                                {mode === 'view' ? 'Training Plan Details' :
                                    mode === 'edit' ? 'Edit Training Plan' : 'Create New Training Plan'}
                            </DialogTitle>
                            <DialogDescription>
                                {isView ? 'Review the learning sequence for this role' : 'Define a learning path for specific roles'}
                            </DialogDescription>
                        </div>
                        {isView && (
                            <Badge variant={formData.is_active ? 'default' : 'secondary'} className="h-6">
                                {formData.is_active ? 'Active' : 'Draft'}
                            </Badge>
                        )}
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="plan_name">Plan Name</Label>
                                <Input
                                    id="plan_name"
                                    value={formData.plan_name}
                                    onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                                    placeholder="e.g., Junior Frontend Bootcamp"
                                    required
                                    disabled={isView}
                                    className={cn(isView && "bg-muted cursor-default border-transparent font-semibold text-lg")}
                                />
                            </div>
                            {!isView && (
                                <div className="space-y-2">
                                    <Label htmlFor="status">Status</Label>
                                    <Select
                                        value={formData.is_active ? 'active' : 'draft'}
                                        onValueChange={(v) => setFormData({ ...formData, is_active: v === 'active' })}
                                        disabled={isView}
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
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Plan Objective / Target Role</Label>
                            <Input
                                id="description"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe the goal of this path..."
                                disabled={isView}
                                className={cn(isView && "bg-muted cursor-default border-transparent")}
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between border-b pb-1.5 px-0.5">
                                <div className="flex items-center gap-3">
                                    <Label className="text-sm font-semibold">Topics</Label>
                                    <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 font-medium bg-muted/50">
                                        {totalHours.toFixed(1)}h total
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-[11px] h-7 px-2 text-primary hover:text-primary hover:bg-primary/10 transition-colors"
                                        onClick={() => window.open('/admin/topics', '_blank')}
                                    >
                                        <Plus className="mr-1 h-3 w-3" />
                                        Create New Topic
                                    </Button>
                                    {!isView && (
                                        <div className="w-56">
                                            <TopicPicker
                                                allTopics={topics}
                                                excludeTopicIds={formData.plan_topics?.map(pt => pt.topic_id || pt.topic?.id).filter((id): id is number => id !== undefined) || []}
                                                onSelect={(id) => handleAddTopic(id)}
                                                placeholder="Add Topic..."
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 min-h-[200px]">
                                {(!formData.plan_topics || formData.plan_topics.length === 0) ? (
                                    <div className="flex flex-col items-center justify-center py-10 border rounded-dashed border-2 bg-muted/30">
                                        <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground font-medium">No topics added yet</p>
                                    </div>
                                ) : (
                                    formData.plan_topics.map((pt, index) => {
                                        // Fallback to embedded topic data if not found in global list (e.g. for soft-deleted topics)
                                        const topicName = topics.find(t => t.id === pt.topic_id)?.name || pt.topic?.name || 'Unknown Topic'

                                        return (
                                            <div key={`${pt.topic_id}-${index}`} className="flex items-center gap-4 p-3 rounded-lg border bg-card">
                                                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-medium text-sm">{topicName}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {isView ? (
                                                        <span className="text-sm font-medium w-12 text-center">{Number(pt.expected_hours).toFixed(1)}</span>
                                                    ) : (
                                                        <Input
                                                            type="number"
                                                            className="w-20 h-8"
                                                            value={pt.expected_hours}
                                                            onChange={(e) => handleUpdateHours(pt.topic_id, Number(e.target.value))}
                                                            step="0.1"
                                                            min="0"
                                                        />
                                                    )}
                                                    <span className="text-xs text-muted-foreground">h</span>
                                                </div>
                                                {!isView && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            handleRemoveTopic(pt.topic_id)
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-6 border-t bg-muted/20">
                        <div className="flex-1 flex justify-start">
                            {isView && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDelete(formData.id!)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Plan
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                {isView ? 'Close' : 'Cancel'}
                            </Button>
                            {isView ? (
                                <Button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setMode('edit');
                                    }}
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit Plan
                                </Button>
                            ) : (
                                <Button type="submit" disabled={!formData.plan_name || formData.plan_topics?.length === 0}>
                                    {mode === 'edit' ? 'Update Plan' : 'Create Training Plan'}
                                </Button>
                            )}
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
