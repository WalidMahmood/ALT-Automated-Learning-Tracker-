'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { setEntryModalOpen } from '@/lib/store/slices/uiSlice'
import { addEntry, updateEntry, selectEntry, deleteEntry } from '@/lib/store/slices/entriesSlice'
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
import { TopicSelector } from './topic-selector'
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
} from 'lucide-react'
import { mockTopics } from '@/lib/mock-data'
import type { Entry, ExtraLearningFormData, EntryFormData } from '@/lib/types'

const BLOCKER_OPTIONS = ['Technical', 'Environmental', 'Personal', 'Resource', 'Other'] as const

interface ExtraLearningItemProps {
  index: number
  data: ExtraLearningFormData
  onChange: (index: number, data: ExtraLearningFormData) => void
  onRemove: (index: number) => void
}

function ExtraLearningItem({ index, data, onChange, onRemove }: ExtraLearningItemProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Additional Learning #{index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Activity Name</Label>
        <Input
          placeholder="e.g., Code review, Team meeting, Documentation"
          value={data.activity_name}
          onChange={(e) => onChange(index, { ...data, activity_name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Time Spent</Label>
          <Input
            type="text"
            placeholder="HH:MM"
            value={data.hours}
            onChange={(e) => onChange(index, { ...data, hours: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Blockers (Optional)</Label>
          <Input
            placeholder="Any blockers..."
            value={data.blockers_text}
            onChange={(e) => onChange(index, { ...data, blockers_text: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="What did you learn? (50-500 characters)"
          value={data.description}
          onChange={(e) => onChange(index, { ...data, description: e.target.value })}
          className="min-h-[80px] resize-y"
        />
        <p className="text-xs text-muted-foreground">
          {data.description.length}/500 characters
        </p>
      </div>
    </div>
  )
}

export function EntryFormModal() {
  const dispatch = useAppDispatch()
  const { entryModalOpen, selectedDate } = useAppSelector((state) => state.ui)
  const { selectedEntry } = useAppSelector((state) => state.entries)
  const { user } = useAppSelector((state) => state.auth)
  const { requests: leaveRequests } = useAppSelector((state) => state.leaveRequests)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [viewState, setViewState] = useState<'list' | 'form'>('list')

  const { entries } = useAppSelector((state) => state.entries)

  // Get all entries for the selected date
  const dayEntries = entries.filter(
    (e) => e.date === selectedDate && e.user_id === user?.id
  )

  const isLeaveDay = leaveRequests.some(
    (l) => {
      if (l.user_id !== user?.id || l.status !== 'approved') return false
      return selectedDate >= l.start_date && selectedDate <= l.end_date
    }
  )

  const [formData, setFormData] = useState<EntryFormData>({
    date: selectedDate,
    topic_id: null,
    hours: '',
    learned_text: '',
    blockers_text: '',
    extra_learning: [],
  })

  const [blockerType, setBlockerType] = useState<string>('')

  const [isEditing, setIsEditing] = useState(false)
  const prevOpen = useRef(false)

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
        topic_id: selectedEntry.topic_id,
        hours: hoursStr,
        learned_text: selectedEntry.learned_text,
        blockers_text: selectedEntry.blockers_text?.split(':')[1]?.trim() || selectedEntry.blockers_text || '',
        extra_learning: selectedEntry.extra_learning.map((e) => ({
          activity_name: e.activity_name,
          hours: `${Math.floor(e.hours)}:${Math.round((e.hours - Math.floor(e.hours)) * 60).toString().padStart(2, '0')}`,
          description: e.description,
          blockers_text: e.blockers_text || '',
        })),
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
        topic_id: null,
        hours: '',
        learned_text: '',
        blockers_text: '',
        extra_learning: [],
      })
      setBlockerType('')
    }
  }, [selectedEntry, selectedDate])

  const handleClose = () => {
    dispatch(setEntryModalOpen(false))
    dispatch(selectEntry(null))
    setViewState('list')
  }

  const parseHours = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours + (minutes || 0) / 60
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.topic_id || !user) return

    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const entryData: Entry = {
      id: selectedEntry?.id || (entries.length > 0 ? Math.max(...entries.map((e) => e.id)) + 1 : 1),
      user_id: user.id,
      date: formData.date,
      topic_id: formData.topic_id,
      hours: parseHours(formData.hours),
      learned_text: formData.learned_text,
      blockers_text: blockerType && formData.blockers_text
        ? `${blockerType}: ${formData.blockers_text}`
        : formData.blockers_text || null,
      ai_status: 'pending',
      ai_decision: null,
      ai_confidence: null,
      ai_reasoning: null,
      ai_analyzed_at: null,
      status: 'pending',
      admin_override: false,
      override_reason: null,
      override_comment: null,
      override_at: null,
      admin_id: null,
      extra_learning: formData.extra_learning.map((e, i) => ({
        id: i + 1,
        entry_id: selectedEntry?.id || 0,
        activity_name: e.activity_name,
        hours: parseHours(e.hours),
        description: e.description,
        blockers_text: e.blockers_text || null,
        sequence_order: i + 1,
        created_at: new Date().toISOString(),
      })),
      created_at: selectedEntry?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (selectedEntry) {
      dispatch(updateEntry(entryData))
    } else {
      dispatch(addEntry(entryData))
    }

    setIsSubmitting(false)
    handleClose()
  }

  const handleDelete = async () => {
    if (!selectedEntry) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this entry? This action cannot be undone.'
    )

    if (confirmed) {
      dispatch(deleteEntry(selectedEntry.id))
      handleClose()
    }
  }

  const addExtraLearning = () => {
    setFormData((prev) => ({
      ...prev,
      extra_learning: [
        ...prev.extra_learning,
        { activity_name: '', hours: '', description: '', blockers_text: '' },
      ],
    }))
  }

  const updateExtraLearning = (index: number, data: ExtraLearningFormData) => {
    setFormData((prev) => ({
      ...prev,
      extra_learning: prev.extra_learning.map((item, i) =>
        i === index ? data : item
      ),
    }))
  }

  const removeExtraLearning = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      extra_learning: prev.extra_learning.filter((_, i) => i !== index),
    }))
  }

  const selectedTopic = mockTopics.find((t) => t.id === formData.topic_id)
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
                const topic = mockTopics.find(t => t.id === entry.topic_id)
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
                      <span className="font-medium">{topic?.name}</span>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">{entry.status}</Badge>
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
                <p className="text-sm text-muted-foreground">
                  {selectedEntry.ai_reasoning}
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
                  {selectedEntry?.status?.toUpperCase()}
                </Badge>
                {selectedEntry?.admin_override && (
                  <Badge variant="outline">Admin Override</Badge>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Topic Selection */}
              <div className="space-y-2">
                <Label>Learning Topic *</Label>
                {isViewOnly ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <span>{selectedTopic?.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Benchmark: ~{selectedTopic?.benchmark_hours}h
                    </span>
                  </div>
                ) : (
                  <TopicSelector
                    value={formData.topic_id}
                    onChange={(value) => setFormData({ ...formData, topic_id: value })}
                    disabled={isViewOnly}
                  />
                )}
              </div>

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
                      Topic benchmark: ~{selectedTopic.benchmark_hours} hours
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

              {/* Extra Learning */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Additional Learning (Non-Curriculum)</Label>
                  {!isViewOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addExtraLearning}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Extra
                    </Button>
                  )}
                </div>

                {formData.extra_learning.length > 0 ? (
                  <div className="space-y-4">
                    {formData.extra_learning.map((item, index) => (
                      <ExtraLearningItem
                        key={index}
                        index={index}
                        data={item}
                        onChange={updateExtraLearning}
                        onRemove={removeExtraLearning}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No additional learning activities recorded
                  </p>
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
                <Button onClick={handleSubmit} disabled={isSubmitting || !formData.topic_id || isLeaveDay}>
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
        )}
      </DialogContent>
    </Dialog>
  )
}
