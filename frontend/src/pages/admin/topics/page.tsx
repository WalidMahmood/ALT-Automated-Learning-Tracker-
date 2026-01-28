
import { useState, useMemo, useEffect } from 'react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BookOpen, MoreHorizontal, Plus, Search, Pencil, Trash2, ChevronRight, CornerDownRight, ChevronDown, Filter } from 'lucide-react'
import { mockTopics, mockEntries } from '@/lib/mock-data'
import { useAppSelector } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import type { Topic } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ParentTopicSelector } from '@/components/forms/parent-topic-selector'

export default function TopicsPage() {
    const { user } = useAppSelector((state) => state.auth)
    const [topics, setTopics] = useState<Topic[]>(mockTopics)
    const [searchQuery, setSearchQuery] = useState('')
    const [parentFilter, setParentFilter] = useState<string>('all')
    const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set())
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
    const [isFlatView, setIsFlatView] = useState(false)

    // Redirect non-admins
    if (user?.role !== 'admin') {
        return <Navigate to="/dashboard" replace />
    }

    const toggleNode = (id: number) => {
        setExpandedNodes(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // Filter and build tree
    const displayTopics = useMemo(() => {
        let filtered = topics.filter((topic) => {
            const matchesSearch = topic.name.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesParent = parentFilter === 'all' || topic.id === Number(parentFilter) || topic.parent_id === Number(parentFilter)
            return matchesSearch && matchesParent
        })

        if (isFlatView || searchQuery) {
            return filtered
                .map(t => {
                    const path: string[] = []
                    let curr: Topic | undefined = topics.find(tp => tp.id === t.parent_id)
                    while (curr) {
                        path.unshift(curr.name)
                        curr = topics.find(tp => tp.id === curr?.parent_id)
                    }
                    return { ...t, level: 0, hasChildren: false, path: path.join(' > ') }
                })
                .sort((a, b) => a.name.localeCompare(b.name))
        }

        const result: (Topic & { level: number; hasChildren: boolean; path?: string })[] = []

        const addNode = (node: Topic, level: number) => {
            const children = filtered.filter(t => t.parent_id === node.id)
            result.push({ ...node, level, hasChildren: children.length > 0 })

            if (expandedNodes.has(node.id) || searchQuery) {
                children.forEach(child => addNode(child, level + 1))
            }
        }

        const roots = filtered.filter(t => !t.parent_id)
        roots.forEach(root => addNode(root, 0))

        // Handle orphans when searching
        if (searchQuery) {
            filtered.forEach(t => {
                if (!result.find(r => r.id === t.id)) {
                    result.push({ ...t, level: 0, hasChildren: false })
                }
            })
        }

        return result
    }, [searchQuery, parentFilter, expandedNodes, topics])

    const rootTopics = useMemo(() => topics.filter(t => !t.parent_id), [topics])

    const handleEdit = (topic: Topic) => {
        setEditingTopic(topic)
        setIsDialogOpen(true)
    }

    const handleDelete = (id: number) => {
        setTopics(prev => prev.filter(t => t.id !== id && t.parent_id !== id))
    }

    const handleSave = (topic: Partial<Topic>) => {
        if (editingTopic) {
            setTopics(prev => prev.map(t => t.id === editingTopic.id ? { ...t, ...topic } as Topic : t))
        } else {
            const newTopic: Topic = {
                ...topic,
                id: Math.max(0, ...topics.map(t => t.id)) + 1,
                is_active: true
            } as Topic
            setTopics(prev => [...prev, newTopic])
        }
        setIsDialogOpen(false)
        setEditingTopic(null)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Topic Management</h1>
                    <p className="text-muted-foreground">
                        Create and manage learning topics and their benchmarks
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button onClick={() => setIsDialogOpen(true)} size="sm" className="h-9">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Topic
                    </Button>
                    <div className="flex items-center gap-2 border rounded-md p-1 h-9 bg-background">
                        <Button
                            variant={isFlatView ? 'ghost' : 'secondary'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setIsFlatView(false)}
                        >
                            <ChevronRight className="mr-1 h-3 w-3" />
                            Tree
                        </Button>
                        <Button
                            variant={isFlatView ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setIsFlatView(true)}
                        >
                            <Filter className="mr-1 h-3 w-3" />
                            Flat
                        </Button>
                    </div>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="relative flex-1 min-w-[300px]">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search topics..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-8 bg-background/50"
                                />
                            </div>
                            <div className="flex items-center gap-2">

                                <Select value={parentFilter} onValueChange={setParentFilter}>
                                    <SelectTrigger className="w-[180px] h-9">
                                        <SelectValue placeholder="Root Category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Categories</SelectItem>
                                        {rootTopics.map(t => (
                                            <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                            <span>Showing {displayTopics.length} of {topics.length} topics</span>
                            <div className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-primary" />
                                <span>Root Topic</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <CornerDownRight className="h-3 w-3" />
                                <span>Sub-topic</span>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Topic Name</TableHead>
                                    <TableHead>Benchmark (Hours)</TableHead>
                                    <TableHead>Usage Stats</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {displayTopics.map((topic) => {
                                    const topicEntries = mockEntries.filter(e => e.topic_id === topic.id)
                                    const totalHours = topicEntries.reduce((sum, e) => sum + e.hours, 0)
                                    const parent = mockTopics.find(t => t.id === topic.parent_id)
                                    const isExpanded = expandedNodes.has(topic.id)

                                    return (
                                        <TableRow
                                            key={topic.id}
                                            className={cn(
                                                !topic.is_active && "opacity-60 grayscale-[0.5]",
                                                topic.level > 0 && "bg-muted/5 border-l-2 border-l-muted-foreground/10",
                                                topic.hasChildren && !searchQuery && "cursor-pointer hover:bg-muted/50"
                                            )}
                                            onClick={() => topic.hasChildren && !searchQuery && toggleNode(topic.id)}
                                        >
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <div style={{ marginLeft: `${topic.level * 24}px` }} className="flex items-center gap-2">
                                                        {topic.hasChildren && !searchQuery ? (
                                                            <div className="h-6 w-6 flex items-center justify-center">
                                                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                            </div>
                                                        ) : (
                                                            <div className="w-6" />
                                                        )}

                                                        <div className="flex items-center gap-2">
                                                            {topic.level > 0 && (
                                                                <div className="flex items-center text-muted-foreground/50">
                                                                    <CornerDownRight className="h-4 w-4" />
                                                                </div>
                                                            )}
                                                            <BookOpen className={cn("h-4 w-4", topic.level === 0 ? "text-primary" : "text-muted-foreground")} />
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span>{topic.name}</span>
                                                                    {!topic.is_active && <Badge variant="outline" className="text-[9px] py-0 h-4 uppercase tracking-wider">Inactive</Badge>}
                                                                </div>
                                                                {(topic.path || (parent && !isExpanded && searchQuery)) && (
                                                                    <span className="text-[10px] text-muted-foreground uppercase">
                                                                        {topic.path ? `In ${topic.path}` : `Part of ${parent?.name}`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{topic.benchmark_hours}h</TableCell>
                                            <TableCell>
                                                <div className="text-sm text-muted-foreground">
                                                    {topicEntries.length} entries / {totalHours}h logged
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(topic); }}>
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Edit
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleDelete(topic.id)
                                                            }}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <TopicDialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                    setIsDialogOpen(open)
                    if (!open) setEditingTopic(null)
                }}
                topic={editingTopic}
                topics={topics}
                onSave={handleSave}
            />
        </div>
    )
}

function TopicDialog({
    open,
    onOpenChange,
    topic,
    topics,
    onSave,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    topic: Topic | null
    topics: Topic[]
    onSave: (topic: Partial<Topic>) => void
}) {
    const [formData, setFormData] = useState<Partial<Topic>>({
        name: '',
        benchmark_hours: 0,
        parent_id: null,
        ...topic
    })


    // Reset form when dialog opens/closes or topic changes
    useEffect(() => {
        if (open) {
            setFormData({
                name: '',
                benchmark_hours: 0,
                parent_id: null,
                ...topic
            })
        }
    }, [open, topic])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(formData)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{topic ? 'Edit Topic' : 'Create Topic'}</DialogTitle>
                    <DialogDescription>
                        {topic ? 'Update topic details and benchmarks' : 'Add a new learning topic to the system'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Topic Name</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g., Advanced React Patterns"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="benchmark">Benchmark Hours</Label>
                        <Input
                            id="benchmark"
                            type="number"
                            min="0"
                            step="0.5"
                            value={formData.benchmark_hours || 0}
                            onChange={(e) => setFormData({ ...formData, benchmark_hours: Number(e.target.value) })}
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Expected hours to complete this topic
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Parent Topic</Label>
                        <ParentTopicSelector
                            value={formData.parent_id ?? null}
                            onChange={(value) => setFormData({ ...formData, parent_id: value })}
                            allTopics={topics}
                            currentTopicId={topic?.id}
                        />
                        <p className="text-xs text-muted-foreground">
                            Link this to a parent category (e.g., Frontend → React)
                        </p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">
                            {topic ? 'Save Changes' : 'Create Topic'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
