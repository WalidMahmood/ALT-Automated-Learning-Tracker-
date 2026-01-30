import type { Topic } from './types'

/**
 * Recursively find all descendant topics of a given parent topic.
 */
export function getDescendantTopics(topicId: number, allTopics: Topic[]): Topic[] {
    const descendants: Topic[] = []
    const children = allTopics.filter(t => t.parent_id === topicId)

    for (const child of children) {
        descendants.push(child)
        descendants.push(...getDescendantTopics(child.id, allTopics))
    }

    return descendants
}

/**
 * Calculate the total benchmark hours for a topic and all its descendants.
 */
export function calculateRecursiveBenchmark(topicId: number, allTopics: Topic[]): number {
    const topic = allTopics.find(t => t.id === topicId)
    if (!topic) return 0

    const children = allTopics.filter(t => t.parent_id === topicId)
    const childrenHours = children.reduce((sum, child) => sum + calculateRecursiveBenchmark(child.id, allTopics), 0)

    return Number(topic.benchmark_hours) + childrenHours
}
