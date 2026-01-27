'use client'

import { useMemo, useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { setSelectedDate, setEntryModalOpen, setCalendarView } from '@/lib/store/slices/uiSlice'
import { selectEntry } from '@/lib/store/slices/entriesSlice'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { mockEntries, mockLeaveRequests, mockTopics } from '@/lib/mock-data'
import type { CalendarView, Entry } from '@/lib/types'

interface CalendarDay {
  date: Date
  dateString: string
  isCurrentMonth: boolean
  isToday: boolean
  entries: Entry[]
  hasLeave: boolean
  leaveStatus: 'pending' | 'approved' | null
}

function getMonthDays(year: number, month: number, entries: any[]): CalendarDay[] {
  const days: CalendarDay[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // First day of the month
  const firstDay = new Date(year, month, 1)
  // Last day of the month
  const lastDay = new Date(year, month + 1, 0)

  // Start from the previous Sunday
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - startDate.getDay())

  // End on the next Saturday after the last day
  const endDate = new Date(lastDay)
  if (endDate.getDay() !== 6) {
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()))
  }

  const currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    const dateString = toLocalDateString(currentDate)
    const dayEntries = entries.filter((e) => e.date === dateString)
    const leaveRequest = mockLeaveRequests.find((l) => l.date === dateString)

    days.push({
      date: new Date(currentDate),
      dateString,
      isCurrentMonth: currentDate.getMonth() === month,
      isToday: currentDate.getTime() === today.getTime(),
      entries: dayEntries,
      hasLeave: !!leaveRequest,
      leaveStatus: leaveRequest?.status === 'approved' || leaveRequest?.status === 'pending'
        ? leaveRequest.status
        : null,
    })
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return days
}

// Helper to get local date string YYYY-MM-DD
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'approved':
      return 'bg-success/20 text-success-foreground border-success/30'
    case 'pending':
      return 'bg-warning/20 text-warning-foreground border-warning/30'
    case 'flagged':
      return 'bg-destructive/20 text-destructive border-destructive/30'
    case 'rejected':
      return 'bg-destructive/20 text-destructive border-destructive/30'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

