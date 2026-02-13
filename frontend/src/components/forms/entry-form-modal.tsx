'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { setEntryModalOpen } from '@/lib/store/slices/uiSlice'
import { createEntry, updateEntryThunk, selectEntry, deleteEntryThunk, fetchUserProjects } from '@/lib/store/slices/entriesSlice'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import { TopicPicker } from './topic-picker'
import {
  AlertCircle,
  Bot,
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Lock,
  Target,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import type { EntryFormData, EntryIntent } from '@/lib/types'

const BLOCKER_OPTIONS = ['Technical', 'Environmental', 'Personal', 'Resource', 'Other'] as const

const INTENT_OPTIONS: { value: EntryIntent; label: string; description: string; icon: string }[] = [
  { value: 'lnd_tasks', label: 'L&D Tasks', description: 'Learning & development activities', icon: '📚' },
  { value: 'sbu_tasks', label: 'SBU Tasks', description: 'Hands-on building & implementing', icon: '🛠️' },
]


export function EntryFormModal() {
  const dispatch = useAppDispatch()
  const { entryModalOpen, selectedDate } = useAppSelector((state) => state.ui)
  const { selectedEntry } = useAppSelector((state) => state.entries)
  const { user } = useAppSelector((state) => state.auth)
  const { requests: leaveRequests } = useAppSelector((state) => state.leaveRequests)
  const { topics } = useAppSelector((state) => state.topics)
  const { entries, userProjects } = useAppSelector((state) => state.entries)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [viewState, setViewState] = useState<'list' | 'form'>('list')
  const [projectMode, setProjectMode] = useState<'select' | 'new'>('select')

  const dayEntries = entries.filter(
    (e) => e.date === selectedDate && e.user === user?.id
  )

  const [submitError, setSubmitError] = useState<string | null>(null)

  const isLeaveDay = leaveRequests.some(
    (l) => {
      if (l.user !== user?.id || l.status !== 'approved') return false
      return selectedDate >= l.start_date && selectedDate <= l.end_date
    }
  )

  const [formData, setFormData] = useState<EntryFormData>({
    date: selectedDate,
    intent: 'lnd_tasks',
    topic_id: null,
    project_name: '',
    project_description: '',
    hours: '',
    learned_text: '',
    progress_percent: 0,
    is_completed: false,
    blockers_text: '',
  })

  const [blockerType, setBlockerType] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const prevOpen = useRef(false)

  // Fetch user projects when intent becomes project-based
  const isProjectBased = formData.intent === 'sbu_tasks'
  useEffect(() => {
    if (isProjectBased && entryModalOpen) {
      dispatch(fetchUserProjects())
    }
  }, [isProjectBased, entryModalOpen, dispatch])

  // Auto-set project mode based on whether user has existing projects
  const activeProjects = userProjects.filter(p => !p.is_completed)
  useEffect(() => {
    if (isProjectBased && !selectedEntry) {
      setProjectMode(activeProjects.length > 0 ? 'select' : 'new')
    }
  }, [isProjectBased, activeProjects.length, selectedEntry])

  // Initialize view state ONLY when modal first opens
  useEffect(() => {
    if (entryModalOpen && !prevOpen.current) {
      if (selectedEntry) {
        setIsEditing(selectedEntry.status === 'pending')
        setViewState('form')
      } else if (dayEntries.length > 0) {
        setViewState('list')
        setIsEditing(false)
      } else {
        setViewState('form')
        setIsEditing(true)
      }
    }
    prevOpen.current = entryModalOpen
  }, [entryModalOpen, selectedEntry, dayEntries.length])

  // populate form data when entry selected
  useEffect(() => {
    if (selectedEntry) {
      const hours = Math.floor(selectedEntry.hours)
      const minutes = Math.round((selectedEntry.hours - hours) * 60)
      const hoursStr = `${hours}:${minutes.toString().padStart(2, '0')}`

      setFormData({
        date: selectedEntry.date,
        intent: selectedEntry.intent || 'lnd_tasks',
        topic_id: selectedEntry.topic,
        project_name: selectedEntry.project_name || '',
        project_description: selectedEntry.project_description || '',
        hours: hoursStr,
        learned_text: selectedEntry.learned_text,
        progress_percent: selectedEntry.progress_percent,
        is_completed: selectedEntry.is_completed,
        blockers_text: selectedEntry.blockers_text?.split(':')[1]?.trim() || selectedEntry.blockers_text || '',
      })

      // Extract blocker type if it exists
      if (selectedEntry.blockers_text?.includes(':')) {
        setBlockerType(selectedEntry.blockers_text.split(':')[0])
      } else {
        setBlockerType('')
      }
    } else {
      setFormData({
        date: selectedDate,
        intent: 'lnd_tasks',
        topic_id: null,
        project_name: '',
        project_description: '',
        hours: '',
        learned_text: '',
        progress_percent: 0,
        is_completed: false,
        blockers_text: '',
      })
      setBlockerType('')
    }
  }, [selectedEntry, selectedDate])

  const handleClose = () => {
    dispatch(setEntryModalOpen(false))
    dispatch(selectEntry(null))
    setViewState('list')
  }

  const validateTimeFormat = (timeStr: string): boolean => {
    // Regex for HH:MM format (allows 1 or 2 digits for hours, always 2 for minutes)
    const timeRegex = /^[0-9]{1,2}:[0-5][0-9]$/
    return timeRegex.test(timeStr.trim())
  }

  const parseHours = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return parseFloat((hours + (minutes || 0) / 60).toFixed(2))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const isTopicBased = formData.intent === 'lnd_tasks'
    const isProjectBased = formData.intent === 'sbu_tasks'

    // Validate based on intent
    if (isTopicBased && !formData.topic_id) {
      setSubmitError('Please select a learning topic.')
      return
    }
    if (isProjectBased && !formData.project_name.trim()) {
      setSubmitError('Please enter a project name.')
      return
    }
    // New projects require a description
    if (isProjectBased && projectMode === 'new' && !selectedEntry && !formData.project_description.trim()) {
      setSubmitError('Project description is required for new projects. This helps AI validate your entries.')
      return
    }
    if (!user) return

    // Validate learned_text length
    if (formData.learned_text.length < 50) {
      setSubmitError('Learning log must be at least 50 characters.')
      return
    }

    if (!validateTimeFormat(formData.hours)) {
      setSubmitError('Invalid time format. Please use HH:MM (e.g., 2:30 or 08:45).')
      return
    }

    const hoursDecimal = parseHours(formData.hours)
    if (hoursDecimal < 0.1 || hoursDecimal > 12.0) {
      setSubmitError('Hours must be between 0.1 and 12.0')
      return
    }

    // Proactive Duplicate Check (topic-based or project-based)
    if (isTopicBased) {
      const isDuplicate = dayEntries.some(
        (e) => e.topic === formData.topic_id && (!selectedEntry || e.id !== selectedEntry.id)
      )
      if (isDuplicate) {
        setSubmitError("Topic already entered. Your performance won't be increased by inputting the same topic twice.")
        return
      }
    } else {
      const isDuplicate = dayEntries.some(
        (e) => e.project_name === (formData.project_name || '').trim() && (!selectedEntry || e.id !== selectedEntry.id)
      )
      if (isDuplicate) {
        setSubmitError("Project already entered for today.")
        return
      }
    }

    setSubmitError(null)
    setIsSubmitting(true)

    const payload: any = {
      date: formData.date,
      intent: formData.intent,
      hours: parseHours(formData.hours),
      learned_text: formData.learned_text,
      is_completed: formData.is_completed,
      blockers_text: blockerType
        ? `${blockerType}: ${formData.blockers_text || ''}`
        : formData.blockers_text || null,
    }

    if (isTopicBased) {
      payload.topic = formData.topic_id
      payload.project_name = null
      payload.project_description = null
    } else {
      payload.topic = null
      payload.project_name = formData.project_name.trim()
      payload.project_description = formData.project_description.trim() || null
    }

    // Only send progress_percent when explicitly marking complete
    if (formData.is_completed) {
      payload.progress_percent = 100
    }

    try {
      if (selectedEntry) {
        await dispatch(updateEntryThunk({ id: selectedEntry.id, data: payload })).unwrap()
      } else {
        await dispatch(createEntry(payload)).unwrap()
      }
      handleClose()
    } catch (err: any) {
      // Extract specific field errors if available
      // DRF returns errors as {field: ["error msg"]} or {non_field_errors: ["msg"]}
      let errorMessage = 'Operation failed. Please check inputs.'
      if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        // Collect all field error messages
        const messages: string[] = []
        for (const [_, val] of Object.entries(err)) {
          if (Array.isArray(val)) {
            messages.push(...val.map(String))
          } else if (typeof val === 'string') {
            messages.push(val)
          }
        }
        if (messages.length > 0) {
          errorMessage = messages.join(' ')
        }
      }
      setSubmitError(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedEntry) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this entry? This action cannot be undone.'
    )

    if (confirmed) {
      setIsSubmitting(true)
      try {
        await dispatch(deleteEntryThunk(selectedEntry.id)).unwrap()
        handleClose()
      } catch (err) {
        setSubmitError('Failed to delete entry')
      } finally {
        setIsSubmitting(false)
      }
    }
  }


  /* 
    Calculate "Effective Benchmark" for Parent Topics
    If a topic has children, its benchmark is the SUM of its children's benchmarks.
    This matches the logic in the Training Plan view.
  */
  const calculateEffectiveBenchmark = (topicId: number): number => {
    const topic = topics.find(t => t.id === topicId)
    if (!topic) return 0.0

    // Direct children
    const children = topics.filter(t => t.parent_id === topicId && t.is_active)

    if (children.length > 0) {
      // It's a parent -> Sum children (Recursively?)
      // The Training Plan typically aggregates all descendants. 
      // Let's do a recursive sum to be safe, or just direct children if that's how the model works.
      // Based on 3-level depth (Category -> Topic -> Subtopic), recursion is safest.
      return children.reduce((sum, child) => sum + calculateEffectiveBenchmark(child.id), 0)
    }

    // It's a leaf -> Return direct benchmark
    return Number(topic.benchmark_hours) || 0.0
  }

  const selectedTopic = topics.find((t) => t.id === formData.topic_id)
  const selectedTopicBenchmark = selectedTopic ? calculateEffectiveBenchmark(selectedTopic.id) : 0
  const isViewOnly = !!(selectedEntry && !isEditing)

  // Determine Title
  const getTitle = () => {
    if (viewState === 'list') return 'Daily Activities'
    if (isViewOnly) return 'View Entry'
    if (selectedEntry) return 'Edit Entry'
    return 'New Daily Entry'
  }

  return (
    <Dialog open={entryModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>
            {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </DialogDescription>
        </DialogHeader>

        {isLeaveDay && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-warning-foreground">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm font-medium">
              This date is marked as Leave. You cannot add or edit entries for this date.
            </p>
          </div>
        )}

        {viewState === 'list' ? (
          <div className="space-y-6">
            <div className="space-y-3">
              {dayEntries.map((entry) => {
                const topic = topics.find(t => t.id === entry.topic)
                const displayName = topic?.name || entry.project_name || 'Unknown'
                const intentLabel = INTENT_OPTIONS.find(o => o.value === entry.intent)
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => {
                      dispatch(selectEntry(entry))
                      setViewState('form')
                    }}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{intentLabel?.icon}</span>
                        <span className="font-medium">{displayName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">{entry.status === 'pending' ? 'analyzing' : entry.status}</Badge>
                        <span>{entry.hours} hours</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">Edit / View</Button>
                  </div>
                )
              })}
            </div>

            <Button
              className="w-full"
              onClick={() => {
                dispatch(selectEntry(null))
                setViewState('form')
              }}
              disabled={isLeaveDay}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add New Entry
            </Button>
          </div>
        ) : (
          /* FORM VIEW */
          <div className="space-y-4">
            {dayEntries.length > 0 && !selectedEntry && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewState('list')}
                className="mb-2"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to List
              </Button>
            )}

            {/* AI Analysis (View Mode) */}
            {isViewOnly && selectedEntry?.ai_status === 'analyzed' && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  <span className="font-medium">AI Analysis</span>
                  <Badge
                    variant={
                      selectedEntry.ai_decision === 'approve'
                        ? 'default'
                        : selectedEntry.ai_decision === 'flag'
                          ? 'secondary'
                          : 'destructive'
                    }
                    className={cn(
                      selectedEntry.ai_decision === 'approve' && 'bg-success text-success-foreground'
                    )}
                  >
                    {selectedEntry.ai_decision?.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-muted-foreground ml-auto">
                    Confidence: {selectedEntry.ai_confidence}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-all overflow-hidden">
                  {selectedEntry.ai_chain_of_thought?.final_decision?.reason ||
                    selectedEntry.ai_chain_of_thought?.final_reasoning ||
                    (typeof selectedEntry.ai_chain_of_thought === 'string'
                      ? selectedEntry.ai_chain_of_thought
                      : 'AI analysis logs are available in the Admin details view.')}
                </p>
              </div>
            )}

            {/* Entry Status (View Mode) */}
            {isViewOnly && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Status:</span>
                <Badge
                  variant={
                    selectedEntry?.status === 'approved'
                      ? 'default'
                      : selectedEntry?.status === 'flagged'
                        ? 'secondary'
                        : selectedEntry?.status === 'rejected'
                          ? 'destructive'
                          : 'outline'
                  }
                  className={cn(
                    selectedEntry?.status === 'approved' && 'bg-success text-success-foreground'
                  )}
                >
                  {(selectedEntry?.status === 'pending' ? 'ANALYZING' : selectedEntry?.status?.toUpperCase())}
                </Badge>
                {selectedEntry?.admin_override && (
                  <Badge variant="outline">Admin Override</Badge>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Intent Selector */}
              <div className="space-y-2">
                <Label>Activity Type *</Label>
                {isViewOnly ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <span>{INTENT_OPTIONS.find(o => o.value === formData.intent)?.icon}</span>
                    <span className="font-medium">{INTENT_OPTIONS.find(o => o.value === formData.intent)?.label}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {INTENT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, intent: option.value, topic_id: null, project_name: '', project_description: '' })}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all hover:bg-accent/10",
                          formData.intent === option.value
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        )}
                      >
                        <span className="text-lg">{option.icon}</span>
                        <div>
                          <div className="text-sm font-medium">{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Topic Selection (for lnd_tasks) */}
              {formData.intent === 'lnd_tasks' && (
                <div className="space-y-2">
                  <Label>Learning Topic *</Label>
                  {isViewOnly ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                      <span>{selectedTopic?.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        Benchmark: ~{selectedTopicBenchmark.toFixed(1)}h
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <TopicPicker
                        allTopics={topics}
                        onSelect={(id) => {
                          const t = topics.find(x => x.id === id);
                          setFormData({
                            ...formData,
                            topic_id: id,
                            progress_percent: t?.mastery?.progress || 0
                          })
                        }}
                        placeholder={selectedTopic ? selectedTopic.name : "Select Learning Topic..."}
                      />
                      {selectedTopic && (
                        <div className="flex flex-col gap-2 p-3 bg-primary/5 rounded-md border border-primary/10">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-primary">Selected: {selectedTopic.name}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              Benchmark: ~{selectedTopicBenchmark.toFixed(1)}h
                            </span>
                          </div>
                          {selectedTopic.mastery?.is_locked && (
                            <div className="flex items-center gap-2 p-2 bg-destructive/10 text-destructive rounded border border-destructive/20 text-xs animate-in fade-in slide-in-from-top-1">
                              <Lock className="h-3 w-3" />
                              <span>
                                {selectedEntry?.is_completed
                                  ? "Mastered: This entry marked this area as completed."
                                  : `Mastered: Further logging is locked ${selectedTopic.mastery.lock_reason ? `by ${selectedTopic.mastery.lock_reason}` : 'for this area'}.`}
                              </span>
                            </div>
                          )}
                          {submitError && (
                            <div className="flex items-center gap-2 p-2 bg-destructive/10 text-destructive rounded border border-destructive/20 text-xs animate-in fade-in slide-in-from-top-1">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              <span>{submitError}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Project Fields (for sbu_tasks) */}
              {formData.intent === 'sbu_tasks' && (
                <div className="space-y-4">
                  {/* Project selection: existing projects or new */}
                  {!isViewOnly && !selectedEntry && activeProjects.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Continue Existing or Start New?</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={projectMode === 'select' ? 'default' : 'outline'}
                          className="flex-1 text-xs"
                          onClick={() => {
                            setProjectMode('select')
                            setFormData(f => ({ ...f, project_name: '', project_description: '' }))
                          }}
                        >
                          📂 Continue Project ({activeProjects.length})
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={projectMode === 'new' ? 'default' : 'outline'}
                          className="flex-1 text-xs"
                          onClick={() => {
                            setProjectMode('new')
                            setFormData(f => ({ ...f, project_name: '', project_description: '' }))
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" /> New Project
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Existing project picker */}
                  {!isViewOnly && !selectedEntry && projectMode === 'select' && activeProjects.length > 0 ? (
                    <div className="space-y-2">
                      <Label>Select Project *</Label>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto rounded-lg border p-2">
                        {activeProjects.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setFormData(f => ({
                              ...f,
                              project_name: p.name,
                              project_description: p.description || '',
                            }))}
                            className={cn(
                              "w-full text-left p-2.5 rounded-md border transition-all overflow-hidden",
                              formData.project_name === p.name
                                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                : "border-border hover:border-primary/40 hover:bg-muted/30"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{p.name}</span>
                              <Badge variant="outline" className="text-xs">{p.entry_count} entries</Badge>
                            </div>
                            {p.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-all break-words">{p.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground/60 mt-0.5">Last: {p.latest_date}</p>
                          </button>
                        ))}
                      </div>
                      {formData.project_name && (
                        <div className="p-2 rounded-md bg-muted/30 border">
                          <p className="text-xs text-muted-foreground">Selected: <span className="font-semibold text-foreground">{formData.project_name}</span></p>
                          {formData.project_description && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic break-all line-clamp-2">"{formData.project_description}"</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* New project / editing / view-only */}
                      <div className="space-y-2">
                        <Label>Project Name *</Label>
                        {isViewOnly ? (
                          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm break-all">
                            {formData.project_name}
                          </div>
                        ) : (
                          <Input
                            type="text"
                            placeholder="e.g., E-commerce Platform, Portfolio Website..."
                            value={formData.project_name}
                            onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                            maxLength={200}
                            required
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>
                          Project Description {projectMode === 'new' && !selectedEntry ? (
                            <span className="text-destructive text-xs">* (required for new projects)</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">(optional)</span>
                          )}
                        </Label>
                        {isViewOnly ? (
                          formData.project_description ? (
                            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm break-all">
                              {formData.project_description}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No description provided</p>
                          )
                        ) : (
                          <Textarea
                            placeholder="Describe the project so the AI can validate your entries against it. What are you building? What tech stack? What are the goals?"
                            value={formData.project_description}
                            onChange={(e) => setFormData({ ...formData, project_description: e.target.value })}
                            className={cn("min-h-[80px] resize-y", projectMode === 'new' && !selectedEntry && !formData.project_description.trim() && "border-destructive/50")}
                            maxLength={500}
                            required={projectMode === 'new' && !selectedEntry}
                          />
                        )}
                        {projectMode === 'new' && !selectedEntry && (
                          <p className="text-xs text-muted-foreground">This description helps the AI understand your project context and validate future entries.</p>
                        )}
                      </div>
                    </>
                  )}

                  {submitError && (
                    <div className="flex items-center gap-2 p-2 bg-destructive/10 text-destructive rounded border border-destructive/20 text-xs animate-in fade-in slide-in-from-top-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Progress Bar (Topic-based entries only) */}
              {formData.intent === 'lnd_tasks' && selectedTopic && (
                <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/10">
                  <div className="flex items-center justify-between">
                    {(() => {
                      const parentTopic = selectedTopic?.parent_id ? topics.find(t => t.id === selectedTopic.parent_id) : null

                      // Calculate optimistic progress
                      let displayProgress = selectedTopic?.mastery?.progress || 0
                      let displayLabel = "Conceptual Progress"

                      if (parentTopic && selectedTopic) {
                        const siblings = topics.filter(t => t.parent_id === parentTopic.id && t.is_active)
                        const siblingCount = siblings.length

                        if (siblingCount > 0) {
                          const otherSiblingsProgress = siblings
                            .filter(s => s.id !== selectedTopic.id)
                            .reduce((sum, s) => sum + (s.mastery?.progress || 0), 0)

                          const currentTopicProgress = formData.is_completed ? 100 : 0
                          displayProgress = (otherSiblingsProgress + currentTopicProgress) / siblingCount
                          displayLabel = parentTopic.name
                        }
                      } else if (selectedTopic) {
                        displayProgress = formData.is_completed ? 100 : 0
                        displayLabel = selectedTopic.name
                      }

                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-primary" />
                            <Label className="font-semibold">Conceptual Progress</Label>
                          </div>
                          <Badge variant="secondary" className="font-mono">
                            {displayLabel}: {Math.round(displayProgress)}%
                          </Badge>
                        </>
                      )
                    })()}
                  </div>

                  <div className="space-y-4">
                    {(() => {
                      const parentTopic = selectedTopic?.parent_id ? topics.find(t => t.id === selectedTopic.parent_id) : null
                      let displayProgress = selectedTopic?.mastery?.progress || 0

                      if (parentTopic && selectedTopic) {
                        const siblings = topics.filter(t => t.parent_id === parentTopic.id && t.is_active)
                        const siblingCount = siblings.length
                        if (siblingCount > 0) {
                          const otherSiblingsProgress = siblings
                            .filter(s => s.id !== selectedTopic.id)
                            .reduce((sum, s) => sum + (s.mastery?.progress || 0), 0)
                          const currentTopicProgress = formData.is_completed ? 100 : 0
                          displayProgress = (otherSiblingsProgress + currentTopicProgress) / siblingCount
                        }
                      } else if (selectedTopic) {
                        displayProgress = formData.is_completed ? 100 : 0
                      }
                      return <Progress value={displayProgress} className="h-2" />
                    })()}
                  </div>

                  {!isViewOnly && (
                    <div className="flex items-start space-x-3 rounded-md border border-border bg-background p-3 shadow-sm transition-all hover:bg-accent/5">
                      <Checkbox
                        id="is_completed"
                        checked={formData.is_completed}
                        onCheckedChange={(checked) => setFormData({
                          ...formData,
                          is_completed: !!checked
                        })}
                        // Allow toggling completion if we are editing an existing entry
                        disabled={selectedTopic?.mastery?.is_locked && !selectedEntry}
                        className="mt-1"
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor="is_completed"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          Mark as Completed
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Toggle if you have finished all sub-tasks and requirements for this area.
                        </p>
                      </div>
                    </div>
                  )}

                  {isViewOnly && formData.is_completed && (
                    <div className="flex items-center gap-2 text-xs font-medium text-success bg-success/10 p-2 rounded border border-success/20">
                      <Check className="h-3 w-3" />
                      Topic marked as completed in this log.
                    </div>
                  )}
                </div>
              )}

              {/* Mark Complete for project-based entries */}
              {formData.intent === 'sbu_tasks' && !isViewOnly && (
                <div className="flex items-start space-x-3 rounded-md border border-border bg-background p-3 shadow-sm transition-all hover:bg-accent/5">
                  <Checkbox
                    id="is_completed_project"
                    checked={formData.is_completed}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      is_completed: !!checked
                    })}
                    className="mt-1"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="is_completed_project"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Mark Project as Completed
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Toggle if this project milestone / task is finished.
                    </p>
                  </div>
                </div>
              )}

              {/* Time Spent */}
              <div className="space-y-2">
                <Label>Time Spent *</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {isViewOnly ? (
                    <span>{formData.hours}</span>
                  ) : (
                    <Input
                      type="text"
                      placeholder="HH:MM (e.g., 4:30)"
                      value={formData.hours}
                      onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                      className="max-w-[150px]"
                      required
                    />
                  )}
                  {selectedTopic && (
                    <span className="text-xs text-muted-foreground">
                      Topic benchmark: ~{selectedTopicBenchmark.toFixed(1)} hours
                    </span>
                  )}
                </div>
              </div>

              {/* Learning Description */}
              <div className="space-y-2">
                <Label>What did you learn? *</Label>
                {isViewOnly ? (
                  <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm break-all whitespace-pre-wrap">
                    {formData.learned_text}
                  </p>
                ) : (
                  <>
                    <Textarea
                      placeholder="Describe what you learned today. Include context for time variance (e.g., debugging issues, setup problems, etc.)"
                      value={formData.learned_text}
                      onChange={(e) => setFormData({ ...formData, learned_text: e.target.value })}
                      className="min-h-[120px] resize-y"
                      required
                      minLength={50}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.learned_text.length}/500 characters (min: 50)
                    </p>
                  </>
                )}
              </div>

              {/* Blockers */}
              <div className="space-y-2">
                <Label>Blockers (Optional)</Label>
                {isViewOnly ? (
                  formData.blockers_text ? (
                    <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm break-all whitespace-pre-wrap">
                      {formData.blockers_text}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No blockers reported</p>
                  )
                ) : (
                  <div className="space-y-2">
                    <Select
                      value={blockerType}
                      onValueChange={(value) => setBlockerType(value)}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Blocker type (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOCKER_OPTIONS.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Describe the blocker..."
                      value={formData.blockers_text}
                      onChange={(e) => setFormData({ ...formData, blockers_text: e.target.value })}
                      className="min-h-[80px] resize-y"
                    />
                  </div>
                )}
              </div>

            </form>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {isViewOnly ? 'Close' : 'Cancel'}
              </Button>
              {selectedEntry && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  className="mr-auto"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Entry
                </Button>
              )}
              {isViewOnly ? (
                <Button type="button" onClick={() => setIsEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Entry
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting ||
                    (formData.intent === 'lnd_tasks' && !formData.topic_id) ||
                    (formData.intent === 'sbu_tasks' && !(formData.project_name || '').trim()) ||
                    isLeaveDay ||
                    (selectedTopic?.mastery?.is_locked && !selectedEntry)
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {selectedEntry ? 'Update Entry' : 'Submit Entry'}
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </div>
        )
        }
      </DialogContent >
    </Dialog >
  )
}
