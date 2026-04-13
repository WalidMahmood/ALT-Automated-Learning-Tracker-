/**
 * All 26 Roadmap Templates - inspired by roadmap.sh
 * Curated topic hierarchies with benchmark hours
 */
import type { RoadmapTemplate } from '@/lib/types'
import { enrichedRoadmaps } from './enriched-roadmaps'

export const roadmapTemplates: RoadmapTemplate[] = enrichedRoadmaps

export function getTemplateById(id: string): RoadmapTemplate | undefined {
    return roadmapTemplates.find(t => t.id === id)
}

export default roadmapTemplates
