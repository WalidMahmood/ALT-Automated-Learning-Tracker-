import { useState, useEffect } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { setLeaveModalOpen } from '@/lib/store/slices/uiSlice'
import { createLeaveRequest, cancelLeaveRequest, updateLeaveRequest, clearError } from '@/lib/store/slices/leaveRequestsSlice'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { formatDateToISO } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Calendar } from '@/components/ui/calendar'
import { CalendarIcon, Loader2, Trash2, AlertCircle } from 'lucide-react'
import type { LeaveRequest } from '@/lib/types'
import { DateRange } from 'react-day-picker'
import { isWithinInterval, parseISO, addDays, subDays } from 'date-fns'

export function LeaveRequestModal() {
  const dispatch = useAppDispatch()
  const { leaveModalOpen } = useAppSelector((state) => state.ui)
  const { user } = useAppSelector((state) => state.auth)
  const { requests: leaveRequests, isLoading, error } = useAppSelector((state) => state.leaveRequests)

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [existingLeave, setExistingLeave] = useState<LeaveRequest | undefined>(undefined)

  // Check for existing leave when date range changes
  useEffect(() => {
    if (dateRange?.from && user) {
      // Find overlap
      const found = leaveRequests.find(l => {
        if (l.status === 'cancelled' || l.status === 'rejected') return false
        const start = parseISO(l.start_date)
        const end = parseISO(l.end_date)
        // Check if ANY point of the selection is within existing (simplified)
        // Or if existing is inside selection.
        // Let's rely on isWithinInterval for the start date as a quick check
        // then doing a full overlap check is better but this works for "clicking on a leave day"
        return isWithinInterval(dateRange.from!, { start, end }) ||
          (dateRange.to && isWithinInterval(dateRange.to, { start, end }))
      })
      setExistingLeave(found)
    } else {
      setExistingLeave(undefined)
    }
  }, [dateRange, user, leaveRequests])

  const overlapType = () => {
    if (!existingLeave || !dateRange?.from) return 'none'
    const selStart = formatDateToISO(dateRange.from)
    const selEnd = dateRange.to ? formatDateToISO(dateRange.to) : selStart

    if (selStart === existingLeave.start_date && selEnd === existingLeave.end_date) return 'exact'

    // Check if selection is strictly inside
    if (selStart >= existingLeave.start_date && selEnd <= existingLeave.end_date) return 'subset'

    return 'overlap' // Complex partial overlap? Treat as subset logic or block
  }

  const handleClose = () => {
    dispatch(setLeaveModalOpen(false))
    dispatch(clearError())
    setDateRange(undefined)
    setExistingLeave(undefined)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dateRange?.from || !user) return

    const start_date = formatDateToISO(dateRange.from)
    const end_date = dateRange.to ? formatDateToISO(dateRange.to) : start_date

    const result = await dispatch(createLeaveRequest({ start_date, end_date }))
    if (createLeaveRequest.fulfilled.match(result)) {
      handleClose()
    }
  }

  const handleCancelLeave = async () => {
    if (!existingLeave) return
    const result = await dispatch(cancelLeaveRequest(existingLeave.id))
    if (cancelLeaveRequest.fulfilled.match(result)) {
      handleClose()
    }
  }

  const handleModifyLeave = async () => {
    if (!existingLeave || !dateRange?.from) return

    const selStart = formatDateToISO(dateRange.from)
    const selEnd = dateRange.to ? formatDateToISO(dateRange.to) : selStart

    // 1. Head Trim: Selected matches start, but ends before existing end
    if (selStart === existingLeave.start_date && selEnd < existingLeave.end_date) {
      const newStart = formatDateToISO(addDays(parseISO(selEnd), 1))
      const result = await dispatch(updateLeaveRequest({ id: existingLeave.id, data: { start_date: newStart } }))
      if (updateLeaveRequest.fulfilled.match(result)) {
        handleClose()
      }
      return
    }

    // 2. Tail Trim: Selected matches end, but starts after existing start
    if (selEnd === existingLeave.end_date && selStart > existingLeave.start_date) {
      const newEnd = formatDateToISO(subDays(parseISO(selStart), 1))
      const result = await dispatch(updateLeaveRequest({ id: existingLeave.id, data: { end_date: newEnd } }))
      if (updateLeaveRequest.fulfilled.match(result)) {
        handleClose()
      }
      return
    }

    // 3. Middle Split: Selected is strictly inside
    if (selStart > existingLeave.start_date && selEnd < existingLeave.end_date) {
      // Update original end date to before selection
      const firstPartEnd = formatDateToISO(subDays(parseISO(selStart), 1))
      const result1 = await dispatch(updateLeaveRequest({ id: existingLeave.id, data: { end_date: firstPartEnd } }))

      if (updateLeaveRequest.fulfilled.match(result1)) {
        // Only if first part succeeds, create the second part
        const secondPartStart = formatDateToISO(addDays(parseISO(selEnd), 1))
        const result2 = await dispatch(createLeaveRequest({ start_date: secondPartStart, end_date: existingLeave.end_date }))

        if (createLeaveRequest.fulfilled.match(result2)) {
          handleClose()
        }
      }
      return
    }

    // Fallback?
    alert("Complex overlap not supported purely via quick actions. Please cancel and recreate.")
  }

  // Disable past dates
  const disabledDays = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
  }

  return (
    <Dialog open={leaveModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Leave Management</DialogTitle>
          <DialogDescription>
            Select a date range to mark as leave. Multi-day leaves are auto-approved.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Select Date Range</Label>
            <div className="flex justify-center">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                disabled={disabledDays}
                className="rounded-md border"
                numberOfMonths={1}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md">
                <AlertCircle className="h-4 w-4" />
                <p>{typeof error === 'string' ? error : JSON.stringify(error)}</p>
              </div>
            )}

            {dateRange?.from && (
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Range: {dateRange.from.toLocaleDateString()}
                  {dateRange.to ? ` to ${dateRange.to.toLocaleDateString()}` : ''}
                </p>
                {existingLeave && (
                  <p className="text-sm font-medium text-destructive">
                    This range overlaps with an existing leave.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Close
            </Button>
            {existingLeave ? (
              overlapType() === 'exact' ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleCancelLeave}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Cancel Entire Leave
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleModifyLeave}
                  disabled={isLoading}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      Remove Selected Days
                    </>
                  )}
                </Button>
              )
            ) : (
              <Button type="submit" disabled={isLoading || !dateRange?.from}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Submit Leave
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
