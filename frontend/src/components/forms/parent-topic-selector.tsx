'use client'

import { useState, useMemo } from 'react'
import { Check, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Topic } from '@/lib/types'

interface ParentTopicSelectorProps {
    value: number | null
    onChange: (value: number | null) => void
    allTopics: Topic[]
    currentTopicId?: number // To prevent selecting self as parent
}

export function ParentTopicSelector({ value, onChange, allTopics, currentTopicId }: ParentTopicSelectorProps) {
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentParentId, setCurrentParentId] = useState<number | null>(null)

    const activeTopics = useMemo(() => allTopics.filter((t) => t.is_active && t.id !== currentTopicId), [allTopics, currentTopicId])

    const getTopicPath = (topic: Topic) => {
        const path: string[] = []
        let current: Topic | undefined = topic
        while (current) {
            if (current.id !== topic.id) path.unshift(current.name)
            current = activeTopics.find(t => t.id === current?.parent_id)
        }
        return path.join(' > ')
    }

    // Topics to display at current level (or searched)
    const displayTopics = useMemo(() => {
        if (searchQuery) {
            return activeTopics
                .filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(t => ({ ...t, path: getTopicPath(t) }))
        }
        return activeTopics
            .filter((t) => t.parent_id === currentParentId)
            .map(t => ({ ...t, path: '' }))
    }, [activeTopics, currentParentId, searchQuery])

    // Breadcrumbs to navigate back
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

    const selectedTopic = activeTopics.find((t) => t.id === value)

    const handleSelect = (topic: Topic) => {
        onChange(topic.id)
        if (!activeTopics.some(t => t.parent_id === topic.id)) {
            setOpen(false)
            setSearchQuery('')
            setCurrentParentId(null)
        }
    }

    const handleDrillDown = (topic: Topic, e: React.MouseEvent) => {
        e.stopPropagation()
        setCurrentParentId(topic.id)
    }

    const handleClearSelection = () => {
        onChange(null)
        setOpen(false)
        setSearchQuery('')
        setCurrentParentId(null)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal bg-transparent"
                >
                    {selectedTopic ? selectedTopic.name : 'No Parent (Root Topic)'}
                    <ChevronRight className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0" align="start">
                <div className="p-2 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search topics..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>

                {/* Navigation / Breadcrumbs */}
                {!searchQuery && (
                    <div className="flex items-center gap-1 border-b border-border p-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
                        <button
                            type="button"
                            onClick={() => setCurrentParentId(null)}
                            className={cn(
                                "text-xs px-2 py-1 rounded-md transition-colors",
                                currentParentId === null ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent"
                            )}
                        >
                            All Topics
                        </button>
                        {breadcrumbs.map((crumb) => (
                            <div key={crumb.id} className="flex items-center gap-1">
                                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                <button
                                    type="button"
                                    onClick={() => setCurrentParentId(crumb.id)}
                                    className={cn(
                                        "text-xs px-2 py-1 rounded-md transition-colors",
                                        crumb.id === currentParentId ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent"
                                    )}
                                >
                                    {crumb.name}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <ScrollArea className="h-[300px]">
                    <div className="p-2">
                        {/* Option to clear selection (make root topic) */}
                        {!searchQuery && currentParentId === null && (
                            <div
                                className={cn(
                                    'group flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent cursor-pointer mb-2 border-b',
                                    value === null && 'bg-primary/10 text-primary'
                                )}
                                onClick={handleClearSelection}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={cn(value === null && 'font-medium')}>No Parent (Root Topic)</span>
                                    {value === null && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </div>
                            </div>
                        )}

                        {displayTopics.length === 0 ? (
                            <p className="p-4 text-center text-sm text-muted-foreground">
                                No topics found
                            </p>
                        ) : (
                            displayTopics.map((topic) => {
                                const isSelected = value === topic.id
                                const hasChildren = activeTopics.some((t) => t.parent_id === topic.id)

                                return (
                                    <div
                                        key={topic.id}
                                        className={cn(
                                            'group flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent cursor-pointer',
                                            isSelected && 'bg-primary/10 text-primary'
                                        )}
                                        onClick={() => handleSelect(topic)}
                                    >
                                        <div className="flex-1 flex flex-col truncate">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(isSelected && 'font-medium')}>{topic.name}</span>
                                                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                            </div>
                                            {topic.path && (
                                                <span className="text-xs text-muted-foreground truncate opacity-70">
                                                    {topic.path}
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
                </ScrollArea>
                {!searchQuery && currentParentId !== null && (
                    <div className="p-2 border-t border-border">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs text-muted-foreground h-8"
                            onClick={() => {
                                const parent = activeTopics.find(t => t.id === currentParentId)
                                setCurrentParentId(parent?.parent_id ?? null)
                            }}
                        >
                            <ChevronLeft className="mr-2 h-3 w-3" />
                            Back
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    )
}
