import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { X, Calendar, User as UserIcon, Loader2 } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import type { LeaveRequest } from '@/lib/types'
import { fetchLeaveRequests, rejectLeaveRequest } from '@/lib/store/slices/leaveRequestsSlice'
import { fetchUsers } from '@/lib/store/slices/usersSlice'

export default function LeavePage() {
    const dispatch = useAppDispatch()
    const { user } = useAppSelector((state) => state.auth)
    const { requests: leaveRequests, isLoading } = useAppSelector((state) => state.leaveRequests)
    const { users } = useAppSelector((state) => state.users)

    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)

    useEffect(() => {
        dispatch(fetchLeaveRequests())
        dispatch(fetchUsers())
    }, [dispatch])

    // Redirect non-admins
    if (user?.role !== 'admin') {
        return <Navigate to="/dashboard" replace />
    }

    // Show all leaves that are not cancelled
    const activeRequests = leaveRequests.filter((r) => r.status !== 'cancelled')

    const handleReject = (request: LeaveRequest) => {
        setSelectedRequest(request)
    }

    const handleConfirmReject = async (comment: string) => {
        if (!selectedRequest) return
        const result = await dispatch(rejectLeaveRequest({ id: selectedRequest.id, admin_comment: comment }))
        if (rejectLeaveRequest.fulfilled.match(result)) {
            setSelectedRequest(null)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Review Leave</h1>
                <p className="text-muted-foreground">
                    Manage learner leave entries
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Active Leaves</CardTitle>
                    <CardDescription>
                        Review and manage active leave entries. Learner leaves are auto-approved but can be rejected if necessary.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Learner</TableHead>
                                    <TableHead>Dates</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activeRequests.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : 'No active leave found.'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    activeRequests.map((request) => {
                                        const requestUser = users.find((u) => u.id === request.user_id)

                                        return (
                                            <TableRow key={request.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                                                        <span className="font-medium">{requestUser?.name || `User ${request.user_id}`}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                                        <span>{request.start_date} to {request.end_date}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${request.status === 'approved' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                                                        }`}>
                                                        {request.status}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {request.status === 'approved' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                onClick={() => handleReject(request)}
                                                            >
                                                                <X className="h-4 w-4" />
                                                                <span className="ml-2">Reject</span>
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <RejectDialog
                open={!!selectedRequest}
                onOpenChange={(open) => !open && setSelectedRequest(null)}
                request={selectedRequest}
                users={users}
                onConfirm={handleConfirmReject}
                isLoading={isLoading}
            />
        </div>
    )
}

function RejectDialog({
    open,
    onOpenChange,
    request,
    users,
    onConfirm,
    isLoading,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    request: LeaveRequest | null
    users: any[]
    onConfirm: (comment: string) => void
    isLoading: boolean
}) {
    const [comment, setComment] = useState('')
    const requestUser = request ? users.find(u => u.id === request.user_id) : null

    if (!request) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reject Leave</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to reject this leave for {requestUser?.name || `User ${request.user_id}`}?
                        A reason is mandatory for rejection.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="text-sm rounded-lg bg-muted/50 p-3">
                        <span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Current Dates</span>
                        <span className="font-medium">{request.start_date} - {request.end_date}</span>
                    </div>

                    <div className="space-y-2">
                        <Label>Reason for Rejection *</Label>
                        <Textarea
                            placeholder="Please provide a reason for the learner..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="min-h-[100px]"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => onConfirm(comment)}
                        disabled={!comment.trim() || isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Rejecting...
                            </>
                        ) : (
                            'Confirm Rejection'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
