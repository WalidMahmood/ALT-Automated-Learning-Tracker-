
import { useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
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
import { X, Calendar, User as UserIcon, Pencil } from 'lucide-react'
import { mockLeaveRequests, mockUsers } from '@/lib/mock-data'
import { useAppSelector } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import type { LeaveRequest } from '@/lib/types'

export default function LeavePage() {
    const { user } = useAppSelector((state) => state.auth)
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
    const [actionType, setActionType] = useState<'edit' | 'reject' | null>(null)

    // Redirect non-admins
    if (user?.role !== 'admin') {
        return <Navigate to="/dashboard" replace />
    }

    // Show all leaves that are not rejected or cancelled
    // "Marked leave means leave", so we treat them as active items to review/manage
    const activeRequests = mockLeaveRequests.filter((r) => r.status !== 'rejected' && r.status !== 'cancelled')

    const handleAction = (request: LeaveRequest, type: 'edit' | 'reject') => {
        setSelectedRequest(request)
        setActionType(type)
    }

    const handleConfirmAction = (comment: string) => {
        // In a real app, dispatch action
        console.log(`Action ${actionType} for request ${selectedRequest?.id} with comment: ${comment}`)
        setSelectedRequest(null)
        setActionType(null)
    }

    return (
        <AppLayout>
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
                            Review and manage active leave entries
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Learner</TableHead>
                                        <TableHead>Dates</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {activeRequests.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                                No active leave found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        activeRequests.map((request) => {
                                            const requestUser = mockUsers.find((u) => u.id === request.user_id)

                                            return (
                                                <TableRow key={request.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <UserIcon className="h-4 w-4 text-muted-foreground" />
                                                            <span className="font-medium">{requestUser?.name}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                                            <span>{request.start_date} to {request.end_date}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleAction(request, 'edit')}
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                onClick={() => handleAction(request, 'reject')}
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </Button>
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

                <ActionDialog
                    open={!!selectedRequest}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSelectedRequest(null)
                            setActionType(null)
                        }
                    }}
                    request={selectedRequest}
                    type={actionType}
                    onConfirm={handleConfirmAction}
                />
            </div>
        </AppLayout>
    )
}

function ActionDialog({
    open,
    onOpenChange,
    request,
    type,
    onConfirm,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    request: LeaveRequest | null
    type: 'edit' | 'reject' | null
    onConfirm: (comment: string) => void
}) {
    const [comment, setComment] = useState('')
    const requestUser = request ? mockUsers.find(u => u.id === request.user_id) : null

    if (!request || !type) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {type === 'edit' ? 'Edit' : 'Reject'} Leave
                    </DialogTitle>
                    <DialogDescription>
                        {type === 'edit'
                            ? `Modify leave details for ${requestUser?.name}`
                            : `Are you sure you want to reject this leave for ${requestUser?.name}?`
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="text-sm rounded-lg bg-muted/50 p-3">
                        <span className="text-muted-foreground block">Current Dates</span>
                        <span className="font-medium">{request.start_date} - {request.end_date}</span>
                    </div>

                    {type === 'reject' && (
                        <div className="space-y-2">
                            <Label>Reason for Rejection *</Label>
                            <Textarea
                                placeholder="Please provide a reason..."
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                            />
                        </div>
                    )}

                    {type === 'edit' && (
                        <div className="text-sm text-muted-foreground">
                            {/* In a real implementation, we'd have date pickers here */}
                            Editing functionality would go here (Date pickers, etc).
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant={type === 'edit' ? 'default' : 'destructive'}
                        onClick={() => onConfirm(comment)}
                        disabled={type === 'reject' && !comment.trim()}
                    >
                        {type === 'edit' ? 'Save Changes' : 'Reject Leave'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
