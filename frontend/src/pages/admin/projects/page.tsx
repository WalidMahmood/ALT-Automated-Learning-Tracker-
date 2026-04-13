import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import {
    fetchAllProjects,
    createProject,
    deleteProject,
    toggleProjectComplete,
    assignUsersToProject,
} from '@/lib/store/slices/projectsSlice'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Cpu,
    FolderKanban,
    Github,
    Layers,
    Loader2,
    Plus,
    Search,
    Target,
    Trash2,
    Users,
    ToggleLeft,
    ToggleRight,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Project } from '@/lib/types'
import { TOPIC_DOMAINS } from '@/lib/constants'

interface SimpleUser {
    id: number
    email: string
    full_name: string | null
}

export default function AdminProjectsPage() {
    const dispatch = useAppDispatch()
    const navigate = useNavigate()
    const { projects, isLoading } = useAppSelector((state) => state.projects)

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [assignedFilter, setAssignedFilter] = useState('all')
    const [filterStartDate, setFilterStartDate] = useState('')
    const [filterEndDate, setFilterEndDate] = useState('')
    const [entriesFilter, setEntriesFilter] = useState('all')
    const [page, setPage] = useState(1)
    const pageSize = 10

    // Create project dialog
    const [showCreate, setShowCreate] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDescription, setNewDescription] = useState('')
    // v9.0: Per-feature tracking
    interface FeatureDraft { name: string; success_criteria: string; out_of_scope: string[]; expanded: boolean; scopeInput: string }
    const [features, setFeatures] = useState<FeatureDraft[]>([])
    const [featureNameInput, setFeatureNameInput] = useState('')
    // v9.0: Project-level out of scope
    const [newOutOfScope, setNewOutOfScope] = useState<string[]>([])
    const [scopeInput, setScopeInput] = useState('')
    // v9.0: Structured tech stack
    const [techFrontend, setTechFrontend] = useState('')
    const [techBackend, setTechBackend] = useState('')
    const [techDatabase, setTechDatabase] = useState('')
    const [techCloud, setTechCloud] = useState('')
    const [newSuccessCriteria, setNewSuccessCriteria] = useState('')
    const [newStartDate, setNewStartDate] = useState('')
    const [newEndDate, setNewEndDate] = useState('')
    const [newRepoUrl, setNewRepoUrl] = useState('')
    const [createError, setCreateError] = useState<string | null>(null)

    // Assign users dialog
    const [showAssign, setShowAssign] = useState(false)
    const [assignProject, setAssignProject] = useState<Project | null>(null)
    const [allUsers, setAllUsers] = useState<SimpleUser[]>([])
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
    const [userRoles, setUserRoles] = useState<Record<number, string>>({})
    const [userSearch, setUserSearch] = useState('')

    // Delete dialog
    const [showDelete, setShowDelete] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

    useEffect(() => {
        dispatch(fetchAllProjects({}))
    }, [dispatch])

    // Fetch all users for assignment
    const loadUsers = async () => {
        try {
            const res = await api.get('/users/')
            const users = Array.isArray(res.data) ? res.data : res.data.results || []
            setAllUsers(users.filter((u: any) => u.is_active).map((u: any) => ({
                id: u.id,
                email: u.email,
                full_name: u.full_name,
            })))
        } catch {
            setAllUsers([])
        }
    }

    const addFeature = () => {
        const name = featureNameInput.trim()
        if (!name || features.some(f => f.name === name)) return
        setFeatures([...features, { name, success_criteria: '', out_of_scope: [], expanded: true, scopeInput: '' }])
        setFeatureNameInput('')
    }

    const updateFeature = (idx: number, updates: Partial<FeatureDraft>) => {
        setFeatures(features.map((f, i) => i === idx ? { ...f, ...updates } : f))
    }

    const removeFeature = (idx: number) => {
        setFeatures(features.filter((_, i) => i !== idx))
    }

    const addFeatureScope = (idx: number) => {
        const feat = features[idx]
        const val = feat.scopeInput.trim()
        if (!val || feat.out_of_scope.includes(val)) return
        updateFeature(idx, { out_of_scope: [...feat.out_of_scope, val], scopeInput: '' })
    }

    const removeFeatureScope = (featIdx: number, scopeIdx: number) => {
        const feat = features[featIdx]
        updateFeature(featIdx, { out_of_scope: feat.out_of_scope.filter((_, i) => i !== scopeIdx) })
    }

    // Build tech_stack string for backward compat
    const buildTechString = () => {
        const parts: string[] = []
        if (techFrontend) parts.push(`Frontend: ${techFrontend}`)
        if (techBackend) parts.push(`Backend: ${techBackend}`)
        if (techDatabase) parts.push(`Database: ${techDatabase}`)
        if (techCloud) parts.push(`Cloud / Infra: ${techCloud}`)
        return parts.join(' | ')
    }

    const handleCreate = async () => {
        if (!newName.trim()) {
            setCreateError('Project name is required')
            return
        }
        setCreateError(null)
        try {
            // Merge all feature out_of_scope with project-level
            const allOos = [...newOutOfScope]
            features.forEach(f => allOos.push(...f.out_of_scope))
            const uniqueOos = [...new Set(allOos)]

            await dispatch(createProject({
                name: newName.trim(),
                description: newDescription.trim(),
                key_modules: features.map(f => f.name),
                out_of_scope: uniqueOos,
                tech_stack: buildTechString(),
                tech_frontend: techFrontend.trim(),
                tech_backend: techBackend.trim(),
                tech_database: techDatabase.trim(),
                tech_cloud: techCloud.trim(),
                success_criteria: newSuccessCriteria.trim(),
                start_date: newStartDate || null,
                end_date: newEndDate || null,
                repo_url: newRepoUrl.trim() || '',
            })).unwrap()
            dispatch(fetchAllProjects({}))
            setShowCreate(false)
            setNewName('')
            setNewDescription('')
            setFeatures([])
            setFeatureNameInput('')
            setNewOutOfScope([])
            setScopeInput('')
            setTechFrontend('')
            setTechBackend('')
            setTechDatabase('')
            setTechCloud('')
            setNewSuccessCriteria('')
            setNewStartDate('')
            setNewEndDate('')
            setNewRepoUrl('')
        } catch (err: any) {
            setCreateError(typeof err === 'string' ? err : JSON.stringify(err))
        }
    }

    const openAssign = async (project: Project) => {
        setAssignProject(project)
        setSelectedUserIds(project.assigned_users?.map((u) => u.id) || [])
        // Build initial role map from existing assignments
        const roles: Record<number, string> = {}
        project.assigned_users?.forEach((u) => { roles[u.id] = u.role || 'general' })
        setUserRoles(roles)
        await loadUsers()
        setShowAssign(true)
    }

    const handleAssign = async () => {
        if (!assignProject) return
        await dispatch(assignUsersToProject({
            projectId: assignProject.id,
            userIds: selectedUserIds,
            roles: userRoles,
        }))
        dispatch(fetchAllProjects({}))
        setShowAssign(false)
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        await dispatch(deleteProject(deleteTarget.id))
        dispatch(fetchAllProjects({}))
        setShowDelete(false)
    }

    const handleToggle = async (project: Project) => {
        await dispatch(toggleProjectComplete(project.id))
        dispatch(fetchAllProjects({}))
    }

    const toggleUser = (userId: number) => {
        setSelectedUserIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        )
        // Set default role when adding user
        if (!selectedUserIds.includes(userId)) {
            setUserRoles((prev) => ({ ...prev, [userId]: prev[userId] || 'general' }))
        }
    }

    const setUserRole = (userId: number, role: string) => {
        setUserRoles((prev) => ({ ...prev, [userId]: role }))
    }

    const PROJECT_ROLES = [
        ...TOPIC_DOMAINS.map(d => ({ value: d.value, label: d.label })),
        { value: 'lead', label: 'Lead' },
    ]

    const addTag = (list: string[], setList: (v: string[]) => void, value: string, setInput: (v: string) => void) => {
        const trimmed = value.trim()
        if (trimmed && !list.includes(trimmed)) setList([...list, trimmed])
        setInput('')
    }

    const removeTag = (list: string[], setList: (v: string[]) => void, index: number) => {
        setList(list.filter((_, i) => i !== index))
    }

    const filtered = projects.filter((p) => {
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false

        // Status filter
        if (statusFilter === 'completed' && !p.is_completed) return false
        if (statusFilter === 'in_progress' && p.is_completed) return false

        // Assigned filter
        const count = p.assigned_users?.length || 0
        if (assignedFilter === 'assigned' && count === 0) return false
        if (assignedFilter === 'unassigned' && count > 0) return false

        // Date Range filter
        if (filterStartDate) {
            if (!p.start_date || p.start_date < filterStartDate) return false
        }
        if (filterEndDate) {
            if (!p.end_date || p.end_date > filterEndDate) return false
        }

        // Entries filter
        if (entriesFilter === 'has_entries' && p.entry_count === 0) return false
        if (entriesFilter === 'no_entries' && p.entry_count > 0) return false

        return true
    })

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

    // Reset page when filters change
    const handleSearch = (v: string) => { setSearch(v); setPage(1) }
    const handleStatusFilter = (v: string) => { setStatusFilter(v); setPage(1) }
    const handleAssignedFilter = (v: string) => { setAssignedFilter(v); setPage(1) }
    const handleStartDateFilter = (v: string) => { setFilterStartDate(v); setPage(1) }
    const handleEndDateFilter = (v: string) => { setFilterEndDate(v); setPage(1) }
    const handleEntriesFilter = (v: string) => { setEntriesFilter(v); setPage(1) }

    const filteredUsers = allUsers.filter((u) =>
        !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.full_name && u.full_name.toLowerCase().includes(userSearch.toLowerCase()))
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Project Management</h1>
                    <p className="text-muted-foreground">Create, assign, and manage SBU Task projects</p>
                </div>
                <Button onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Create Project
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search projects by name..."
                                    value={search}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={handleStatusFilter}>
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any Status</SelectItem>
                                    <SelectItem value="in_progress">Active</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-4">
                            <Select value={assignedFilter} onValueChange={handleAssignedFilter}>
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue placeholder="Assignment" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any Assignment</SelectItem>
                                    <SelectItem value="assigned">Has Users</SelectItem>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="flex gap-2">
                                <Input
                                    type="date"
                                    value={filterStartDate}
                                    onChange={(e) => handleStartDateFilter(e.target.value)}
                                    className="w-[160px]"
                                />
                                <Input
                                    type="date"
                                    value={filterEndDate}
                                    onChange={(e) => handleEndDateFilter(e.target.value)}
                                    className="w-[160px]"
                                />
                            </div>
                            <Select value={entriesFilter} onValueChange={handleEntriesFilter}>
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue placeholder="Entries" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any Entries</SelectItem>
                                    <SelectItem value="has_entries">Has Entries</SelectItem>
                                    <SelectItem value="no_entries">No Entries</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Projects Table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">All Projects ({filtered.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <FolderKanban className="h-12 w-12 text-muted-foreground/30 mb-3" />
                            <p className="text-muted-foreground">No projects found.</p>
                            <Button className="mt-4" size="sm" onClick={() => setShowCreate(true)}>
                                <Plus className="h-4 w-4 mr-1" /> Create First Project
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-lg border">
                                <div className="grid grid-cols-[1fr_100px_80px_100px_100px_100px_140px] gap-4 p-3 text-xs font-bold uppercase text-muted-foreground border-b bg-muted/30">
                                    <span>Project</span>
                                    <span className="text-center">Assigned</span>
                                    <span className="text-center">Entries</span>
                                    <span className="text-center">Start Date</span>
                                    <span className="text-center">End Date</span>
                                    <span className="text-center">Status</span>
                                    <span className="text-center">Actions</span>
                                </div>
                                {paginated.map((project) => (
                                    <div
                                        key={project.id}
                                        className="grid grid-cols-[1fr_100px_80px_100px_100px_100px_140px] gap-4 p-3 items-center border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                                        onClick={() => navigate(`/projects/${project.id}`)}
                                    >
                                        <div>
                                            <span className="text-sm font-semibold text-primary">{project.name}</span>
                                        </div>
                                        <div className="text-center">
                                            <Badge variant="outline" className="text-xs">
                                                <Users className="h-3 w-3 mr-1" />{project.assigned_users?.length || 0}
                                            </Badge>
                                        </div>
                                        <span className="text-sm text-center">{project.entry_count}</span>
                                        <span className="text-xs text-center text-muted-foreground">
                                            {project.start_date || '—'}
                                        </span>
                                        <span className="text-xs text-center text-muted-foreground">
                                            {project.end_date || '—'}
                                        </span>
                                        <div className="text-center">
                                            <Badge className={cn(
                                                'text-xs font-bold',
                                                project.is_completed ? 'bg-success' : 'bg-blue-500/20 text-blue-700 border-blue-500/30'
                                            )}>
                                                {project.is_completed ? 'DONE' : 'ACTIVE'}
                                            </Badge>
                                        </div>
                                        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                variant="ghost" size="sm" className="h-7 text-xs px-2"
                                                onClick={() => openAssign(project)} title="Assign users"
                                            >
                                                <Users className="h-3 w-3 mr-1" /> Assign
                                            </Button>
                                            <Button
                                                variant="ghost" size="sm" className="h-7 px-1.5"
                                                onClick={() => handleToggle(project)} title="Toggle status"
                                            >
                                                {project.is_completed ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                                            </Button>
                                            <Button
                                                variant="ghost" size="sm" className="h-7 px-1.5 text-destructive hover:text-destructive"
                                                onClick={() => { setDeleteTarget(project); setShowDelete(true) }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-3">
                                    <p className="text-xs text-muted-foreground">
                                        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                        </Button>
                                        <span className="text-xs px-2">Page {page} of {totalPages}</span>
                                        <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                    {/* Gradient header */}
                    <div className="bg-gradient-to-r from-violet-600/10 via-purple-600/10 to-fuchsia-600/10 border-b px-6 pt-6 pb-4">
                        <DialogHeader>
                            <DialogTitle className="text-xl flex items-center gap-2">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                    <FolderKanban className="h-4 w-4 text-white" />
                                </div>
                                Create New Project
                            </DialogTitle>
                            <DialogDescription>Define the scope, features, and tech stack for your SBU Tasks project.</DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="space-y-5 px-6 py-5">
                        {/* Project Name */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Project Name *</Label>
                            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., E-commerce Platform" maxLength={200} className="h-11 text-base" />
                        </div>
                        {/* Description */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Description</Label>
                            <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} maxLength={1000} placeholder="Project scope, what is being built, scale, constraints..." />
                        </div>

                        {/* GitHub Repository URL */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Github className="h-4 w-4 text-gray-500" />
                                <Label className="text-sm font-semibold">GitHub Repository URL</Label>
                                <Badge variant="outline" className="text-[10px] ml-auto">Optional</Badge>
                            </div>
                            <Input value={newRepoUrl} onChange={(e) => setNewRepoUrl(e.target.value)} placeholder="https://github.com/org/repo" className="h-9" />
                            <p className="text-[11px] text-muted-foreground">Used for Git commit validation. Commits on entry dates will be cross-checked against this repo.</p>
                        </div>

                        {/* ═══ Features / Modules ═══ */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Layers className="h-4 w-4 text-violet-500" />
                                <Label className="text-sm font-semibold">Features / Modules</Label>
                                <Badge variant="outline" className="text-[10px] ml-auto">{features.length} feature{features.length !== 1 ? 's' : ''}</Badge>
                            </div>
                            {/* Feature cards */}
                            <div className="space-y-2">
                                {features.map((feat, idx) => (
                                    <div key={idx} className="rounded-xl border bg-gradient-to-r from-muted/50 to-muted/30 overflow-hidden transition-all duration-200 hover:shadow-sm">
                                        {/* Feature header */}
                                        <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => updateFeature(idx, { expanded: !feat.expanded })}>
                                            <div className="h-6 w-6 rounded-md bg-violet-500/10 flex items-center justify-center text-violet-500">
                                                <Layers className="h-3 w-3" />
                                            </div>
                                            <span className="text-sm font-medium flex-1">{feat.name}</span>
                                            {feat.success_criteria && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20"><Target className="h-2.5 w-2.5 mr-0.5" />criteria</Badge>}
                                            {feat.out_of_scope.length > 0 && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/20">{feat.out_of_scope.length} excluded</Badge>}
                                            <button type="button" onClick={(e) => { e.stopPropagation(); removeFeature(idx) }} className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                            {feat.expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                        </div>
                                        {/* Feature details (expanded) */}
                                        {feat.expanded && (
                                            <div className="px-3 pb-3 pt-1 space-y-3 border-t bg-background/50">
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs text-muted-foreground">Success Criteria</Label>
                                                    <Input value={feat.success_criteria} onChange={(e) => updateFeature(idx, { success_criteria: e.target.value })} placeholder="e.g., Token expiry, refresh logic, rate limiting" className="h-8 text-xs" />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs text-muted-foreground">Out of Scope (for this feature)</Label>
                                                    <div className="flex flex-wrap gap-1 mb-1">
                                                        {feat.out_of_scope.map((s, si) => (
                                                            <Badge key={si} variant="destructive" className="text-[10px] gap-1 pr-0.5 bg-destructive/10 text-destructive border-destructive/20">
                                                                {s}
                                                                <button type="button" onClick={() => removeFeatureScope(idx, si)} className="rounded-full p-0.5 hover:bg-destructive/30">
                                                                    <X className="h-2.5 w-2.5" />
                                                                </button>
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        <Input value={feat.scopeInput} onChange={(e) => updateFeature(idx, { scopeInput: e.target.value })} placeholder="e.g., OAuth" className="h-7 text-xs" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeatureScope(idx) } }} />
                                                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => addFeatureScope(idx)}>Add</Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {/* Add feature input */}
                            <div className="flex gap-2">
                                <Input value={featureNameInput} onChange={(e) => setFeatureNameInput(e.target.value)} placeholder="e.g., JWT Authentication" className="h-9" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }} />
                                <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={addFeature}>
                                    <Plus className="h-3.5 w-3.5" /> Add Feature
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Each feature can have its own success criteria and out-of-scope items. Used for AI coverage tracking.</p>
                        </div>

                        {/* ═══ Project-level Out of Scope ═══ */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">Project-level Out of Scope</Label>
                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                                {newOutOfScope.map((item, i) => (
                                    <Badge key={i} variant="destructive" className="text-xs gap-1.5 pr-1 bg-destructive/10 text-destructive border-destructive/20">
                                        {item}
                                        <button type="button" onClick={() => removeTag(newOutOfScope, setNewOutOfScope, i)} className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/30 transition-colors">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <Input value={scopeInput} onChange={(e) => setScopeInput(e.target.value)} placeholder="e.g., Mobile app" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(newOutOfScope, setNewOutOfScope, scopeInput, setScopeInput) } }} />
                                <Button type="button" variant="outline" size="sm" onClick={() => addTag(newOutOfScope, setNewOutOfScope, scopeInput, setScopeInput)}>Add</Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Globally excluded items. Applies across all features.</p>
                        </div>

                        {/* ═══ Structured Tech Stack ═══ */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Cpu className="h-4 w-4 text-blue-500" />
                                <Label className="text-sm font-semibold">Tech Stack</Label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Frontend</Label>
                                    <Input value={techFrontend} onChange={(e) => setTechFrontend(e.target.value)} placeholder="e.g., React, Next.js" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Backend</Label>
                                    <Input value={techBackend} onChange={(e) => setTechBackend(e.target.value)} placeholder="e.g., Django, Celery" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Database</Label>
                                    <Input value={techDatabase} onChange={(e) => setTechDatabase(e.target.value)} placeholder="e.g., PostgreSQL, Redis" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Cloud / Infra</Label>
                                    <Input value={techCloud} onChange={(e) => setTechCloud(e.target.value)} placeholder="e.g., AWS, Docker" />
                                </div>
                            </div>
                        </div>

                        {/* ═══ Success Criteria & Timeline ═══ */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Target className="h-4 w-4 text-emerald-500" />
                                <Label className="text-sm font-semibold">Project Success Criteria</Label>
                            </div>
                            <Input value={newSuccessCriteria} onChange={(e) => setNewSuccessCriteria(e.target.value)} placeholder="e.g., <200ms API, 99.9% uptime, 10K concurrent" maxLength={300} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Start Date</Label>
                                <Input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">End Date</Label>
                                <Input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
                            </div>
                        </div>
                        {createError && (
                            <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">{createError}</p>
                        )}
                    </div>
                    <DialogFooter className="px-6 py-4 border-t bg-muted/30">
                        <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={!newName.trim()} className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
                            <Plus className="h-4 w-4 mr-1" /> Create Project
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Assign Users Dialog */}
            <Dialog open={showAssign} onOpenChange={setShowAssign}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Assign Users to "{assignProject?.name}"</DialogTitle>
                        <DialogDescription>Select learners and assign their roles on this project.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search users..."
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-2">
                            {filteredUsers.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                            ) : (
                                filteredUsers.map((user) => (
                                    <div
                                        key={user.id}
                                        className={cn(
                                            "flex items-center gap-3 rounded-md p-2 transition-colors",
                                            selectedUserIds.includes(user.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/30"
                                        )}
                                    >
                                        <Checkbox
                                            checked={selectedUserIds.includes(user.id)}
                                            onCheckedChange={() => toggleUser(user.id)}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{user.full_name || user.email}</p>
                                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                        </div>
                                        {selectedUserIds.includes(user.id) && (
                                            <Select value={userRoles[user.id] || 'general'} onValueChange={(v) => setUserRole(user.id, v)}>
                                                <SelectTrigger className="w-[110px] h-7 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {PROJECT_ROLES.map((r) => (
                                                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">{selectedUserIds.length} user(s) selected</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
                        <Button onClick={handleAssign}>Save Assignments</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Project</AlertDialogTitle>
                        <AlertDialogDescription>
                            Soft-delete "{deleteTarget?.name}"? It will be hidden but recoverable.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
