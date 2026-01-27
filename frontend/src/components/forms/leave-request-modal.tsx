import { useState, useEffect } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { setLeaveModalOpen } from '@/lib/store/slices/uiSlice'
import { addRequest, deleteRequest } from '@/lib/store/slices/leaveRequestsSlice'
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
import { CalendarIcon, Loader2, Trash2 } from 'lucide-react'
import { mockLeaveRequests } from '@/lib/mock-data'
import type { LeaveRequest } from '@/lib/types'

export function LeaveRequestModal() {
  const dispatch = useAppDispatch()
  const { leaveModalOpen } = useAppSelector((state) => state.ui)
  const { user } = useAppSelector((state) => state.auth)
  const { requests: leaveRequests } = useAppSelector((state) => state.leaveRequests)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [existingLeave, setExistingLeave] = useState<LeaveRequest | undefined>(undefined)

  // Check for existing leave when date is selected
  useEffect(() => {
    if (selectedDate && user) {
      const dateStr = formatDateToISO(selectedDate)
      const found = leaveRequests.find(
        (l) => l.user_id === user.id && l.date === dateStr
      )
      setExistingLeave(found)
    } else {
      setExistingLeave(undefined)
    }
  }, [selectedDate, user, leaveRequests])

  const handleClose = () => {
    dispatch(setLeaveModalOpen(false))
    setSelectedDate(undefined)
    setExistingLeave(undefined)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDate || !user) return

    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const leaveRequest: LeaveRequest = {
      id: Math.max(...leaveRequests.map((l) => l.id), 0) + 1,
      user_id: user.id,
      date: formatDateToISO(selectedDate),
      status: 'approved', // Auto-approve
      admin_id: null,
      admin_comment: null,
      requested_at: new Date().toISOString(),
      reviewed_at: null,
    }

    dispatch(addRequest(leaveRequest))
    setIsSubmitting(false)
    handleClose()
  }

  const handleCancelLeave = async () => {
    if (!existingLeave) return
    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    dispatch(deleteRequest(existingLeave.id))
    setIsSubmitting(false)
    handleClose()
  }

  // Disable past dates and weekends
  const disabledDays = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today || date.getDay() === 0 || date.getDay() === 6
  }

  return (
    <Dialog open={leaveModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Leave Management</DialogTitle>
          <DialogDescription>
            Select a date to mark as leave or cancel an existing leave.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Select Date</Label>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={disabledDays}
                className="rounded-md border"
              />
            </div>
            {selectedDate && (
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Selected:{' '}
                  {selectedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                {existingLeave && (
                  <p className="text-sm font-medium text-destructive">
                    You have already marked this day as leave.
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
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancelLeave}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Unmark Leave
                  </>
                )}
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting || !selectedDate}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Mark as Leave
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
