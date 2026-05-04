/**
 * Create Course Dialog
 * 
 * A modal dialog for creating new onsite or external courses
 * in the L&D Planning section.
 */
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { lndCoursesAPI } from '@/lib/lnd-api'
import { Loader2 } from 'lucide-react'

interface CreateCourseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  courseType: 'onsite' | 'external'
  onSuccess: () => void
}

export default function CreateCourseDialog({
  open,
  onOpenChange,
  courseType,
  onSuccess,
}: CreateCourseDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    batch_code: '',
    description: '',
    start_date: '',
    end_date: '',
    seat_limit: 30,
    total_classes_offered: '',
    location: '',
    cost: '',
    status: 'planning',
  })

  const resetForm = () => {
    setForm({
      name: '',
      batch_code: '',
      description: '',
      start_date: '',
      end_date: '',
      seat_limit: 30,
      total_classes_offered: '',
      location: '',
      cost: '',
      status: 'planning',
    })
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.batch_code || !form.start_date) {
      setError('Name, Batch Code, and Start Date are required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await lndCoursesAPI.create({
        name: form.name,
        batch_code: form.batch_code,
        description: form.description || undefined,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        seat_limit: form.seat_limit,
        total_classes_offered: form.total_classes_offered ? parseInt(form.total_classes_offered) : undefined,
        course_type: courseType,
        location: courseType === 'external' ? form.location : undefined,
        cost: form.cost ? parseFloat(form.cost) : undefined,
        status: form.status,
      } as any)

      resetForm()
      onOpenChange(false)
      onSuccess()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create course')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create {courseType === 'onsite' ? 'Onsite' : 'External'} Course</DialogTitle>
          <DialogDescription>
            Fill in the course details to start planning.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="course-name">Course Name *</Label>
              <Input
                id="course-name"
                placeholder="e.g., React Advanced Training"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch-code">Batch Code *</Label>
              <Input
                id="batch-code"
                placeholder="e.g., BS-REACT-001"
                value={form.batch_code}
                onChange={(e) => setForm({ ...form, batch_code: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seat-limit">Seat Limit</Label>
              <Input
                id="seat-limit"
                type="number"
                min={1}
                value={form.seat_limit}
                onChange={(e) => setForm({ ...form, seat_limit: parseInt(e.target.value) || 30 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date *</Label>
              <Input
                id="start-date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="total-classes">Total Classes</Label>
              <Input
                id="total-classes"
                type="number"
                min={1}
                placeholder="e.g., 20"
                value={form.total_classes_offered}
                onChange={(e) => setForm({ ...form, total_classes_offered: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="planning">Planning</option>
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {courseType === 'external' && (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="location">Location / Vendor</Label>
                  <Input
                    id="location"
                    placeholder="e.g., Udemy, Coursera, Training Center"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cost">Cost (BDT)</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Course description..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Course
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
