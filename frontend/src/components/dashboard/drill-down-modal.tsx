'use client'

import {
    Dialog,
    DialogContent,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { mockUsers } from '@/lib/mock-data'
import { ArrowRight, User as UserIcon, ChevronLeft, ArrowUpDown } from 'lucide-react'
import type { Entry } from '@/lib/types'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useState, useMemo } from 'react'

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
    onUserClick,
    onEntryClick,
    onBack
}: DrillDownModalProps) {
    const [pageSize, setPageSize] = useState(50)
    const [sort, setSort] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)

    const processedEntries = useMemo(() => {
        let results = [...entries]
        if (sort) {
            results.sort((a, b) => {
                // @ts-ignore
                const aVal = a[sort.key]
                // @ts-ignore
                const bVal = b[sort.key]
                if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1
                if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1
                return 0
            })
        }
        return results.slice(0, pageSize)
    }, [entries, sort, pageSize])

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc'
        if (sort && sort.key === key && sort.direction === 'asc') {
            direction = 'desc'
        }
        setSort({ key, direction })
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[85vh]">
                <DialogHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b">
                    <div className="flex items-center gap-2">
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
                        <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
                    </div>
                    {viewType === 'entries' && entries.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Show</span>
                            <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
                                <SelectTrigger className="w-[80px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </DialogHeader>

                <ScrollArea className="h-[60vh] mt-4 pr-4">
                    <div className="space-y-4">
                        {viewType === 'entries' && (
                            entries.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    No entries found.
                                </p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead
                                                className="w-[120px] cursor-pointer hover:text-primary transition-colors"
                                                onClick={() => handleSort('id')}
                                            >
                                                <div className="flex items-center gap-1">
                                                    Entry #
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </div>
                                            </TableHead>
                                            <TableHead>User ID/Name</TableHead>
                                            <TableHead
                                                className="text-right cursor-pointer hover:text-primary transition-colors"
                                                onClick={() => handleSort('progress_percent')}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    Progress %
                                                    <ArrowUpDown className="h-3 w-3" />
                                                </div>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {processedEntries.map((entry) => {
                                            const user = mockUsers.find((u) => u.id === entry.user)
                                            return (
                                                <TableRow
                                                    key={entry.id}
                                                    className="cursor-pointer hover:bg-muted/50 transition-all border-b last:border-0"
                                                    onClick={() => onEntryClick && onEntryClick(entry)}
                                                >
                                                    <TableCell className="font-mono text-xs font-semibold text-primary">#{entry.id}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-sm">{user?.name}</span>
                                                            <span className="text-[10px] text-muted-foreground">ID: {user?.id}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="outline" className="font-mono bg-muted/30">
                                                            {entry.progress_percent}%
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            )
                        )}

                        {viewType === 'users' && (
                            users.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    No users found for this topic.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {users.map((user) => (
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
                                                <span className="font-medium">
                                                    {typeof user.totalHours === 'number' ? user.totalHours.toFixed(1) : Number(user.totalHours || 0).toFixed(1)}h
                                                </span>
                                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </ScrollArea>
                {viewType === 'entries' && entries.length > 0 && (
                    <div className="pt-4 border-t text-[10px] text-muted-foreground italic flex justify-between">
                        <span>Click row to see Level 3 details</span>
                        <span>Total {entries.length} items</span>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