export function LearningCalendar() {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { calendarView, selectedDate } = useAppSelector((state) => state.ui)
  const { entries } = useAppSelector((state) => state.entries)
  const { requests: leaveRequests } = useAppSelector((state) => state.leaveRequests)

  const [viewDate, setViewDate] = useState(new Date())

  // Helper to generate days for a given range
  const getDaysForRange = (startDate: Date, endDate: Date, entries: any[]) => {
    const days: CalendarDay[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const currentDate = new Date(startDate)
    // Normalize time to 0
    currentDate.setHours(0, 0, 0, 0)

    // Ensure loop terminates
    const finalDate = new Date(endDate)
    finalDate.setHours(0, 0, 0, 0)

    while (currentDate <= finalDate) {
      const dateString = toLocalDateString(currentDate)
      const dayEntries = entries.filter((e) => e.date === dateString)
      const leaveRequest = leaveRequests.find((l) => l.date === dateString && l.user_id === user?.id)

      days.push({
        date: new Date(currentDate),
        dateString,
        isCurrentMonth: currentDate.getMonth() === viewDate.getMonth(),
        isToday: currentDate.getTime() === today.getTime(),
        entries: dayEntries,
        hasLeave: !!leaveRequest,
        leaveStatus: leaveRequest?.status === 'approved' || leaveRequest?.status === 'pending'
          ? leaveRequest.status
          : null,
      })
      currentDate.setDate(currentDate.getDate() + 1)
    }
    return days
  }

  const days = useMemo(() => {
    let start = new Date(viewDate)
    let end = new Date(viewDate)

    if (calendarView === 'month') {
      const year = viewDate.getFullYear()
      const month = viewDate.getMonth()
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)

      start = new Date(firstDay)
      start.setDate(start.getDate() - start.getDay()) // Prev Sunday

      end = new Date(lastDay)
      if (end.getDay() !== 6) {
        end.setDate(end.getDate() + (6 - end.getDay())) // Next Saturday
      }
    } else if (calendarView === 'week') {
      start = new Date(viewDate)
      start.setDate(start.getDate() - start.getDay()) // Sunday
      end = new Date(start)
      end.setDate(end.getDate() + 6) // Saturday
    } else { // day
      start = new Date(viewDate)
      end = new Date(viewDate)
    }

    return getDaysForRange(start, end, entries)
  }, [viewDate, calendarView, entries, leaveRequests, user?.id])

  const title = useMemo(() => {
    if (calendarView === 'month') {
      return viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    } else if (calendarView === 'week') {
      const start = days[0].date
      const end = days[days.length - 1].date
      // If same month
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleString('en-US', { month: 'short' })} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`
      }
      // Different months
      return `${start.toLocaleString('en-US', { month: 'short' })} ${start.getDate()} - ${end.toLocaleString('en-US', { month: 'short' })} ${end.getDate()}, ${end.getFullYear()}`
    } else {
      return viewDate.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }
  }, [viewDate, calendarView, days])


  const handlePrev = () => {
    const newDate = new Date(viewDate)
    if (calendarView === 'month') {
      newDate.setMonth(newDate.getMonth() - 1)
    } else if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setDate(newDate.getDate() - 1)
    }
    setViewDate(newDate)
  }

  const handleNext = () => {
    const newDate = new Date(viewDate)
    if (calendarView === 'month') {
      newDate.setMonth(newDate.getMonth() + 1)
    } else if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setDate(newDate.getDate() + 1)
    }
    setViewDate(newDate)
  }

  const goToToday = () => {
    setViewDate(new Date())
  }

  const handleDayClick = (day: CalendarDay) => {
    dispatch(setSelectedDate(day.dateString))
    dispatch(selectEntry(null)) // Always start with no selection (Day View)
    dispatch(setEntryModalOpen(true))
  }

  // Filter entries for current user
  const userDays = days.map((day) => ({
    ...day,
    entries: day.entries.filter((e) => e.user_id === user?.id),
  }))

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-semibold min-w-[200px] text-center">
            {title}
          </h2>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday} className="ml-2 bg-transparent">
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={calendarView}
            onValueChange={(value) => dispatch(setCalendarView(value as CalendarView))}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="day">Day</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Day Headers - Hide in Day View? Or show just the 1 day? */}
        {/* Let's keep it consistent for Month/Week, maybe hide for Day or show just "Today" */}
        {calendarView !== 'day' && (
          <div className="grid grid-cols-7 bg-muted/50">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="px-2 py-3 text-center text-sm font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
        )}

        {/* Calendar Days */}
        <div className={cn(
          "grid",
          calendarView === 'day' ? "grid-cols-1" : "grid-cols-7"
        )}>
          {userDays.map((day, index) => (
            <button
              key={day.dateString}
              type="button"
              onClick={() => handleDayClick(day)}
              className={cn(
                'border-border p-2 text-left transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset',
                'border-t', // Always border top
                // Right border
                (calendarView !== 'day' && index % 7 !== 6) && 'border-r',

                // Height
                calendarView === 'month' ? 'min-h-[100px]' : (
                  calendarView === 'week' ? 'min-h-[200px]' : 'min-h-[300px]' // Taller for week/day
                ),

                !day.isCurrentMonth && calendarView === 'month' && 'bg-muted/30 text-muted-foreground',
                day.isToday && 'bg-primary/5',
                day.hasLeave && day.leaveStatus === 'approved' && 'bg-muted/50'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-sm',
                      day.isToday && 'bg-primary text-primary-foreground font-semibold'
                    )}
                  >
                    {day.date.getDate()}
                  </span>
                  {calendarView === 'day' && (
                    <span className="text-lg font-semibold text-foreground">
                      {day.date.toLocaleDateString('en-US', { weekday: 'long' })}
                    </span>
                  )}
                </div>
                {day.entries.length === 0 && !day.hasLeave && (
                  // Show plus everywhere if empty?
                  <Plus className="h-4 w-4 text-muted-foreground/50" />
                )}
              </div>

              {/* Leave indicator */}
              {day.hasLeave && (
                <Badge
                  variant="outline"
                  className={cn(
                    'mt-1 text-xs w-full justify-center',
                    day.leaveStatus === 'approved'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-warning/20 text-warning-foreground border-warning/30'
                  )}
                >
                  {day.leaveStatus === 'approved' ? 'Leave' : 'Leave (Pending)'}
                </Badge>
              )}

              {/* Entry indicators */}
              <div className="mt-1 space-y-1">
                {day.entries.slice(0, calendarView === 'month' ? 2 : undefined).map((entry) => {
                  const topic = mockTopics.find((t) => t.id === entry.topic_id)
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs border flex items-center justify-between gap-1 group',
                        getStatusColor(entry.status),
                        // For day view, give more padding
                        calendarView === 'day' && 'p-2'
                      )}
                    >
                      <span className="truncate font-medium">{topic?.name}</span>
                      {/* Show hours in day/week view */}
                      {(calendarView !== 'month') && (
                        <span className="opacity-70 text-[10px]">{entry.hours}h</span>
                      )}
                    </div>
                  )
                })}
                {calendarView === 'month' && day.entries.length > 2 && (
                  <div className="text-xs text-muted-foreground px-1.5">
                    +{day.entries.length - 2} more
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-success/20 border border-success/30" />
          <span className="text-muted-foreground">Approved</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-warning/20 border border-warning/30" />
          <span className="text-muted-foreground">Pending</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-destructive/20 border border-destructive/30" />
          <span className="text-muted-foreground">Flagged/Rejected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-muted border border-border" />
          <span className="text-muted-foreground">Leave</span>
        </div>
      </div>
    </div>
  )
}
