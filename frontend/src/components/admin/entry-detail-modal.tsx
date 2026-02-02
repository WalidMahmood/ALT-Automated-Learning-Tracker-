'use client'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { cn } from '@/lib/utils'
import { Entry, User, Topic } from '@/lib/types'
import { useAppSelector } from '@/lib/store/hooks'

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
    const { users } = useAppSelector((state) => state.users)
    const { topics } = useAppSelector((state) => state.topics)
    const { entries } = useAppSelector((state) => state.entries)

    if (!entry) return null

    const entryUser = users.find((u: User) => u.id === entry.user)
    const topic = topics.find((t: Topic) => t.id === entry.topic)

    return (
        <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader>
                    <div className="flex justify-between items-start pr-8">
                        <div>
                            <DialogTitle className="text-xl">ENTRY (#{entry.id})</DialogTitle>
                            <DialogDescription className="text-sm">
                                Topic: {topic?.name}
                            </DialogDescription>
                        </div>
                        <Badge variant={entry.status === 'flagged' ? 'destructive' : 'outline'} className="text-sm px-3 py-1">
                            {entry.status.toUpperCase()}
                        </Badge>
                    </div>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                    <div className="md:col-span-2 space-y-6">
                        <div>
                            <h3 className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Learner Details</h3>
                            <div className="p-3 bg-muted/20 rounded border text-sm">
                                {entryUser?.name} (ID: {entryUser?.id})
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Detailed Description</h3>
                            <div className="p-4 bg-muted/30 rounded-lg text-sm leading-relaxed border whitespace-pre-wrap break-words overflow-wrap-break-word max-w-full">
                                {entry.learned_text}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-destructive mb-1 uppercase tracking-wider">Blockers Encountered</h3>
                            <div className={cn(
                                "p-4 rounded-lg text-sm border",
                                entry.blockers_text ? "bg-destructive/5 text-destructive border-destructive/20" : "bg-muted/10 text-muted-foreground border-border"
                            )}>
                                {(() => {
                                    const text = entry.blockers_text || '';
                                    if (!text) return <span className="italic opacity-70">None reported</span>;

                                    const parts = text.split(':');
                                    const potentialType = parts[0]?.trim();
                                    const description = parts.length > 1 ? parts.slice(1).join(':').trim() : text;
                                    const validTypes = ['Technical', 'Environmental', 'Personal', 'Resource', 'Other'];

                                    if (parts.length > 1 && validTypes.includes(potentialType)) {
                                        return (
                                            <div className="flex flex-col gap-2">
                                                <Badge variant="destructive" className="w-fit px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider">{potentialType}</Badge>
                                                <span className="leading-relaxed text-foreground/80">{description}</span>
                                            </div>
                                        )
                                    }
                                    return text;
                                })()}
                            </div>
                        </div>

                        {/* AI Reasoning Section */}
                        <div className="pt-4 border-t">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-sky-500">✨</span>
                                <h3 className="text-sm font-bold text-foreground">AI REASONING (MOCK)</h3>
                            </div>

                            <div className="bg-sky-500/5 border border-sky-500/20 rounded-lg p-4 space-y-3">
                                <p className="text-sm text-muted-foreground italic">
                                    "Based on the complexity of {topic?.name} and the learner's previous history, the duration of {entry.hours}h is {entry.hours > 5 ? 'slightly above average but consistent' : 'optimal'}. Valid learning outcomes detected."
                                </p>
                                <div className="pt-2">
                                    <Button variant="outline" size="sm" className="w-full border-sky-200 text-sky-700 hover:bg-sky-100" onClick={() => onOverride && onOverride(entry)}>
                                        Override Status
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="rounded-lg border bg-card p-4 space-y-4">
                            <h3 className="text-sm font-bold border-b pb-2">Time & Progress</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Date</span>
                                    <span className="font-medium">{entry.date}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Time Spent</span>
                                    <span className="font-medium">{entry.hours} hours</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Progress</span>
                                    <span className="font-medium">
                                        {(() => {
                                            if (topic?.parent_id) {
                                                const parentTopic = topics.find(t => t.id === topic.parent_id)
                                                if (parentTopic) {
                                                    const childTopics = topics.filter(t => t.parent_id === parentTopic.id)
                                                    if (childTopics.length > 0) {
                                                        const totalProgress = childTopics.reduce((sum, child) => {
                                                            const childEntries = entries.filter(e => e.topic === child.id && e.user === entry.user)
                                                            const maxP = childEntries.length > 0 ? Math.max(...childEntries.map(e => Number(e.progress_percent) || 0)) : 0
                                                            return sum + maxP
                                                        }, 0)
                                                        return Math.round(totalProgress / childTopics.length)
                                                    }
                                                }
                                            }
                                            return Math.round(Number(entry.progress_percent) || 0)
                                        })()}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Button className="w-full" variant="outline" onClick={onClose}>
                                Close View
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
