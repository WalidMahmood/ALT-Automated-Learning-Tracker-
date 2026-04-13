
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

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
import { Plus, Search, FileText, Users, Pencil, Trash2, BookOpen, Clock, Eye, UserPlus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
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
import { Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { Filter } from 'lucide-react'
import api from '@/lib/api'
import { getDescendantTopics } from '@/lib/hierarchy'

export default function TrainingPlansPage() {
    const { user } = useAppSelector((state) => state.auth)
    const navigate = useNavigate()
    const [plans, setPlans] = useState<TrainingPlan[]>([])
    const [topics, setTopics] = useState<Topic[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'archived'>('all')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingPlan, setEditingPlan] = useState<TrainingPlan | null>(null)
    const [dialogMode, setDialogMode] = useState<'view' | 'edit' | 'create'>('create')
    const [isLoading, setIsLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 15

    // Reset page on filter change
    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery, statusFilter])

    // Fetch plans and topics from API
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [plansRes, topicsRes] = await Promise.all([
                    api.get('/training-plans/?archived=all'),
                    api.get('/topics/')
                ])
                setPlans(plansRes.data)
                setTopics(topicsRes.data)
            } catch (error) {
                console.error('Failed to fetch data:', error)
            } finally {
                setIsLoading(false)
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

    const totalPages = Math.ceil(filteredPlans.length / itemsPerPage)
    const paginatedPlans = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage
        return filteredPlans.slice(startIndex, startIndex + itemsPerPage)
    }, [filteredPlans, currentPage])

    const handleCreate = () => {
        setEditingPlan(null)
        setDialogMode('create')
        setIsDialogOpen(true)
    }

    const handleView = (plan: TrainingPlan) => {
        navigate(`/admin/training-plans/${plan.id}`)
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
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => navigate('/admin/training-plans/templates')}>
                            <BookOpen className="mr-2 h-4 w-4" />
                            Browse Templates
                        </Button>
                        <Button onClick={handleCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Plan
                        </Button>
                    </div>
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
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredPlans.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No training plans found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedPlans.map((plan) => (
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
                                            <TableCell>{plan.topic_count ?? plan.plan_topics?.length ?? 0} topics</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-muted-foreground" />
                                                    {plan.assignment_count ?? plan.assignments?.length ?? 0}
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

                    {/* Pagination Controls */}
                    {filteredPlans.length > itemsPerPage && (
                        <div className="flex items-center justify-between px-6 pb-6 pt-2">
                            <div className="text-sm text-muted-foreground">
                                Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredPlans.length)}</span> of <span className="font-medium">{filteredPlans.length}</span> plans
                            </div>
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronsLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-sm font-medium">
                                    Page {currentPage} of {totalPages}
                                </div>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                >
                                    <ChevronsRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div >
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
                plans={plans}
                setPlans={setPlans}
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
    plans: TrainingPlan[]
    setPlans: React.Dispatch<React.SetStateAction<TrainingPlan[]>>
}

function PlanDialog({ open, onOpenChange, plan, mode, setMode, onSave, handleDelete, topics, plans: _plans, setPlans }: PlanDialogProps) {
    const isView = mode === 'view'

    const [formData, setFormData] = useState<Partial<TrainingPlan>>({
        plan_name: '',
        description: '',
        is_active: true,
        plan_topics: [],
    })
    const [allUsers, setAllUsers] = useState<any[]>([])

    useEffect(() => {
        if (open) {
            if (plan) {
                if (!plan.plan_topics) {
                    // Fetch full details if we only have the lightweight version
                    api.get(`/training-plans/${plan.id}/`)
                        .then(res => {
                            setFormData(res.data)
                        })
                        .catch(err => console.error("Failed to fetch plan details", err))
                } else {
                    setFormData(plan)
                }
            } else {
                setFormData({
                    plan_name: '',
                    description: '',
                    is_active: true,
                    plan_topics: [],
                })
            }
        }
    }, [open, plan, mode])

    // Fetch users when viewing (for assignment)
    useEffect(() => {
        if (open && isView) {
            api.get('/users/').then(res => {
                const users = res.data.results || (Array.isArray(res.data) ? res.data : [])
                setAllUsers(users)
            }).catch(() => { })
        }
    }, [open, isView])

    const handleAssignUser = async (userId: number) => {
        if (!plan) return
        try {
            await api.post(`/training-plans/${plan.id}/assign/`, { user_ids: [userId] })
            const res = await api.get(`/training-plans/${plan.id}/`)
            setPlans(prev => prev.map(p => p.id === plan.id ? res.data : p))
            setFormData(res.data)
        } catch (error) {
            console.error('Failed to assign user:', error)
        }
    }

    const handleAddTopic = (topicId: number) => {
        if (isView) return
        const topic = topics.find(t => t.id === topicId)
        if (!topic) return

        // Create a list of topics to add (the topic itself + all its descendants)
        const descendants = getDescendantTopics(topicId, topics)
        const topicsToAdd = [topic, ...descendants]

        const currentPlanTopics = formData.plan_topics || []
        const newTopics: PlanTopic[] = []

        let nextSequence = currentPlanTopics.length + 1

        for (const t of topicsToAdd) {
            // Check if already in plan (using topic_id or topic.id)
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (isView) return
        onSave(formData)
    }

    const totalHours = formData.plan_topics?.reduce((sum, pt) => sum + Number(pt.expected_hours), 0) || 0

    // Users already assigned to this plan
    const assignedUserIds = new Set((formData.assignments || []).map((a: any) => a.user_id || a.user?.id))
    const unassignedUsers = allUsers.filter((u: any) => u.role === 'learner' && !assignedUserIds.has(u.id))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 shrink-0">
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

                <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 pt-2 space-y-6">
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

                        {/* Assigned Users (view mode only) */}
                        {isView && plan && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between border-b pb-1.5 px-0.5">
                                    <div className="flex items-center gap-3">
                                        <Label className="text-sm font-semibold">Assigned Users</Label>
                                        <Badge variant="secondary" className="text-xs h-4.5 px-1.5 font-medium bg-muted/50">
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
                                {(formData.assignments || []).length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-6 border rounded-lg border-dashed bg-muted/30">
                                        <Users className="h-6 w-6 text-muted-foreground mb-1" />
                                        <p className="text-xs text-muted-foreground">No learners assigned yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {(formData.assignments || []).map((assignment: any) => (
                                            <div key={assignment.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border">
                                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                                    {(assignment.user?.full_name || assignment.user?.email || '?')[0].toUpperCase()}
                                                </div>
                                                <span className="text-sm font-medium flex-1">
                                                    {assignment.user?.full_name || assignment.user?.email || `User #${assignment.user_id}`}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {assignment.assigned_at ? format(new Date(assignment.assigned_at), 'MMM d') : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-3">
                            <div className="flex items-center justify-between border-b pb-1.5 px-0.5">
                                <div className="flex items-center gap-3">
                                    <Label className="text-sm font-semibold">Topics</Label>
                                    <Badge variant="secondary" className="text-xs h-4.5 px-1.5 font-medium bg-muted/50">
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

                            <div className="space-y-2 min-h-[120px] max-h-[300px] overflow-y-auto">
                                {(!formData.plan_topics || formData.plan_topics.length === 0) ? (
                                    <div className="flex flex-col items-center justify-center py-10 border rounded-dashed border-2 bg-muted/30">
                                        <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground font-medium">No topics added yet</p>
                                    </div>
                                ) : (
                                    (() => {
                                        // Sort all topics by parent/child relationship and sequence
                                        const planTopics = [...formData.plan_topics].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))

                                        // Helper to render a topic and its children
                                        const renderTopicTree = (parentId: number | null, level: number) => {
                                            const itemsAtThisLevel = planTopics.filter(pt => {
                                                const tid = pt.topic_id || pt.topic?.id || 0
                                                const topic = topics.find(t => t.id === tid)
                                                if (!topic) return false

                                                if (parentId !== null) {
                                                    return topic.parent_id === parentId
                                                } else {
                                                    // At root level: show topics whose parent is NOT in the plan
                                                    return !planTopics.some(other => (other.topic_id || other.topic?.id) === topic.parent_id)
                                                }
                                            })

                                            return itemsAtThisLevel.map((pt, index) => {
                                                const topicId = pt.topic_id || pt.topic?.id || 0
                                                const topic = topics.find(t => t.id === topicId)
                                                const topicName = topic?.name || pt.topic?.name || 'Unknown Topic'

                                                // Check if this topic has children *that are also in the plan*
                                                const planDescendants = planTopics.filter(other => {
                                                    let curr = topics.find(t => t.id === (other.topic_id || other.topic?.id))
                                                    while (curr?.parent_id) {
                                                        if (curr.parent_id === topicId) return true
                                                        curr = topics.find(t => t.id === curr?.parent_id)
                                                    }
                                                    return false
                                                })
                                                const hasPlanChildren = planDescendants.length > 0

                                                return (
                                                    <div key={`${topicId}-${level}-${index}`} className="space-y-1">
                                                        <div
                                                            className={cn(
                                                                "flex items-center gap-3 p-2 rounded-lg border transition-colors",
                                                                hasPlanChildren ? "bg-muted/50 border-dashed" : "bg-card"
                                                            )}
                                                            style={{ marginLeft: `${level * 24}px` }}
                                                        >
                                                            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                                                                {level === 0 ? index + 1 : '•'}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className={cn("truncate text-sm", hasPlanChildren ? "font-semibold" : "font-medium")}>
                                                                        {topicName}
                                                                    </p>
                                                                    {hasPlanChildren && (
                                                                        <Badge variant="outline" className="text-xs h-4 py-0 px-1 font-normal opacity-70">Category</Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Clock className="h-3 w-3 text-muted-foreground" />
                                                                {isView || hasPlanChildren ? (
                                                                    <div className="flex items-center min-w-[3rem] justify-center">
                                                                        <span className={cn(
                                                                            "text-sm font-medium",
                                                                            hasPlanChildren ? "text-primary" : ""
                                                                        )}>
                                                                            {hasPlanChildren
                                                                                ? planDescendants.reduce((sum, d) => sum + Number(d.expected_hours), Number(pt.expected_hours)).toFixed(1)
                                                                                : Number(pt.expected_hours).toFixed(1)
                                                                            }
                                                                        </span>
                                                                        {hasPlanChildren && (
                                                                            <span className="text-xs ml-0.5 opacity-60">*</span>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <Input
                                                                        type="number"
                                                                        className="w-16 h-7 text-xs px-2"
                                                                        value={pt.expected_hours}
                                                                        onChange={(e) => handleUpdateHours(topicId, Number(e.target.value))}
                                                                        step="0.5"
                                                                        min="0"
                                                                    />
                                                                )}
                                                                <span className="text-xs text-muted-foreground w-3">h</span>
                                                            </div>
                                                            {!isView && (
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                                    onClick={(e) => {
                                                                        e.preventDefault()
                                                                        handleRemoveTopic(topicId)
                                                                    }}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                        {renderTopicTree(topicId, level + 1)}
                                                    </div>
                                                )
                                            })
                                        }

                                        return renderTopicTree(null, 0)
                                    })()
                                )}
                                {formData.plan_topics && formData.plan_topics.some(pt => {
                                    const tid = pt.topic_id || pt.topic?.id || 0
                                    return topics.some(t => t.id === tid && topics.some(other => other.parent_id === t.id && formData.plan_topics?.some(p => (p.topic_id || p.topic?.id) === other.id)))
                                }) && (
                                        <p className="text-xs text-muted-foreground italic px-2 pt-1 border-t mt-2">
                                            * Calculated total including all nested sub-topics below.
                                        </p>
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
