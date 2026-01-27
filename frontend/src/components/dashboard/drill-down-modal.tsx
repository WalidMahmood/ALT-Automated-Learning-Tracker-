'use client'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { mockTopics, mockUsers } from '@/lib/mock-data'
import { ArrowRight, User as UserIcon, ChevronLeft } from 'lucide-react'
import type { Entry } from '@/lib/types'
import { cn } from '@/lib/utils'

interface UserSummary {
    userId: number
    name: string
    entryCount: number
    totalHours: number
}

interface DrillDownModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    entries?: Entry[]
    users?: UserSummary[]
    viewType: 'entries' | 'users'
    isAdmin?: boolean
    onUserClick?: (userId: number) => void
    onEntryClick?: (entry: Entry) => void
    onBack?: () => void
}

export function DrillDownModal({
    isOpen,
    onClose,
    title,
    entries = [],
    users = [],
    viewType,
    isAdmin = false,
    onUserClick,
    onEntryClick,
    onBack
}: DrillDownModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader className="flex flex-row items-center gap-2 space-y-0">
                    {onBack && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={onBack}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                    )}
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                <ScrollArea className="h-[60vh] pr-4">
                    <div className="space-y-4">
                        {viewType === 'entries' && (
                            entries.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    No entries found.
                                </p>
                            ) : (
                                entries.map((entry) => {
                                    const topic = mockTopics.find((t) => t.id === entry.topic_id)
                                    const user = mockUsers.find((u) => u.id === entry.user_id)
                                    return (
                                        <div
                                            key={entry.id}
                                            className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-muted/20 hover:bg-muted/30 cursor-pointer transition-colors"
                                            onClick={() => onEntryClick && onEntryClick(entry)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold">{topic?.name}</span>
                                                    <span className="text-xs text-muted-foreground">by {user?.name}</span>
                                                </div>
                                                <Badge variant={
                                                    entry.status === 'approved' ? 'default' :
                                                        entry.status === 'flagged' || entry.status === 'rejected' ? 'destructive' : 'secondary'
                                                } className={cn(entry.status === 'approved' && 'bg-success hover:bg-success/80')}>
                                                    {entry.status}
                                                </Badge>
                                            </div>
                                            <div className="flex justify-between text-sm text-muted-foreground">
                                                <span>{entry.date}</span>
                                                {isAdmin && <span>Entry Review &rarr;</span>}
                                            </div>
                                        </div>
                                    )
                                })
                            )
                        )}

                        {viewType === 'users' && (
                            users.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    No users found for this topic.
                                </p>
                            ) : (
                                users.map((user) => (
                                    <div
                                        key={user.userId}
                                        className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                                        onClick={() => onUserClick && onUserClick(user.userId)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                <UserIcon className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="font-medium">{user.name}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {user.entryCount} entries
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-medium">{user.totalHours.toFixed(1)}h</span>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                ))
                            )
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
