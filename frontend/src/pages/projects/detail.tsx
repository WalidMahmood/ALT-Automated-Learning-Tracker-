import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import {
  fetchProjectDetail,
  updateProject,
  deleteProject,
  toggleProjectComplete,
  clearSelectedProject,
} from '@/lib/store/slices/projectsSlice'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
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
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  Loader2,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { selectedProject: project, isLoading } = useAppSelector((state) => state.projects)

  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    if (id) dispatch(fetchProjectDetail(Number(id)))
    return () => { dispatch(clearSelectedProject()) }
  }, [dispatch, id])

  useEffect(() => {
    if (project) {
      setEditName(project.name)
      setEditDescription(project.description || '')
    }
  }, [project])

  const handleSaveEdit = async () => {
    if (!project) return
    await dispatch(updateProject({
      id: project.id,
      data: { name: editName, description: editDescription },
    }))
    dispatch(fetchProjectDetail(project.id))
    setShowEdit(false)
  }

  const handleDelete = async () => {
    if (!project) return
    await dispatch(deleteProject(project.id))
    navigate('/projects')
  }

  const handleToggleComplete = async () => {
    if (!project) return
    await dispatch(toggleProjectComplete(project.id))
    dispatch(fetchProjectDetail(project.id))
  }

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalHours = project.entries?.reduce((sum, e) => sum + Number(e.hours || 0), 0) || 0
  const latestProgress = project.entries?.length
    ? Math.max(...project.entries.map((e) => Number(e.progress_percent || 0)))
    : 0

  return (
    <div className="space-y-6">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>

        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToggleComplete}>
            {project.is_completed ? (
              <><ToggleRight className="h-4 w-4 mr-1" /> Mark Active</>
            ) : (
              <><ToggleLeft className="h-4 w-4 mr-1" /> Mark Complete</>
            )}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowEdit(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            {project.is_completed ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <Clock className="h-4 w-4 text-blue-500" />
            )}
          </CardHeader>
          <CardContent>
            <Badge
              className={cn(
                'text-xs font-bold',
                project.is_completed ? 'bg-success' : 'bg-blue-500/20 text-blue-700 border-blue-500/30'
              )}
            >
              {project.is_completed ? 'Completed' : 'In Progress'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.entries?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(latestProgress)}%</div>
            <Progress value={latestProgress} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Description Box */}
      {project.description && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">About this Project</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed break-all whitespace-pre-wrap">
              {project.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stacked Entries Timeline */}
      <Card className="shadow-md">
        <CardHeader className="border-b pb-4">
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
                    {/* Timeline dot */}
                    <div className={cn(
                      'absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                      entry.status === 'approved' ? 'bg-success'
                        : entry.status === 'flagged' ? 'bg-destructive'
                          : 'bg-amber-500'
                    )} />

                    <div className="rounded-lg border p-4 bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{entry.date}</span>
                          <Badge variant="outline" className="text-xs">
                            {entry.intent.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">
                            {entry.hours}h
                          </span>
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

                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-muted-foreground">
                          Progress: {Math.round(Number(entry.progress_percent))}%
                        </span>
                        {entry.is_completed && (
                          <Badge className="text-xs bg-success">Completed</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update the project name or description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete "{project.name}". The project will be hidden
              but can be recovered by an admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
