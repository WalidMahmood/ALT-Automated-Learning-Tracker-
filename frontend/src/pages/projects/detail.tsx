import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import {
  fetchProjectDetail,
  updateProject,
  deleteProject,
  toggleProjectComplete,
  clearSelectedProject,
  assignUsersToProject,
} from '@/lib/store/slices/projectsSlice'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  FileText,
  Flag,
  Github,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Shield,
  Target,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TOPIC_DOMAINS } from '@/lib/constants'
import api from '@/lib/api'
import { toast } from 'sonner'

interface SimpleUser {
  id: number
  email: string
  full_name: string | null
}

const PROJECT_ROLES = [
  ...TOPIC_DOMAINS.map(d => ({ value: d.value, label: d.label })),
  { value: 'lead', label: 'Lead' },
]

const TECH_STACK_CATEGORIES = [
  { key: 'frontend', label: 'Frontend', placeholder: 'e.g., React, Vue, Angular' },
  { key: 'backend', label: 'Backend', placeholder: 'e.g., Django, Express, Spring' },
  { key: 'database', label: 'Database', placeholder: 'e.g., PostgreSQL, MongoDB, Redis' },
  { key: 'cloud', label: 'Cloud / Infra', placeholder: 'e.g., AWS, Docker, K8s' },
  { key: 'other', label: 'Other', placeholder: 'e.g., Stripe, Firebase, GraphQL' },
]

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { selectedProject: project, isLoading } = useAppSelector((state) => state.projects)
  const { user } = useAppSelector((state) => state.auth)
  const isAdmin = user?.role === 'admin'
  const isAssigned = project?.assigned_users?.some(u => u.id === user?.id) || false
  const canEdit = isAdmin || isAssigned

  // Editing states
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')

  // v9.0: Per-feature editing
  interface FeatureDraft { name: string; success_criteria: string; out_of_scope: string[]; expanded: boolean; scopeInput: string }
  const [editFeatures, setEditFeatures] = useState<FeatureDraft[]>([])
  const [featureNameInput, setFeatureNameInput] = useState('')
  // Project-level out of scope
  const [editOutOfScope, setEditOutOfScope] = useState<string[]>([])
  const [scopeInput, setScopeInput] = useState('')
  // Project-level success criteria (kept for backward compat)
  const [editSuccessCriteria, setEditSuccessCriteria] = useState('')

  // Tech stack sub-fields
  const [techFields, setTechFields] = useState<Record<string, string>>({
    frontend: '', backend: '', database: '', cloud: '', other: '',
  })

  // Team management
  const [showTeamEditor, setShowTeamEditor] = useState(false)
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [userRoles, setUserRoles] = useState<Record<number, string>>({})
  const [userSearch, setUserSearch] = useState('')

  const [showDelete, setShowDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (id) dispatch(fetchProjectDetail(Number(id)))
    return () => { dispatch(clearSelectedProject()) }
  }, [dispatch, id])

  // Build features from project data
  const buildFeaturesFromProject = (p: typeof project): FeatureDraft[] => {
    if (!p) return []
    const feats = (p as any).features
    if (feats && feats.length > 0) {
      return feats.map((f: any) => ({
        name: f.name,
        success_criteria: f.success_criteria || '',
        out_of_scope: f.out_of_scope || [],
        expanded: false,
        scopeInput: '',
      }))
    }
    // Fallback: convert key_modules to features
    return (p.key_modules || []).map(m => ({
      name: m,
      success_criteria: '',
      out_of_scope: [],
      expanded: false,
      scopeInput: '',
    }))
  }

  useEffect(() => {
    if (project) {
      setEditName(project.name || '')
      setEditDescription(project.description || '')
      setEditStartDate(project.start_date || '')
      setEditEndDate(project.end_date || '')
      setEditFeatures(buildFeaturesFromProject(project))
      setEditOutOfScope(project.out_of_scope || [])
      setEditSuccessCriteria(project.success_criteria || '')
      // Parse tech stack string into sub-fields
      parseTechStack(project.tech_stack || '')
      // Setup team
      setSelectedUserIds(project.assigned_users?.map(u => u.id) || [])
      const roles: Record<number, string> = {}
      project.assigned_users?.forEach(u => { roles[u.id] = u.role || 'general' })
      setUserRoles(roles)
    }
  }, [project])

  const parseTechStack = (tech: string) => {
    // Try to parse "Frontend: X | Backend: Y | ..." format
    const fields: Record<string, string> = { frontend: '', backend: '', database: '', cloud: '', other: '' }
    if (!tech) { setTechFields(fields); return }

    const parts = tech.split('|').map(s => s.trim())
    for (const part of parts) {
      const colonIdx = part.indexOf(':')
      if (colonIdx > 0) {
        const key = part.substring(0, colonIdx).trim().toLowerCase()
        const val = part.substring(colonIdx + 1).trim()
        if (key in fields) fields[key] = val
        else if (key === 'cloud / infra' || key === 'infra') fields.cloud = val
        else if (key === 'db') fields.database = val
        else fields.other = fields.other ? `${fields.other}, ${val}` : val
      } else {
        fields.other = fields.other ? `${fields.other}, ${part}` : part
      }
    }
    setTechFields(fields)
  }

  const buildTechStackString = () => {
    const parts: string[] = []
    if (techFields.frontend) parts.push(`Frontend: ${techFields.frontend}`)
    if (techFields.backend) parts.push(`Backend: ${techFields.backend}`)
    if (techFields.database) parts.push(`Database: ${techFields.database}`)
    if (techFields.cloud) parts.push(`Cloud / Infra: ${techFields.cloud}`)
    if (techFields.other) parts.push(`Other: ${techFields.other}`)
    return parts.join(' | ')
  }

  // v9.0: Feature helpers for edit mode
  const addEditFeature = () => {
    const name = featureNameInput.trim()
    if (!name || editFeatures.some(f => f.name === name)) return
    setEditFeatures([...editFeatures, { name, success_criteria: '', out_of_scope: [], expanded: true, scopeInput: '' }])
    setFeatureNameInput('')
  }
  const updateEditFeature = (idx: number, updates: Partial<FeatureDraft>) => {
    setEditFeatures(editFeatures.map((f, i) => i === idx ? { ...f, ...updates } : f))
  }
  const removeEditFeature = (idx: number) => {
    setEditFeatures(editFeatures.filter((_, i) => i !== idx))
  }
  const addEditFeatureScope = (idx: number) => {
    const feat = editFeatures[idx]
    const val = feat.scopeInput.trim()
    if (!val || feat.out_of_scope.includes(val)) return
    updateEditFeature(idx, { out_of_scope: [...feat.out_of_scope, val], scopeInput: '' })
  }
  const removeEditFeatureScope = (featIdx: number, scopeIdx: number) => {
    const feat = editFeatures[featIdx]
    updateEditFeature(featIdx, { out_of_scope: feat.out_of_scope.filter((_, i) => i !== scopeIdx) })
  }

  const handleStartEdit = () => {
    if (!project) return
    setEditName(project.name || '')
    setEditDescription(project.description || '')
    setEditStartDate(project.start_date || '')
    setEditEndDate(project.end_date || '')
    setEditFeatures(buildFeaturesFromProject(project))
    setEditOutOfScope(project.out_of_scope || [])
    setEditSuccessCriteria(project.success_criteria || '')
    parseTechStack(project.tech_stack || '')
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!project) return
    setSaving(true)
    try {
      const data: any = {
        description: editDescription,
      }
      if (isAdmin) {
        // Merge all feature OOS with project-level
        const allOos = [...editOutOfScope]
        editFeatures.forEach(f => allOos.push(...f.out_of_scope))
        const uniqueOos = [...new Set(allOos)]

        data.key_modules = editFeatures.map(f => f.name)
        data.out_of_scope = uniqueOos
        data.tech_stack = buildTechStackString()
        data.tech_frontend = techFields.frontend || ''
        data.tech_backend = techFields.backend || ''
        data.tech_database = techFields.database || ''
        data.tech_cloud = techFields.cloud || ''
        data.success_criteria = editSuccessCriteria
        data.name = editName
        data.start_date = editStartDate || null
        data.end_date = editEndDate || null
      }
      await dispatch(updateProject({ id: project.id, data })).unwrap()

      // v9.0: Sync features via manage_features endpoint
      try {
        await api.post(`/projects/${project.id}/manage_features/`, {
          features: editFeatures.map(f => ({
            name: f.name,
            success_criteria: f.success_criteria,
            out_of_scope: f.out_of_scope,
          })),
        })
      } catch { /* features endpoint may not exist yet, fail gracefully */ }

      await dispatch(fetchProjectDetail(project.id)).unwrap()
      setIsEditing(false)
    } catch (err: any) {
      console.error('Save failed:', err)
      toast.error('Failed to save features', { description: typeof err === 'string' ? err : JSON.stringify(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    if (project) {
      setEditName(project.name || '')
      setEditDescription(project.description || '')
      setEditStartDate(project.start_date || '')
      setEditEndDate(project.end_date || '')
      setEditFeatures(buildFeaturesFromProject(project))
      setEditOutOfScope(project.out_of_scope || [])
      parseTechStack(project.tech_stack || '')
    }
  }

  const addTag = (list: string[], setList: (v: string[]) => void, value: string, setInput: (v: string) => void) => {
    const trimmed = value.trim()
    if (trimmed && !list.includes(trimmed)) setList([...list, trimmed])
    setInput('')
  }

  const removeTag = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index))
  }

  // Team management
  const loadUsers = async () => {
    try {
      const res = await api.get('/users/')
      const users = Array.isArray(res.data) ? res.data : res.data.results || []
      setAllUsers(users.filter((u: any) => u.is_active).map((u: any) => ({
        id: u.id, email: u.email, full_name: u.full_name,
      })))
    } catch { setAllUsers([]) }
  }

  const openTeamEditor = async () => {
    if (!project) return
    setSelectedUserIds(project.assigned_users?.map(u => u.id) || [])
    const roles: Record<number, string> = {}
    project.assigned_users?.forEach(u => { roles[u.id] = u.role || 'general' })
    setUserRoles(roles)
    await loadUsers()
    setShowTeamEditor(true)
  }

  const toggleUser = (userId: number) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
    if (!selectedUserIds.includes(userId)) {
      setUserRoles(prev => ({ ...prev, [userId]: prev[userId] || 'general' }))
    }
  }

  const handleSaveTeam = async () => {
    if (!project) return
    setSaving(true)
    await dispatch(assignUsersToProject({
      projectId: project.id,
      userIds: selectedUserIds,
      roles: userRoles,
    }))
    dispatch(fetchProjectDetail(project.id))
    setShowTeamEditor(false)
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!project) return
    await dispatch(deleteProject(project.id))
    navigate(isAdmin ? '/admin/projects' : '/projects')
  }

  const handleToggleComplete = async () => {
    if (!project) return
    await dispatch(toggleProjectComplete(project.id))
    dispatch(fetchProjectDetail(project.id))
  }

  const filteredUsers = allUsers.filter(u =>
    !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.full_name && u.full_name.toLowerCase().includes(userSearch.toLowerCase()))
  )

  const getRoleLabel = (value: string) => {
    const found = PROJECT_ROLES.find(r => r.value === value)
    return found ? found.label : value
  }

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalHours = project.entries?.reduce((sum, e) => sum + Number(e.hours || 0), 0) || 0
  const featuresList = buildFeaturesFromProject(project)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back + Title Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(isAdmin ? '/admin/projects' : '/projects')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          {isEditing && canEdit ? (
            <Input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="text-2xl font-bold h-auto py-1 px-2"
              maxLength={200}
            />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          )}
          {(project.start_date || project.end_date) && !isEditing && (
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {project.start_date && <span>Start: {project.start_date}</span>}
              {project.start_date && project.end_date && <span>—</span>}
              {project.end_date && <span>End: {project.end_date}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleToggleComplete}>
              {project.is_completed ? (
                <><ToggleRight className="h-4 w-4 mr-1" /> Mark Active</>
              ) : (
                <><ToggleLeft className="h-4 w-4 mr-1" /> Mark Complete</>
              )}
            </Button>
          )}
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={saving}>
                <XCircle className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save All
              </Button>
            </>
          ) : canEdit ? (
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleStartEdit} title="Edit project">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {isAdmin && (
            <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="premium-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-violet-400 via-purple-500 to-fuchsia-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
              {project.is_completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock className="h-4 w-4 text-violet-500" />}
            </div>
          </CardHeader>
          <CardContent>
            <Badge className={cn('text-xs font-bold px-2 py-0.5', project.is_completed ? 'bg-emerald-500 text-white' : 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-0')}>
              {project.is_completed ? 'Completed' : 'In Progress'}
            </Badge>
          </CardContent>
        </Card>

        <Card className="premium-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-400 via-cyan-500 to-sky-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
              <FileText className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tabular-nums bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">{project.entries?.length || 0}</div>
          </CardContent>
        </Card>

        <Card className="premium-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tabular-nums bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent">{totalHours.toFixed(1)}h</div>
          </CardContent>
        </Card>
      </div>

      {/* Dates (edit mode) */}
      {isEditing && isAdmin && (
        <Card className="premium-card shadow-lg border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Team Section */}
      <Card className="premium-card shadow-lg border-white/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Users className="h-4 w-4" /> Team ({project.assigned_users?.length || 0})
            </CardTitle>
            {isAdmin && !showTeamEditor && (
              <Button variant="outline" size="sm" onClick={openTeamEditor}>
                <Pencil className="h-3 w-3 mr-1" /> Manage Team
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {showTeamEditor ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="pl-10" />
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1.5 border rounded-lg p-2">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                ) : filteredUsers.map(u => (
                  <div key={u.id} className={cn(
                    "flex items-center gap-3 rounded-md p-2.5 transition-colors",
                    selectedUserIds.includes(u.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/30"
                  )}>
                    <Checkbox checked={selectedUserIds.includes(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {selectedUserIds.includes(u.id) && (
                      <Select value={userRoles[u.id] || 'general'} onValueChange={v => setUserRoles(prev => ({ ...prev, [u.id]: v }))}>
                        <SelectTrigger className="w-[160px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {PROJECT_ROLES.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{selectedUserIds.length} user(s) selected</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowTeamEditor(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleSaveTeam} disabled={saving}>
                    {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                    Save Team
                  </Button>
                </div>
              </div>
            </div>
          ) : project.assigned_users && project.assigned_users.length > 0 ? (
            <div className="space-y-3">
              {project.assigned_users.map(u => (
                <div key={u.id} className="group relative overflow-hidden flex items-center gap-4 p-3 rounded-xl bg-gradient-to-r from-primary/5 to-transparent border border-primary/10 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent -translate-x-[200%] group-hover:animate-[shine-sweep_2s_ease-in-out]" />
                  <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm font-black text-primary shadow-inner ring-2 ring-background border border-primary/20">
                    {(u.full_name || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 relative">
                    <p className="text-sm font-bold truncate text-foreground group-hover:text-primary transition-colors">{u.full_name || u.email}</p>
                    <p className="text-xs text-muted-foreground truncate font-medium">{u.email}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{getRoleLabel(u.role)}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No team members assigned yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="premium-card shadow-lg border-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">About this Project</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-1.5">
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={4} maxLength={1000} placeholder="Project scope, what is being built, scale, constraints..." />
              <p className="text-xs text-muted-foreground text-right">{editDescription.length}/1000</p>
            </div>
          ) : (
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap font-medium">
              {project.description || <span className="italic text-muted-foreground/50">No description provided.</span>}
            </p>
          )}
        </CardContent>
      </Card>

      {/* GitHub Repo URL (read-only display — set via admin create) */}
      {project.repo_url && (
        <Card className="premium-card shadow-lg border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Github className="h-4 w-4" /> GitHub Repository
            </CardTitle>
          </CardHeader>
          <CardContent>
            <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1.5 transition-colors">
              <Github className="h-3.5 w-3.5" />
              {project.repo_url}
            </a>
            <p className="text-[11px] text-muted-foreground mt-1.5">Used for Git commit validation on SBU entries.</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ Features & Scope (unified) ═══ */}
      <Card className="premium-card shadow-lg shadow-violet-500/10 border-white/10 overflow-hidden relative">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
        <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
        {/* Gradient header bar */}
        <div className="h-1.5 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500" />
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Layers className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold">Features & Scope</span>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">Each feature has its own success criteria and exclusions</p>
              </div>
            </CardTitle>
            <Badge className="text-xs font-bold bg-violet-500/10 text-violet-700 border-violet-500/20 px-3 py-1">{featuresList.length} feature{featuresList.length !== 1 ? 's' : ''}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isEditing ? (
            <div className="space-y-4">
              {/* Feature cards in edit mode */}
              <div className="space-y-3">
                {editFeatures.map((feat, idx) => (
                  <div key={idx} className="rounded-xl border-2 border-violet-500/10 bg-gradient-to-br from-violet-500/[0.03] to-purple-500/[0.02] overflow-hidden transition-all duration-300 hover:shadow-md hover:border-violet-500/20">
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => updateEditFeature(idx, { expanded: !feat.expanded })}>
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                        <Layers className="h-3.5 w-3.5 text-white" />
                      </div>
                      <span className="text-sm font-bold flex-1 text-violet-900 dark:text-violet-200">{feat.name}</span>
                      {feat.success_criteria && (
                        <Badge className="text-[11px] bg-emerald-500/15 text-emerald-700 border-emerald-500/25 gap-1">
                          <Target className="h-3 w-3" />criteria set
                        </Badge>
                      )}
                      {feat.out_of_scope.length > 0 && (
                        <Badge className="text-[11px] bg-amber-500/15 text-amber-700 border-amber-500/25 gap-1">
                          <Shield className="h-3 w-3" />{feat.out_of_scope.length} excluded
                        </Badge>
                      )}
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeEditFeature(idx) }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      {feat.expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    {feat.expanded && (
                      <div className="px-4 pb-4 pt-2 space-y-4 border-t border-violet-500/10 bg-background/80 backdrop-blur-sm">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5" /> Success Criteria
                          </Label>
                          <Input value={feat.success_criteria} onChange={(e) => updateEditFeature(idx, { success_criteria: e.target.value })} placeholder="e.g., Token expiry, refresh logic, rate limiting" className="text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5" /> Excluded from this Feature
                          </Label>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {feat.out_of_scope.map((s, si) => (
                              <Badge key={si} className="text-xs gap-1.5 pr-1 bg-red-500/10 text-red-700 border-red-500/20 rounded-lg">
                                🚫 {s}
                                <button type="button" onClick={() => removeEditFeatureScope(idx, si)} className="rounded-full p-0.5 hover:bg-destructive/30 transition-colors">
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input value={feat.scopeInput} onChange={(e) => updateEditFeature(idx, { scopeInput: e.target.value })} placeholder="e.g., OAuth" className="text-sm" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditFeatureScope(idx) } }} />
                            <Button type="button" variant="outline" size="sm" onClick={() => addEditFeatureScope(idx)}>Add</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Add feature */}
              <div className="flex gap-2 p-3 rounded-xl border-2 border-dashed border-violet-500/20 bg-violet-500/[0.02]">
                <Input value={featureNameInput} onChange={(e) => setFeatureNameInput(e.target.value)} placeholder="e.g., JWT Authentication" className="h-10" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditFeature() } }} />
                <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5 font-semibold" onClick={addEditFeature}>
                  <Plus className="h-4 w-4" /> Add Feature
                </Button>
              </div>
              {/* Project-level Out of Scope */}
              <div className="p-4 rounded-xl bg-red-500/[0.03] border border-red-500/10 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Shield className="h-3.5 w-3.5 text-red-500" />
                  </div>
                  <Label className="text-sm font-bold">Project-level Exclusions</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editOutOfScope.map((item, i) => (
                    <Badge key={i} className="text-xs gap-1.5 pr-1 bg-red-500/10 text-red-700 border-red-500/20 rounded-lg py-1">
                      🚫 {item}
                      <button type="button" onClick={() => removeTag(editOutOfScope, setEditOutOfScope, i)} className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/30 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={scopeInput} onChange={e => setScopeInput(e.target.value)} placeholder="e.g., Mobile app" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(editOutOfScope, setEditOutOfScope, scopeInput, setScopeInput) } }} />
                  <Button type="button" variant="outline" size="sm" onClick={() => addTag(editOutOfScope, setEditOutOfScope, scopeInput, setScopeInput)}>Add</Button>
                </div>
              </div>
              {/* Project Success Criteria */}
              <div className="p-4 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Target className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <Label className="text-sm font-bold">Project Success Criteria</Label>
                </div>
                <Input value={editSuccessCriteria} onChange={e => setEditSuccessCriteria(e.target.value)} placeholder="e.g., <200ms API, 99.9% uptime" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {featuresList.length > 0 ? (
                featuresList.map((feat, idx) => (
                  <div key={idx} className="group relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-purple-500/[0.02] p-5 transition-all duration-500 hover:shadow-xl hover:shadow-violet-500/10 hover:border-violet-500/40 hover:-translate-y-1">
                    <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent -translate-x-[200%] group-hover:animate-[shine-sweep_2s_ease-in-out_forwards]" />
                    {/* Feature name */}
                    <div className="relative flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20 group-hover:scale-110 transition-transform duration-300">
                        <Layers className="h-4 w-4 text-white" />
                      </div>
                      <h4 className="text-base font-bold tracking-tight">{feat.name}</h4>
                    </div>

                    {/* Criteria & Exclusions */}
                    {(feat.success_criteria || feat.out_of_scope.length > 0) && (
                      <div className="mt-3 space-y-3">
                        {/* Success criteria */}
                        {feat.success_criteria && (
                          <div className="pl-11">
                            <p className="text-[11px] uppercase tracking-wider text-emerald-600 font-bold mb-1.5 flex items-center gap-1">
                              <Target className="h-3 w-3" /> Success Criteria
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {feat.success_criteria.split(',').map((c: string, ci: number) => (
                                <span key={ci} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-medium">
                                  ✅ {c.trim()}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Exclusions */}
                        {feat.out_of_scope.length > 0 && (
                          <div className="pl-11">
                            <p className="text-[11px] uppercase tracking-wider text-red-500 font-bold mb-1.5 flex items-center gap-1">
                              <Shield className="h-3 w-3" /> Excluded
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {feat.out_of_scope.map((s: string, si: number) => (
                                <span key={`oos-${si}`} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-700 border border-red-500/20 font-medium">
                                  🚫 {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-3">
                    <Layers className="h-6 w-6 text-violet-500" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No features defined yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click Edit to add features with success criteria</p>
                </div>
              )}

              {/* Project-level exclusions */}
              {project.out_of_scope && project.out_of_scope.length > 0 && (
                <div className="p-4 rounded-xl bg-red-500/[0.03] border border-red-500/10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <Shield className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <p className="text-sm font-bold">Project-level Exclusions</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {project.out_of_scope.map((item, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-700 border border-red-500/20 font-medium">
                        🚫 {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Project success criteria */}
              {project.success_criteria && (
                <div className="p-4 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Target className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <p className="text-sm font-bold">Project Success Criteria</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {project.success_criteria.split(';').map(s => s.trim()).filter(Boolean).map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-medium">
                        ✅ {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Tech Stack ═══ */}
      <Card className="premium-card shadow-lg shadow-blue-500/10 border-white/10 relative overflow-hidden">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Cpu className="h-3.5 w-3.5 text-blue-500" />
            </div>
            Tech Stack
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {TECH_STACK_CATEGORIES.map(cat => (
                <div key={cat.key} className="space-y-1.5">
                  <Label className="text-xs font-medium">{cat.label}</Label>
                  <Input
                    value={techFields[cat.key] || ''}
                    onChange={e => setTechFields(prev => ({ ...prev, [cat.key]: e.target.value }))}
                    placeholder={cat.placeholder}
                  />
                </div>
              ))}
            </div>
          ) : (
            (() => {
              const techEntries = [
                { label: 'Frontend', value: (project as any).tech_frontend, icon: '🖥️' },
                { label: 'Backend', value: (project as any).tech_backend, icon: '⚙️' },
                { label: 'Database', value: (project as any).tech_database, icon: '🗄️' },
                { label: 'Cloud / Infra', value: (project as any).tech_cloud, icon: '☁️' },
              ].filter(t => t.value)

              if (techEntries.length > 0) {
                return (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {techEntries.map(t => (
                      <div key={t.label} className="group relative overflow-hidden flex items-center gap-3.5 p-4 rounded-xl border border-blue-500/10 bg-gradient-to-br from-blue-500/[0.03] to-transparent hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 hover:-translate-y-0.5">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent -translate-x-[200%] group-hover:animate-[shine-sweep_1.5s_ease-in-out_forwards]" />
                        <div className="relative h-11 w-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl shadow-inner group-hover:scale-110 group-hover:bg-blue-500/20 transition-all duration-300">
                          {t.icon}
                        </div>
                        <div className="relative">
                          <p className="text-[10px] uppercase tracking-widest text-blue-600 dark:text-blue-400 font-bold mb-0.5">{t.label}</p>
                          <p className="text-sm font-bold text-foreground/90">{t.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
              return project.tech_stack ? (
                <p className="text-sm text-muted-foreground">{project.tech_stack}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No tech stack defined.</p>
              )
            })()
          )}
        </CardContent>
      </Card>

      {/* Module Progress Tracker */}
      {project.key_modules && project.key_modules.length > 0 && (
        <Card className="premium-card shadow-lg shadow-emerald-500/10 border-white/10 relative overflow-hidden">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="h-5 w-5" /> Module Progress
                </CardTitle>
                <CardDescription>Track feature completion across your team</CardDescription>
              </div>
              {(() => {
                const ms = project.module_status || []
                const done = ms.filter(m => m.status === 'completed').length
                const total = ms.length
                return (
                  <Badge variant="outline" className="text-sm font-mono">
                    {done}/{total} done
                  </Badge>
                )
              })()}
            </div>
            {(() => {
              const ms = project.module_status || []
              const done = ms.filter(m => m.status === 'completed').length
              const total = ms.length || 1
              const pct = Math.round((done / total) * 100)
              return (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Overall Progress</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })()}
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {(project.module_status || []).map((mod, i) => {
                // v9.0: Find matching feature for criteria display
                const feat = (project as any).features?.find((f: any) => f.name === mod.module)
                return (
                  <div
                    key={i}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5',
                      mod.status === 'completed' ? 'bg-gradient-to-r from-emerald-500/10 to-transparent border-emerald-500/20 hover:border-emerald-500/40'
                        : mod.status === 'in_progress' ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-amber-500/20 hover:border-amber-500/40'
                          : 'bg-gradient-to-r from-muted/30 to-transparent border-muted/50 hover:border-muted'
                    )}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 dark:via-white/5 to-transparent -translate-x-[200%] group-hover:animate-[shine-sweep_2s_ease-in-out_forwards]" />
                    <div className="relative flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 flex flex-shrink-0 items-center justify-center rounded-full border-2 bg-background shadow-inner transition-transform group-hover:scale-110",
                        mod.status === 'completed' ? "border-emerald-500/30 text-emerald-500" :
                          mod.status === 'in_progress' ? "border-amber-500/30 text-amber-500" :
                            "border-muted text-muted-foreground"
                      )}>
                        <span className="text-base">
                          {mod.status === 'completed' ? '✅' : mod.status === 'in_progress' ? '🔵' : '⚪'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium', mod.status === 'completed' && 'line-through text-muted-foreground')}>
                          {mod.module}
                        </p>
                        {mod.users.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {mod.users.join(', ')} · {mod.entry_count} {mod.entry_count === 1 ? 'entry' : 'entries'} · {mod.total_hours}h
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={mod.status === 'completed' ? 'default' : mod.status === 'in_progress' ? 'secondary' : 'outline'}
                        className={cn(
                          'text-xs capitalize',
                          mod.status === 'completed' && 'bg-success'
                        )}
                      >
                        {mod.status === 'in_progress' ? 'In Progress' : mod.status === 'completed' ? 'Done' : 'Untouched'}
                      </Badge>
                    </div>
                    {/* v9.0: Show feature criteria + out_of_scope */}
                    {feat && (feat.success_criteria || (feat.out_of_scope && feat.out_of_scope.length > 0)) && (
                      <div className="mt-2 pt-2 border-t border-dashed flex flex-wrap gap-1.5">
                        {feat.success_criteria && feat.success_criteria.split(',').map((c: string, ci: number) => (
                          <Badge key={ci} variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                            <Target className="h-2 w-2 mr-0.5" />{c.trim()}
                          </Badge>
                        ))}
                        {feat.out_of_scope && feat.out_of_scope.map((s: string, si: number) => (
                          <Badge key={`oos-${si}`} variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                            ✕ {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entry History */}
      <Card className="premium-card shadow-lg border-white/5 relative overflow-hidden">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="text-lg">Entry History</CardTitle>
          <CardDescription>All entries for this project, newest first</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {!project.entries || project.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No entries yet for this project.</p>
              <Button className="mt-4" size="sm" asChild>
                <Link to="/calendar">Log an Entry</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {project.entries.map((entry, idx) => {
                const displayStatus = entry.status === 'pending' ? 'analyzing' : entry.status
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'relative pl-6 pb-4',
                      idx < project.entries.length - 1 && 'border-l-2 border-muted ml-2'
                    )}
                  >
                    <div className={cn(
                      'absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                      entry.status === 'approved' ? 'bg-success'
                        : entry.status === 'flagged' ? 'bg-destructive' : 'bg-amber-500'
                    )} />
                    <div className="rounded-lg border p-4 bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{entry.date}</span>
                          {entry.user_email && (
                            <Badge variant="outline" className="text-xs">{entry.user_email}</Badge>
                          )}
                          {entry.target_module && (
                            <Badge variant="secondary" className="text-xs">
                              📦 {entry.target_module}
                            </Badge>
                          )}
                          {entry.feature_status === 'completed' && (
                            <Badge className="text-xs bg-success">✅ Feature Done</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{entry.hours}h</span>
                          <Badge
                            variant={entry.status === 'approved' ? 'default' : entry.status === 'flagged' ? 'destructive' : 'secondary'}
                            className={cn(
                              'text-xs font-bold uppercase',
                              entry.status === 'approved' && 'bg-success',
                              entry.status === 'pending' && 'bg-amber-500/20 text-amber-700 border-amber-500/30'
                            )}
                          >
                            {displayStatus}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed break-all whitespace-pre-wrap">
                        {entry.learned_text}
                      </p>
                      {entry.blockers_text && (
                        <div className="mt-2 flex items-start gap-1.5">
                          <Flag className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-600">{entry.blockers_text}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      {isAdmin && (
        <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project</AlertDialogTitle>
              <AlertDialogDescription>
                This will soft-delete "{project.name}". The project will be hidden but can be recovered.
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
      )}
    </div>
  )
}
