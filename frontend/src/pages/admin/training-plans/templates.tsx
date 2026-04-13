import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks'
import { importTemplate } from '@/lib/store/slices/trainingPlansSlice'
import { roadmapTemplates } from '@/data/roadmap-templates'
import type { RoadmapTemplate } from '@/lib/types'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
    ArrowLeft,
    Search,
    Clock,
    BookOpen,
    Layers,
    Download,
    Loader2,
    CheckCircle2,
} from 'lucide-react'

export default function TemplateGalleryPage() {
    const dispatch = useAppDispatch()
    const navigate = useNavigate()
    const { isImporting, plans } = useAppSelector(state => state.trainingPlans)

    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<'all' | 'role' | 'skill'>('all')
    const [activeTemplate, setActiveTemplate] = useState<RoadmapTemplate | null>(null)

    // Already-imported template IDs
    const importedTemplateIds = useMemo(() => {
        return new Set(plans.filter(p => p.source_template).map(p => p.source_template!))
    }, [plans])

    const filteredTemplates = useMemo(() => {
        return roadmapTemplates.filter(t => {
            const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.description.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory
            return matchesSearch && matchesCategory
        })
    }, [searchQuery, selectedCategory])

    const handleImport = async (template: RoadmapTemplate) => {
        try {
            const plan = await dispatch(importTemplate(template)).unwrap()
            toast.success(`"${template.name}" imported! Generating resources & KB in background...`)

            // Fire-and-forget: trigger background generation for the new plan
            const planId = plan?.id
            if (planId) {
                // Trigger resource generation (non-blocking)
                api.post('/topics/resources/generate/', { plan_id: planId }).catch(() => {
                    // Silently ignore — admin will see status on detail page
                })
                // Trigger KB generation (non-blocking)
                api.post('/topics/knowledge/generate/', { plan_id: planId }).catch(() => {
                    // Silently ignore — admin will see status on detail page
                })

                // Navigate to the new plan's detail page
                navigate(`/admin/training-plans/${planId}`)
            }
        } catch (err: any) {
            toast.error(`Import failed: ${err}`)
        }
    }

    const totalTopics = (t: RoadmapTemplate) =>
        t.sections.reduce((sum, s) => sum + s.topics.length, 0)

    const calculateTemplateHours = (t: RoadmapTemplate) => {
        return t.sections.reduce((total, section) => {
            return total + section.topics.reduce((sectionTotal, topic) => {
                const topicHours = Number(topic.benchmarkHours) || 0
                const childrenHours = topic.children?.reduce((childTotal, child) => childTotal + (Number(child.benchmarkHours) || 0), 0) || 0
                return sectionTotal + topicHours + childrenHours
            }, 0)
        }, 0)
    }

    // Full-page template detail view
    if (activeTemplate) {
        const imported = importedTemplateIds.has(activeTemplate.id)
        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => setActiveTemplate(null)}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">{activeTemplate.icon}</span>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight">{activeTemplate.name}</h1>
                                <p className="text-sm text-muted-foreground">{activeTemplate.description}</p>
                            </div>
                        </div>
                    </div>
                    <Button
                        onClick={() => handleImport(activeTemplate)}
                        disabled={isImporting || imported}
                        size="lg"
                    >
                        {isImporting ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
                        ) : imported ? (
                            <><CheckCircle2 className="h-4 w-4 mr-2" /> Already Imported</>
                        ) : (
                            <><Download className="h-4 w-4 mr-2" /> Import as Training Plan</>
                        )}
                    </Button>
                </div>

                {/* Stats bar */}
                <div className="flex items-center gap-6 px-4 py-3 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border">
                    <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-primary" />
                        <span className="font-semibold">~{calculateTemplateHours(activeTemplate)} hours</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{activeTemplate.sections.length} sections</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{totalTopics(activeTemplate)} topics</span>
                    </div>
                    {imported && (
                        <Badge variant="outline" className="text-green-600 border-green-500/50 ml-auto">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Imported
                        </Badge>
                    )}
                </div>

                {/* Roadmap Graph */}
                <TemplateRoadmapGraph template={activeTemplate} />
            </div>
        )
    }

    // Gallery grid view
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/admin/training-plans')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Roadmap Templates</h1>
                    <p className="text-muted-foreground">
                        Import role-based learning roadmaps — {roadmapTemplates.length} templates available
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search templates..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                <div className="flex gap-2">
                    {(['all', 'role', 'skill'] as const).map(cat => (
                        <Button
                            key={cat}
                            size="sm"
                            variant={selectedCategory === cat ? 'default' : 'outline'}
                            onClick={() => setSelectedCategory(cat)}
                        >
                            {cat === 'all' ? 'All' : cat === 'role' ? '👤 Roles' : '🛠️ Skills'}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTemplates.map(template => {
                    const imported = importedTemplateIds.has(template.id)
                    return (
                        <Card
                            key={template.id}
                            className={`group cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/40 ${imported ? 'border-green-500/30 bg-green-500/5' : ''}`}
                            onClick={() => setActiveTemplate(template)}
                        >
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between">
                                    <span className="text-3xl">{template.icon}</span>
                                    {imported && (
                                        <Badge variant="outline" className="text-green-600 border-green-500/50 text-xs">
                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Imported
                                        </Badge>
                                    )}
                                </div>
                                <CardTitle className="text-base mt-2 group-hover:text-primary transition-colors">
                                    {template.name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" /> ~{calculateTemplateHours(template)}h
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Layers className="h-3 w-3" /> {template.sections.length} sections
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <BookOpen className="h-3 w-3" /> {totalTopics(template)} topics
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {filteredTemplates.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                    No templates match your search.
                </div>
            )}
        </div>
    )
}


// ──────────────────────────────────────────────────────
// Roadmap.sh-inspired graph visualization for templates
// ──────────────────────────────────────────────────────

const SECTION_COLORS = [
    { bg: 'bg-violet-500/15', border: 'border-violet-500/50', text: 'text-violet-700 dark:text-violet-400', accent: 'bg-violet-500' },
    { bg: 'bg-blue-500/15', border: 'border-blue-500/50', text: 'text-blue-700 dark:text-blue-400', accent: 'bg-blue-500' },
    { bg: 'bg-emerald-500/15', border: 'border-emerald-500/50', text: 'text-emerald-700 dark:text-emerald-400', accent: 'bg-emerald-500' },
    { bg: 'bg-amber-500/15', border: 'border-amber-500/50', text: 'text-amber-700 dark:text-amber-400', accent: 'bg-amber-500' },
    { bg: 'bg-rose-500/15', border: 'border-rose-500/50', text: 'text-rose-700 dark:text-rose-400', accent: 'bg-rose-500' },
    { bg: 'bg-cyan-500/15', border: 'border-cyan-500/50', text: 'text-cyan-700 dark:text-cyan-400', accent: 'bg-cyan-500' },
    { bg: 'bg-orange-500/15', border: 'border-orange-500/50', text: 'text-orange-700 dark:text-orange-400', accent: 'bg-orange-500' },
    { bg: 'bg-pink-500/15', border: 'border-pink-500/50', text: 'text-pink-700 dark:text-pink-400', accent: 'bg-pink-500' },
]

function TemplateRoadmapGraph({ template }: { template: RoadmapTemplate }) {
    // Layout: arrange sections in a 2-column staggered layout like roadmap.sh
    // Each section becomes a node with its topics branching off to the side
    const sections = template.sections

    return (
        <div className="relative pb-12">
            {/* Central spine */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border -translate-x-1/2 z-0" />

            <div className="relative z-10 space-y-0">
                {sections.map((section, idx) => {
                    const isLeft = idx % 2 === 0
                    const colors = SECTION_COLORS[idx % SECTION_COLORS.length]
                    const topicHours = section.topics.reduce((s, t) => s + t.benchmarkHours, 0)

                    return (
                        <div key={section.id} className="relative">
                            {/* Center dot on spine */}
                            <div className="absolute left-1/2 -translate-x-1/2 top-6 z-20">
                                <div className={`h-4 w-4 rounded-full ${colors.accent} ring-4 ring-background shadow-lg`} />
                            </div>

                            {/* Section card - alternating left/right */}
                            <div className={`flex ${isLeft ? 'justify-start pr-[52%]' : 'justify-end pl-[52%]'}`}>
                                <div className={`
                                    w-full rounded-xl border-2 p-4 transition-all duration-300
                                    hover:shadow-lg hover:scale-[1.01]
                                    ${colors.bg} ${colors.border}
                                `}>
                                    {/* Section header */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold text-white ${colors.accent}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`font-semibold text-sm ${colors.text}`}>{section.name}</h3>
                                            <p className="text-xs text-muted-foreground">
                                                {section.topics.length} topics • ~{topicHours}h
                                            </p>
                                        </div>
                                    </div>

                                    {/* Topic nodes */}
                                    <div className="space-y-1.5">
                                        {section.topics.map((topic, tIdx) => (
                                            <div key={tIdx} className="space-y-1">
                                                <div
                                                    className={`
                                                        flex items-center gap-2 px-3 py-2 rounded-lg border
                                                        bg-background/80 hover:bg-background transition-colors
                                                        ${colors.border.replace('/50', '/30')}
                                                    `}
                                                >
                                                    <div className={`h-1.5 w-1.5 rounded-full ${colors.accent} shrink-0`} />
                                                    <span className="text-xs font-medium flex-1 truncate">{topic.name}</span>
                                                    <span className="text-xs text-muted-foreground whitespace-nowrap">{topic.benchmarkHours}h</span>
                                                </div>

                                                {/* Nested Children */}
                                                {topic.children && topic.children.length > 0 && (
                                                    <div className="pl-4 ml-1.5 border-l border-dashed border-muted-foreground/30 space-y-1.5 pt-1 pb-1">
                                                        {topic.children.map((child, cIdx) => (
                                                            <div
                                                                key={cIdx}
                                                                className={`
                                                                    flex items-center gap-2 px-2.5 py-1.5 rounded-lg border
                                                                    bg-background/90 hover:bg-background transition-shadow shadow-sm
                                                                    ${colors.border.replace('/50', '/30')}
                                                                `}
                                                            >
                                                                <div className={`h-1 w-1 rounded-full ${colors.accent} shrink-0`} />
                                                                <span className="font-medium flex-1 truncate text-[11px] capitalize">
                                                                    {child.name}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground">{child.benchmarkHours}h</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Connector arm from spine to card */}
                            <div className={`absolute top-7 ${isLeft ? 'left-1/2 right-[52%]' : 'left-[52%] right-1/2'} h-0.5 ${colors.accent} opacity-40`} />

                            {/* Spacing */}
                            <div className="h-4" />
                        </div>
                    )
                })}

                {/* End marker */}
                <div className="flex justify-center pt-4">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-primary">
                            {template.name} Complete
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
