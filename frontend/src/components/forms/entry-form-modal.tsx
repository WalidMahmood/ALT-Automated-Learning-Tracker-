'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { setEntryModalOpen } from '@/lib/store/slices/uiSlice'
import { createEntry, updateEntryThunk, selectEntry, deleteEntryThunk, fetchUserProjects } from '@/lib/store/slices/entriesSlice'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
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
  FolderKanban,
  Layers,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Lock,
  Target,
} from 'lucide-react'
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
    project_id: null,
    project_name: '',
    project_description: '',
    hours: '',
    learned_text: '',
    progress_percent: 0,
    is_completed: false,
    blockers_text: '',
    target_module: null,
    feature_status: 'in_progress',
    is_non_coding: false,
  })

  const [blockerType, setBlockerType] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const prevOpen = useRef(false)

  const [newFeatureName, setNewFeatureName] = useState('')
  const [newFeatureCriteria, setNewFeatureCriteria] = useState('')
  const [newFeatureScope, setNewFeatureScope] = useState('')
  const [addingFeature, setAddingFeature] = useState(false)

  const handleAddNewFeature = async () => {
    if (!newFeatureName.trim() || !formData.project_id || addingFeature) return
    setAddingFeature(true)
    setSubmitError(null)
    try {
      const selectedProject = activeProjects.find(p => p.id === formData.project_id)
      const existingPayload = (selectedProject?.features || []).map((f: any) => ({
        name: f.name,
        description: f.description,
        success_criteria: f.success_criteria,
        out_of_scope: f.out_of_scope
      }))

      existingPayload.push({
        name: newFeatureName.trim(),
        description: '',
        success_criteria: '',
        out_of_scope: []
      })

      await api.post(`/projects/${formData.project_id}/manage_features/`, { features: existingPayload })

      await dispatch(fetchUserProjects()).unwrap()

      setFormData(f => ({ ...f, target_module: newFeatureName.trim() }))
      setNewFeatureName('')
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || 'Failed to add feature')
    } finally {
      setAddingFeature(false)
    }
  }

  // Fetch user projects when intent becomes project-based
  const isProjectBased = formData.intent === 'sbu_tasks'
  useEffect(() => {
    if (isProjectBased && entryModalOpen) {
      dispatch(fetchUserProjects())
    }
  }, [isProjectBased, entryModalOpen, dispatch])

  // Filter active (non-completed) assigned projects
  const activeProjects = userProjects.filter(p => !p.is_completed)

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
        project_id: selectedEntry.project,
        project_name: selectedEntry.project_name || '',
        project_description: selectedEntry.project_description || '',
        hours: hoursStr,
        learned_text: selectedEntry.learned_text,
        progress_percent: selectedEntry.progress_percent,
        is_completed: selectedEntry.is_completed,
        blockers_text: selectedEntry.blockers_text?.split(':')[1]?.trim() || selectedEntry.blockers_text || '',
        target_module: selectedEntry.target_module || null,
        feature_status: selectedEntry.feature_status || 'in_progress',
        is_non_coding: selectedEntry.is_non_coding || false,
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
        project_id: null,
        project_name: '',
        project_description: '',
        hours: '',
        learned_text: '',
        progress_percent: 0,
        is_completed: false,
        blockers_text: '',
        target_module: null,
        feature_status: 'in_progress',
        is_non_coding: false,
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
    if (isProjectBased && !formData.project_id) {
      setSubmitError('Please select an assigned project.')
      return
    }
    // Validate module selection for projects that have modules
    if (isProjectBased && formData.project_id) {
      const proj = activeProjects.find(p => p.id === formData.project_id)
      if (proj?.key_modules && proj.key_modules.length > 0 && !formData.target_module) {
        setSubmitError('Please select a module/feature to work on.')
        return
      }
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
        (e) => e.project === formData.project_id && e.target_module === formData.target_module && (!selectedEntry || e.id !== selectedEntry.id)
      )
      if (isDuplicate) {
        setSubmitError("You already have an entry for this module today.")
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
      payload.project = null
    } else {
      payload.topic = null
      payload.project = formData.project_id
      payload.target_module = formData.target_module
      payload.feature_status = formData.feature_status
      payload.is_non_coding = formData.is_non_coding
      // Set is_completed based on feature_status for backward compat
      payload.is_completed = formData.feature_status === 'completed'
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden glass-panel border-white/10 shadow-2xl">
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
                        onClick={() => setFormData({ ...formData, intent: option.value, topic_id: null, project_id: null, project_name: '', project_description: '' })}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all hover:bg-accent/10 premium-card",
                          formData.intent === option.value
                            ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                            : "border-border/50"
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
                          setFormData({
                            ...formData,
                            topic_id: id,
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

              {/* Project Fields (for sbu_tasks) — Assigned Projects Only */}
              {formData.intent === 'sbu_tasks' && (
                <div className="space-y-4">
                  {isViewOnly ? (
                    /* View mode: show project name and description */
                    <div className="space-y-2">
                      <Label>Project</Label>
                      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm break-all">
                        {formData.project_name || 'Unknown Project'}
                      </div>
                      {formData.project_description && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm break-all">
                            {formData.project_description}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activeProjects.length > 0 ? (
                    /* Edit/Create mode: show assigned project list */
                    <div className="space-y-2">
                      <Label>Select Assigned Project *</Label>
                      <div className="space-y-2 max-h-[250px] overflow-y-auto rounded-xl border border-white/5 bg-muted/10 p-2 no-scrollbar shadow-inner">
                        {activeProjects.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setFormData(f => ({
                              ...f,
                              project_id: p.id,
                              project_name: p.name,
                              project_description: p.description || '',
                            }))}
                            className={cn(
                              "group relative w-full text-left p-3.5 rounded-xl border transition-all duration-300 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5",
                              formData.project_id === p.id
                                ? "border-primary bg-gradient-to-r from-primary/10 to-transparent ring-1 ring-primary/30"
                                : "border-border/50 hover:border-primary/40 bg-card hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent"
                            )}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent -translate-x-[200%] group-hover:animate-[shine-sweep_1.5s_ease-in-out_forwards]" />
                            <div className="relative">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={cn(
                                  "text-sm font-bold truncate pr-3",
                                  formData.project_id === p.id ? "text-primary" : "text-foreground group-hover:text-primary transition-colors"
                                )}>
                                  {p.name}
                                </span>
                                <Badge variant={formData.project_id === p.id ? "default" : "secondary"} className="text-[10px] shrink-0 font-bold uppercase tracking-wider">
                                  {p.entry_count} entries
                                </Badge>
                              </div>
                              {p.latest_date && (
                                <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest font-semibold flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> Last Entry: {p.latest_date}
                                </p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                      {formData.project_id && (
                        <div className="p-2 rounded-md bg-muted/30 border">
                          <p className="text-xs text-muted-foreground break-all">Selected: <span className="font-semibold text-foreground">{formData.project_name}</span></p>
                          {formData.project_description && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic break-all line-clamp-2">"{formData.project_description}"</p>
                          )}
                        </div>
                      )}

                      {/* Module Picker */}
                      {formData.project_id && (() => {
                        const selectedProject = activeProjects.find(p => p.id === formData.project_id)
                        const modules = selectedProject?.key_modules || []
                        const moduleStatus = selectedProject?.module_status || []
                        return (
                          <div className="space-y-2">
                            <Label className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Select Module / Feature *</Label>

                            {modules.length > 0 && (
                              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 no-scrollbar rounded-xl border border-white/5 bg-muted/10 p-2 shadow-inner">
                                {modules.map(mod => {
                                  const status = moduleStatus.find(s => s.module === mod)
                                  const isCompleted = status?.status === 'completed'
                                  const isInProgress = status?.status === 'in_progress'
                                  const isSelected = formData.target_module === mod
                                  // Allow selecting completed module if editing the entry that completed it
                                  const isLockedOut = isCompleted && !(selectedEntry?.target_module === mod && selectedEntry?.feature_status === 'completed')
                                  return (
                                    <button
                                      key={mod}
                                      type="button"
                                      disabled={isLockedOut}
                                      onClick={() => setFormData(f => ({ ...f, target_module: mod }))}
                                      className={cn(
                                        "group relative flex items-start gap-2 max-w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all duration-300 shadow-sm overflow-hidden",
                                        isLockedOut
                                          ? "bg-muted text-muted-foreground/40 border-muted cursor-not-allowed"
                                          : isSelected
                                            ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/30 hover:shadow-md hover:-translate-y-0.5"
                                            : isInProgress
                                              ? "bg-gradient-to-r from-amber-500/10 to-amber-500/5 text-amber-900 dark:text-amber-100 border-amber-500/30 hover:border-amber-500/50 hover:shadow-md hover:-translate-y-0.5"
                                              : "bg-card border-border hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
                                      )}
                                    >
                                      {!isLockedOut && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent -translate-x-[200%] group-hover:animate-[shine-sweep_1.5s_ease-in-out_forwards]" />}
                                      <span className="shrink-0 text-sm mt-0.5 relative z-10">
                                        {isCompleted ? '✅' : isInProgress ? '🔵' : '⚪'}
                                      </span>
                                      <div className="flex-1 min-w-0 relative z-10 flex items-center justify-between gap-3">
                                        <span className={cn("flex-1 min-w-0 break-all whitespace-normal leading-relaxed font-semibold", isLockedOut && "line-through")}>
                                          {mod}
                                        </span>
                                        {isCompleted && <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0 bg-success/10 text-success border-success/30 font-bold">Completed</Badge>}
                                        {isInProgress && <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold">In Progress</Badge>}
                                        {(!isCompleted && !isInProgress) && <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0 opacity-50 font-bold">Planned</Badge>}
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            )}

                            {/* Inline Feature Add */}
                            <div className="flex flex-col gap-2 p-3 bg-muted/20 border border-white/5 rounded-xl mt-2 relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                              <div className="relative">
                                <Label className="text-xs mb-1.5 block text-muted-foreground font-semibold">Create New Feature</Label>
                                <Input
                                  value={newFeatureName}
                                  onChange={e => setNewFeatureName(e.target.value)}
                                  placeholder={modules.length === 0 ? "Project has no features. Create one now..." : "Feature name (e.g. Authentication)"}
                                  className="h-9 text-xs bg-background shadow-sm mb-2"
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      if (newFeatureName.trim()) handleAddNewFeature()
                                    }
                                  }}
                                />
                                {newFeatureName.trim() && (
                                  <div className="space-y-2 mb-2 animate-in fade-in slide-in-from-top-1">
                                    <div>
                                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-1">Success Criteria (Optional)</Label>
                                      <Textarea
                                        value={newFeatureCriteria}
                                        onChange={e => setNewFeatureCriteria(e.target.value)}
                                        placeholder="Comma separated criteria"
                                        className="min-h-[60px] text-xs bg-background resize-none"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-1">Out of Scope (Optional)</Label>
                                      <Input
                                        value={newFeatureScope}
                                        onChange={e => setNewFeatureScope(e.target.value)}
                                        placeholder="Comma separated exclusions"
                                        className="h-8 text-xs bg-background"
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault()
                                            handleAddNewFeature()
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-full h-8 text-xs font-semibold shadow-sm"
                                  disabled={!newFeatureName.trim() || addingFeature}
                                  onClick={handleAddNewFeature}
                                >
                                  {addingFeature ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                                  Add Feature
                                </Button>
                              </div>
                            </div>

                            {formData.target_module && (
                              <p className="text-xs text-muted-foreground break-all">Working on: <span className="font-semibold text-foreground">{formData.target_module}</span></p>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    /* No assigned projects */
                    <div className="flex flex-col items-center justify-center py-6 text-center rounded-lg border border-dashed border-muted-foreground/30">
                      <FolderKanban className="h-8 w-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">No projects assigned to you yet.</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Contact your admin to get assigned to a project.</p>
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
                    <div className="space-y-2 rounded-lg border border-border p-4 bg-muted/10">
                      <Label className="text-sm font-medium">Learning Status</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, is_completed: false })}
                          disabled={selectedTopic?.mastery?.is_locked && !selectedEntry}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                            !formData.is_completed
                              ? "border-amber-500 bg-amber-500/10"
                              : "border-border hover:border-amber-500/40"
                          )}
                        >
                          <span className="text-lg">🔄</span>
                          <div>
                            <div className="text-sm font-medium">In Progress</div>
                            <div className="text-xs text-muted-foreground">Still learning this topic</div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, is_completed: true })}
                          disabled={selectedTopic?.mastery?.is_locked && !selectedEntry}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                            formData.is_completed
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-border hover:border-emerald-500/40"
                          )}
                        >
                          <span className="text-lg">✅</span>
                          <div>
                            <div className="text-sm font-medium">Completed</div>
                            <div className="text-xs text-muted-foreground">Finished all requirements</div>
                          </div>
                        </button>
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

              {/* Feature Status for project-based entries */}
              {formData.intent === 'sbu_tasks' && formData.target_module && !isViewOnly && (
                <div className="space-y-2 rounded-lg border border-border p-4 bg-muted/10">
                  <Label className="text-sm font-medium">Feature Status</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, feature_status: 'in_progress', is_completed: false })}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                        formData.feature_status === 'in_progress'
                          ? "border-amber-500 bg-amber-500/10"
                          : "border-border hover:border-amber-500/40"
                      )}
                    >
                      <span className="text-lg">🔄</span>
                      <div>
                        <div className="text-sm font-medium">In Progress</div>
                        <div className="text-xs text-muted-foreground">Still working on this feature</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, feature_status: 'completed', is_completed: true })}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                        formData.feature_status === 'completed'
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border hover:border-emerald-500/40"
                      )}
                    >
                      <span className="text-lg">✅</span>
                      <div>
                        <div className="text-sm font-medium">Feature Completed</div>
                        <div className="text-xs text-muted-foreground">This feature/module is done</div>
                      </div>
                    </button>
                  </div>
                  {formData.feature_status === 'completed' && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Once completed, this module will be locked from future entries.
                    </p>
                  )}
                </div>
              )}

              {/* Non-coding work checkbox (SBU only, edit mode) */}
              {formData.intent === 'sbu_tasks' && !isViewOnly && (
                <div className="flex items-center gap-3 rounded-lg border border-border p-3 bg-muted/10">
                  <input
                    type="checkbox"
                    id="is_non_coding"
                    checked={formData.is_non_coding}
                    onChange={(e) => setFormData({ ...formData, is_non_coding: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <label htmlFor="is_non_coding" className="text-sm cursor-pointer">
                    <span className="font-medium">Non-coding work</span>
                    <span className="text-xs text-muted-foreground ml-1">(design, meetings, docs — skip Git validation)</span>
                  </label>
                </div>
              )}

              {/* View mode: show module + feature status */}
              {formData.intent === 'sbu_tasks' && isViewOnly && formData.target_module && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">Module: {formData.target_module}</Badge>
                  <Badge
                    variant={formData.feature_status === 'completed' ? 'default' : 'outline'}
                    className={cn('text-xs', formData.feature_status === 'completed' && 'bg-success text-success-foreground')}
                  >
                    {formData.feature_status === 'completed' ? '✅ Completed' : '🔄 In Progress'}
                  </Badge>
                </div>
              )}

              {/* Git Validation Badge (view mode, SBU only) */}
              {formData.intent === 'sbu_tasks' && isViewOnly && selectedEntry && selectedEntry.git_validation_result && selectedEntry.git_validation_result !== 'pending' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={cn('text-xs gap-1',
                      selectedEntry.git_validation_result === 'match' && 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
                      selectedEntry.git_validation_result === 'partial' && 'bg-amber-500/10 text-amber-700 border-amber-500/20',
                      selectedEntry.git_validation_result === 'no_match' && 'bg-gray-500/10 text-gray-500 border-gray-500/20',
                      selectedEntry.git_validation_result === 'skipped' && 'bg-gray-500/10 text-gray-400 border-gray-500/20',
                    )}
                  >
                    {selectedEntry.git_validation_result === 'match' && '✅'}
                    {selectedEntry.git_validation_result === 'partial' && '⚡'}
                    {selectedEntry.git_validation_result === 'no_match' && '—'}
                    {selectedEntry.git_validation_result === 'skipped' && '⏭️'}
                    Git: {selectedEntry.git_validation_result}
                    {(selectedEntry.git_evidence?.commits_found ?? 0) > 0 && (
                      <span className="ml-1">({selectedEntry.git_evidence!.commits_found} commits)</span>
                    )}
                  </Badge>
                  {selectedEntry.is_non_coding && (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">Non-coding</Badge>
                  )}
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
                    (formData.intent === 'sbu_tasks' && !formData.project_id) ||
                    (formData.intent === 'sbu_tasks' && formData.project_id && (() => {
                      const proj = activeProjects.find(p => p.id === formData.project_id)
                      return proj?.key_modules && proj.key_modules.length > 0 && !formData.target_module
                    })()) ||
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
