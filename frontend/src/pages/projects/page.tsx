import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import {
  fetchProjects,
  updateProject,
} from '@/lib/store/slices/projectsSlice'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FolderKanban,
  Pencil,
  Search,
  Loader2,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project } from '@/lib/types'

export default function ProjectsPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { projects, isLoading } = useAppSelector((state) => state.projects)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showEdit, setShowEdit] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editDescription, setEditDescription] = useState('')

  useEffect(() => {
    dispatch(fetchProjects({}))
  }, [dispatch])

  const handleEdit = (project: Project) => {
    setEditProject(project)
    setEditDescription(project.description || '')
    setShowEdit(true)
  }

  const handleSaveEdit = async () => {
    if (!editProject) return
    await dispatch(updateProject({
      id: editProject.id,
      data: { description: editDescription },
    }))
    dispatch(fetchProjects({}))
    setShowEdit(false)
  }

  const filtered = projects.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter === 'completed' && !p.is_completed) return false
    if (statusFilter === 'in_progress' && p.is_completed) return false
    return true
  })

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Projects</h1>
          <p className="text-muted-foreground">Your assigned SBU Tasks and project activities</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{projects.length} projects</span>
          <span>|</span>
          <span>{projects.filter(p => p.is_completed).length} completed</span>
        </div>
      </div>

      {/* Filters */}
      <Card className="premium-card shadow-sm">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card className="premium-card shadow-lg">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-lg">Projects</CardTitle>
          <p className="text-sm text-muted-foreground">Click a project to see its full entry history</p>
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
              <p className="text-xs text-muted-foreground/60 mt-1">
                Projects are assigned to you by your admin.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="grid grid-cols-[1fr_80px_100px_120px_100px_60px] gap-4 p-3 text-xs font-bold uppercase text-muted-foreground border-b bg-muted/30">
                <span>Project</span>
                <span className="text-center">Entries</span>
                <span className="text-center">Latest</span>
                <span className="text-center">Timeline</span>
                <span className="text-center">Status</span>
                <span className="text-center">Actions</span>
              </div>
              {filtered.map((project) => (
                <div
                  key={project.id}
                  className="grid grid-cols-[1fr_80px_100px_120px_100px_60px] gap-4 p-3 items-center border-b last:border-b-0 premium-table-row"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div>
                    <Link
                      to={`/projects/${project.id}`}
                      className="text-sm font-semibold text-primary hover:underline uppercase"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {project.name}
                    </Link>
                  </div>
                  <span className="text-sm text-center">{project.entry_count}</span>
                  <span className="text-sm text-center text-muted-foreground">
                    {project.latest_date || '—'}
                  </span>
                  <div className="text-center">
                    {project.end_date ? (
                      <div className="flex items-center justify-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{project.end_date}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="text-center">
                    <Badge
                      className={cn(
                        'text-xs font-bold',
                        project.is_completed
                          ? 'bg-success'
                          : 'bg-blue-500/20 text-blue-700 border-blue-500/30'
                      )}
                    >
                      {project.is_completed ? 'COMPLETED' : 'IN PROGRESS'}
                    </Badge>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(project)
                      }}
                      title="Edit description"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Description Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project Description</DialogTitle>
            <DialogDescription>
              Update the project scope/description for "{editProject?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Describe the project scope, goals, and tech stack..."
              />
              <p className="text-xs text-muted-foreground">{editDescription.length}/500 characters</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
