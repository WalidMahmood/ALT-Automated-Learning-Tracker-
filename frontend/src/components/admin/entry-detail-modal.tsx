'use client'

import React from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Bot } from 'lucide-react'
import { mockUsers, mockTopics } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Entry } from '@/lib/types'

interface EntryDetailModalProps {
    entry: Entry | null
    onClose: () => void
    onOverride?: (entry: Entry) => void
}

export function EntryDetailModal({
    entry,
    onClose,
    onOverride
}: EntryDetailModalProps) {
    if (!entry) return null

    const entryUser = mockUsers.find((u) => u.id === entry.user_id)
    const topic = mockTopics.find((t) => t.id === entry.topic_id)

    return (
        <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Entry Details</DialogTitle>
                    <DialogDescription>
                        {entryUser?.name} - {entry.date}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Entry Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-muted-foreground">Topic</Label>
                            <p className="font-medium">{topic?.name}</p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Hours</Label>
                            <p className="font-medium">{entry.hours}h (Benchmark: ~{topic?.benchmark_hours}h)</p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Learner Profile</Label>
                            <p className="font-medium">
                                {entryUser?.experience_years} yrs exp
                            </p>
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Status</Label>
                            <Badge
                                variant={
                                    entry.status === 'approved'
                                        ? 'default'
                                        : entry.status === 'flagged' || entry.status === 'rejected'
                                            ? 'destructive'
                                            : 'secondary'
                                }
                                className={cn(entry.status === 'approved' && 'bg-success hover:bg-success/80')}
                            >
                                {entry.status}
                            </Badge>
                        </div>
                    </div>

                    {/* Learning Description */}
                    <div>
                        <Label className="text-muted-foreground">What was learned</Label>
                        <p className="mt-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
                            {entry.learned_text}
                        </p>
                    </div>

                    {/* AI Analysis */}
                    {entry.ai_status === 'analyzed' && (
                        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Bot className="h-5 w-5 text-primary" />
                                <span className="font-medium">AI Analysis (Admin Only)</span>
                                <Badge
                                    variant={
                                        entry.ai_decision === 'approve'
                                            ? 'default'
                                            : entry.ai_decision === 'flag'
                                                ? 'secondary'
                                                : 'destructive'
                                    }
                                    className={cn(entry.ai_decision === 'approve' && 'bg-success hover:bg-success/80')}
                                >
                                    {entry.ai_decision?.toUpperCase()}
                                </Badge>
                                <span className="text-sm text-muted-foreground ml-auto">
                                    Confidence: {entry.ai_confidence}%
                                </span>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-muted-foreground">Chain of Thought Reasoning</Label>
                                <p className="text-sm">{entry.ai_reasoning}</p>
                            </div>
                        </div>
                    )}

                    {/* Override Info */}
                    {entry.admin_override && (
                        <div className="rounded-lg border border-border bg-warning/10 p-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-warning" />
                                <span className="font-medium">Admin Override</span>
                            </div>
                            <p className="text-sm">
                                <strong>Reason:</strong> {entry.override_reason}
                            </p>
                            {entry.override_comment && (
                                <p className="text-sm">
                                    <strong>Comment:</strong> {entry.override_comment}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => onOverride && onOverride(entry)}
                    >
                        Override AI
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
