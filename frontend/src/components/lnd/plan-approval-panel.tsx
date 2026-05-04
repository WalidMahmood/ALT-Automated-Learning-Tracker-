/**
 * Plan Approval Panel
 *
 * Shows the approval workflow status for training plan assignments.
 * Used in the Training Plan Detail page. Displays pending requests
 * and allows PM/LND review actions.
 */
import { useState, useEffect } from 'react'
import { planRequestsAPI } from '@/lib/lnd-bridge-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Loader2,
  AlertCircle,
  ShieldCheck,
  User,
} from 'lucide-react'
import type { TrainingPlanRequest, PlanRequestStatus } from '@/lib/lnd-types'

const STATUS_CONFIG: Record<PlanRequestStatus, { label: string; color: string; icon: typeof Clock }> = {
  requested: { label: 'Requested', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
  pm_approved: { label: 'PM Approved', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: ClipboardCheck },
  pm_rejected: { label: 'PM Rejected', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  lnd_approved: { label: 'L&D Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: ShieldCheck },
  lnd_rejected: { label: 'L&D Rejected', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  active: { label: 'Active', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 border-gray-200', icon: XCircle },
}

interface PlanApprovalPanelProps {
  planId: number
  planName: string
}

export function PlanApprovalPanel({ planId, planName }: PlanApprovalPanelProps) {
  const [requests, setRequests] = useState<TrainingPlanRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Review dialog state
  const [reviewRequest, setReviewRequest] = useState<TrainingPlanRequest | null>(null)
  const [reviewType, setReviewType] = useState<'pm' | 'lnd'>('pm')
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [reviewNotes, setReviewNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchRequests = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await planRequestsAPI.getAll()
      // Filter to this plan's requests
      const planRequests = res.data.filter(r => r.plan === planId)
      setRequests(planRequests)
    } catch (err: any) {
      if (err.response?.status === 503 || err.response?.status === 404) {
        // Bridge not available — silently hide
        setRequests([])
      } else {
        setError('Failed to load approval requests')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [planId])

  const handleReview = async () => {
    if (!reviewRequest) return
    setSubmitting(true)
    try {
      if (reviewType === 'pm') {
        await planRequestsAPI.pmReview(reviewRequest.id, {
          action: reviewAction,
          notes: reviewNotes,
        })
      } else {
        await planRequestsAPI.lndReview(reviewRequest.id, {
          action: reviewAction,
          notes: reviewNotes,
        })
      }
      toast.success(`Request ${reviewAction === 'approve' ? 'approved' : 'rejected'}`)
      setReviewRequest(null)
      setReviewNotes('')
      fetchRequests()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  // Don't render if no requests and no error
  if (!loading && requests.length === 0 && !error) return null

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Plan Approval Requests
            {requests.length > 0 && (
              <Badge variant="secondary" className="text-xs">{requests.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading requests...
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-destructive py-3">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((req) => {
                const statusCfg = STATUS_CONFIG[req.status]
                const StatusIcon = statusCfg.icon
                const canPMReview = req.status === 'requested'
                const canLNDReview = req.status === 'pm_approved'

                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{req.user_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{req.user_email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <Badge variant="outline" className={`text-xs ${statusCfg.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                      </Badge>

                      {/* Workflow: Requested → PM reviews → pm_approved → LND reviews */}
                      {canPMReview && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => {
                              setReviewRequest(req)
                              setReviewType('pm')
                              setReviewAction('approve')
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> PM Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              setReviewRequest(req)
                              setReviewType('pm')
                              setReviewAction('reject')
                            }}
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </div>
                      )}

                      {canLNDReview && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => {
                              setReviewRequest(req)
                              setReviewType('lnd')
                              setReviewAction('approve')
                            }}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" /> L&D Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              setReviewRequest(req)
                              setReviewType('lnd')
                              setReviewAction('reject')
                            }}
                          >
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
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

      {/* Review Dialog */}
      <Dialog open={!!reviewRequest} onOpenChange={(open) => { if (!open) setReviewRequest(null) }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' ? 'Approve' : 'Reject'} Plan Request
            </DialogTitle>
            <DialogDescription>
              {reviewType === 'pm' ? 'PM Review' : 'L&D Final Review'} for {reviewRequest?.user_name}'s request
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Plan:</span>{' '}
              <span className="font-medium">{planName}</span>
            </div>
            {reviewRequest?.request_reason && (
              <div className="text-sm">
                <span className="text-muted-foreground">Reason:</span>{' '}
                <span>{reviewRequest.request_reason}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add any notes for this review..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewRequest(null)}>Cancel</Button>
            <Button
              onClick={handleReview}
              disabled={submitting}
              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : reviewAction === 'approve' ? (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              {reviewAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
