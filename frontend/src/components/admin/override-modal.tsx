'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Check, Loader2 } from 'lucide-react'
import { Entry, EntryStatus, OverrideReason, OVERRIDE_REASONS } from '@/lib/types'

interface OverrideModalProps {
    entry: Entry | null
    open: boolean
    onClose: () => void
}

export function OverrideModal({ entry, open, onClose }: OverrideModalProps) {
    const [reason, setReason] = useState<string>('')
    const [comment, setComment] = useState('')
    const [newStatus, setNewStatus] = useState<EntryStatus>('approved')
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!entry) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 800))

        console.log('Override submitted:', { entryId: entry.id, reason, comment, newStatus })

        setIsSubmitting(false)
        setReason('')
        setComment('')
        setNewStatus('approved')
        onClose()
    }

    const requiresComment = reason === 'Other (see comment)'

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Override Entry</DialogTitle>
                    <DialogDescription>
                        Provide a reason for overriding the AI decision
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>New Status *</Label>
                        <Select
                            value={newStatus}
                            onValueChange={(value) => setNewStatus(value as EntryStatus)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="approved">Approve</SelectItem>
                                <SelectItem value="rejected">Reject</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Override Reason *</Label>
                        <Select value={reason} onValueChange={setReason}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a reason..." />
                            </SelectTrigger>
                            <SelectContent>
                                {OVERRIDE_REASONS.map((r: OverrideReason) => (
                                    <SelectItem key={r} value={r}>
                                        {r}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>
                            Comment {requiresComment ? '*' : '(Optional)'}
                        </Label>
                        <Textarea
                            placeholder="Add any additional context..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            required={requiresComment}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || !reason || (requiresComment && !comment)}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Submitting...
                                </>
                            ) : (
                                <>
                                    <Check className="mr-2 h-4 w-4" />
                                    Submit Override
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
