'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Check, ChevronLeft, ChevronRight, Search, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import type { Topic } from '@/lib/types'

interface TopicPickerProps {
    onSelect: (topicId: number) => void
    allTopics: Topic[]
    excludeTopicIds?: number[]
    placeholder?: string
}

export function TopicPicker({ onSelect, allTopics, excludeTopicIds = [], placeholder = 'Add Topic...' }: TopicPickerProps) {
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentParentId, setCurrentParentId] = useState<number | null>(null)
    const listRef = useRef<HTMLDivElement>(null)

    const activeTopics = useMemo(() => allTopics.filter((t) => t.is_active), [allTopics])
    const availableTopics = useMemo(() => activeTopics.filter(t => !excludeTopicIds.includes(t.id)), [activeTopics, excludeTopicIds])

    const getTopicPath = (topic: Topic) => {
        const path: string[] = []
        let current: Topic | undefined = activeTopics.find(t => t.id === topic.parent_id)
        while (current) {
            path.unshift(current.name)
            current = activeTopics.find(t => t.id === current?.parent_id)
        }
        return path.join(' > ')
    }

    const displayTopics = useMemo(() => {
        if (searchQuery) {
            return availableTopics
                .filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(t => ({ ...t, path: getTopicPath(t) }))
        }

        return activeTopics
            .filter((t) => t.parent_id === currentParentId)
            .map(t => ({
                ...t,
                isExcluded: excludeTopicIds.includes(t.id),
                path: ''
            }))
    }, [activeTopics, availableTopics, currentParentId, searchQuery, excludeTopicIds])

    const breadcrumbs = useMemo(() => {
        const crumbs: Topic[] = []
        let currentId = currentParentId
        while (currentId !== null) {
            const topic = activeTopics.find((t) => t.id === currentId)
            if (topic) {
                crumbs.unshift(topic)
                currentId = topic.parent_id
            } else {
                break
            }
        }
        return crumbs
    }, [activeTopics, currentParentId])

    // Scroll to top when changing parent
    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = 0
    }, [currentParentId])

    // Reset state when closing
    useEffect(() => {
        if (!open) {
            setSearchQuery('')
            setCurrentParentId(null)
        }
    }, [open])

    const handleSelect = (topic: Topic) => {
        if (excludeTopicIds.includes(topic.id)) return

        onSelect(topic.id)
        setOpen(false)
    }

    const handleDrillDown = (topic: Topic, e: React.MouseEvent) => {
        e.stopPropagation()
        setCurrentParentId(topic.id)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    size="sm"
                    className="w-full justify-start gap-2 h-7 border-dashed bg-muted/20 hover:bg-muted/40 transition-colors text-xs"
                >
                    <Plus className="h-3 w-3" />
                    <span className="text-muted-foreground/80 font-normal">{placeholder}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0 z-[60] bg-background border-border shadow-xl dark:shadow-black/50" align="start" side="bottom">
                <div className="flex flex-col max-h-[400px]">
                    {/* Search */}
                    <div className="p-2 border-b">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search topics..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-8 h-9 text-sm"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Breadcrumbs */}
                    {!searchQuery && (
                        <div className="flex items-center gap-1 border-b p-2 overflow-x-auto whitespace-nowrap scrollbar-hide bg-muted/20">
                            <button
                                type="button"
                                onClick={() => setCurrentParentId(null)}
                                className={cn(
                                    "text-xs uppercase tracking-wider font-semibold px-2 py-1 rounded-md transition-colors",
                                    currentParentId === null ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                                )}
                            >
                                ROOT
                            </button>
                            {breadcrumbs.map((crumb) => (
                                <div key={crumb.id} className="flex items-center gap-1">
                                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <button
                                        type="button"
                                        onClick={() => setCurrentParentId(crumb.id)}
                                        className={cn(
                                            "text-xs uppercase tracking-wider font-semibold px-2 py-1 rounded-md transition-colors",
                                            crumb.id === currentParentId ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                                        )}
                                    >
                                        {crumb.name}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Topic List */}
                    <div
                        ref={listRef}
                        className="flex-1 overflow-y-auto overflow-x-hidden p-2 min-h-[150px] max-h-[300px]"
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        {displayTopics.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 opacity-50">
                                <Search className="h-6 w-6 mb-2" />
                                <p className="text-sm">No topics available</p>
                            </div>
                        ) : (
                            displayTopics.map((topic) => {
                                const isExcluded = excludeTopicIds.includes(topic.id)
                                const hasChildren = activeTopics.some((t) => t.parent_id === topic.id)

                                return (
                                    <div
                                        key={topic.id}
                                        className={cn(
                                            'group flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors',
                                            isExcluded ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:bg-accent cursor-pointer'
                                        )}
                                        onClick={() => !isExcluded && handleSelect(topic)}
                                    >
                                        <div className="flex-1 flex flex-col truncate mr-2">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(isExcluded && 'text-muted-foreground line-through decoration-1')}>
                                                    {topic.name}
                                                </span>
                                                {isExcluded && <Check className="h-3 w-3 text-primary shrink-0" />}
                                            </div>
                                            {(topic as any).path && (
                                                <span className="text-xs text-muted-foreground truncate opacity-70">
                                                    {(topic as any).path}
                                                </span>
                                            )}
                                        </div>

                                        {hasChildren && !searchQuery && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 opacity-50 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary transition-all ml-2"
                                                onClick={(e) => handleDrillDown(topic, e)}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* Footer */}
                    {!searchQuery && currentParentId !== null && (
                        <div className="p-1.5 border-t bg-muted/5">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-xs uppercase tracking-wider font-semibold text-muted-foreground h-7"
                                onClick={() => {
                                    const parent = activeTopics.find(t => t.id === currentParentId)
                                    setCurrentParentId(parent?.parent_id ?? null)
                                }}
                            >
                                <ChevronLeft className="mr-1 h-3 w-3" />
                                Back
                            </Button>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
