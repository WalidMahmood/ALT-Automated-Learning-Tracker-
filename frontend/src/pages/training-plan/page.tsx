import { useEffect, useMemo, useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BookOpen,
  Target,
} from 'lucide-react'
import { fetchTrainingPlans, fetchUserAssignments, fetchPlanDetails, fetchPlanProgress } from '@/lib/store/slices/trainingPlansSlice'
import { fetchEntries } from '@/lib/store/slices/entriesSlice'
import RoadmapGraph from '@/components/roadmap/roadmap-graph'
import api from '@/lib/api'

export default function TrainingPlanPage() {
  return <TrainingPlanContent />
}

function TrainingPlanContent() {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { plans, userAssignments, isLoading: plansLoading, lastFetched: plansLastFetched } = useAppSelector((state) => state.trainingPlans)
  const { entries, isLoading: entriesLoading, lastFetched: entriesLastFetched } = useAppSelector((state) => state.entries)

  const [activePlanId, setActivePlanId] = useState<number | null>(null)
  const [showAllPlans, setShowAllPlans] = useState(false)
  const [hoursMultiplier, setHoursMultiplier] = useState(1.0)
  const [topicEstimates, setTopicEstimates] = useState<Map<number, number>>(new Map())

  const STALE_MS = 60_000 // 60 seconds

  // Always fetch plans + assignments (lightweight, needed for plan list)
  useEffect(() => {
    // Force fetch on initial mount to ensure fresh data
    dispatch(fetchTrainingPlans(true))
    dispatch(fetchUserAssignments(true))
  }, [dispatch])

  // Lazy load entries ONLY when a plan is viewed (needed for progress calculation)
  useEffect(() => {
    if (!activePlanId) return
    const now = Date.now()
    // Only fetch entries if stale - topics are NOT needed (plan_topics has all we need)
    if (!entriesLastFetched || now - entriesLastFetched > STALE_MS) {
      dispatch(fetchEntries({ page_size: 500 }))
    }
  }, [dispatch, activePlanId, entriesLastFetched])

  if (user?.role === 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  // Find all user's assigned training plans
  const userPlans = useMemo(() => {
    return plans.filter((plan) =>
      userAssignments.some((a) => a.plan === plan.id)
    )
  }, [plans, userAssignments])

  // Get the plan to display
  const activePlan = useMemo(() => {
    if (showAllPlans) return null
    if (activePlanId) return plans.find((p) => p.id === activePlanId) || userPlans[0] || null
    // Multiple plans and none explicitly selected → show the plan list
    if (userPlans.length > 1) return null
    return userPlans[0] || null
  }, [userPlans, activePlanId, plans, showAllPlans])

  // Fetch details for active plan if needed
  useEffect(() => {
    if (activePlan && !activePlan.plan_topics) {
      dispatch(fetchPlanDetails(activePlan.id))
    }
  }, [activePlan, dispatch])

  // Fetch personalized time estimation for the active plan
  // Wait for plan_topics to be loaded first to avoid race condition
  // where topicEstimates Map is built before the graph has topic IDs to look up
  useEffect(() => {
    if (!activePlan || !user) return
    if (!activePlan.plan_topics?.length) return  // Wait until plan_topics are ready

    api.get(`/training-plans/${activePlan.id}/estimate/${user.id}/`)
      .then(res => {
        setHoursMultiplier(res.data.multipliers?.total || 1.0)
        // Build per-topic estimate map: topic_id → estimated_hours
        const estimateMap = new Map<number, number>()
        const topics: { topic_id: number; estimated_hours: number }[] = res.data.topics || []
        topics.forEach(t => estimateMap.set(t.topic_id, t.estimated_hours))
        setTopicEstimates(estimateMap)
      })
      .catch(() => {
        setHoursMultiplier(1.0)
        setTopicEstimates(new Map())
      })
  }, [activePlan?.id, activePlan?.plan_topics, user?.id])

  // Calculate progress for each topic of the active plan
  const topicProgressMap = useMemo(() => {
    if (!activePlan || !activePlan.plan_topics || !user) return new Map<number, { hours: number; completed: boolean; progress: number }>()

    const progressMap = new Map<number, { hours: number; completed: boolean; progress: number }>()

    activePlan.plan_topics.forEach((pt) => {
      // pt.topic is already loaded via prefetch_related - no need to search topics array
      const topic = pt.topic
      if (!topic) return
      
      const mastery = topic.mastery

      const hoursLogged = mastery?.total_hours || 0
      // Check if any entry for this topic is marked as completed
      const hasCompletedEntry = entries.some(e =>
        e.topic === pt.topic_id && e.user === user?.id && e.is_completed
      )
      const completed = mastery?.progress === 100 || hasCompletedEntry
      const currentProgress = hasCompletedEntry ? 100 : (mastery?.progress || 0)

      progressMap.set(pt.topic_id, {
        hours: hoursLogged,
        completed,
        progress: currentProgress
      })
    })

    return progressMap
  }, [activePlan, user, entries])

  // Calculate overall progress and counts based only on leaf topics (to avoid double-counting categories)
  const { overallProgress, completedLeafCount, totalLeafCount } = useMemo(() => {
    if (!activePlan || !activePlan.plan_topics || activePlan.plan_topics.length === 0) {
      return { overallProgress: 0, completedLeafCount: 0, totalLeafCount: 0 }
    }

    // Identify leaf topics in the plan
    const leafTopics = activePlan.plan_topics.filter(pt => {
      const topicId = pt.topic_id
      // A topic is a leaf if no other topic in the plan has it as a parent
      return !activePlan?.plan_topics?.some(other => {
        return other.topic?.parent_id === topicId
      })
    })

    if (leafTopics.length === 0) {
      return { overallProgress: 0, completedLeafCount: 0, totalLeafCount: 0 }
    }

    const completedLeaves = leafTopics.filter(pt => topicProgressMap.get(pt.topic_id)?.completed)
    const totalProgress = leafTopics.reduce((sum, pt) => {
      const p = topicProgressMap.get(pt.topic_id)
      return sum + (p?.progress || 0)
    }, 0)

    return {
      overallProgress: Math.round(totalProgress / leafTopics.length),
      completedLeafCount: completedLeaves.length,
      totalLeafCount: leafTopics.length
    }
  }, [activePlan, topicProgressMap])


  const isLoading = plansLoading || entriesLoading

  if ((isLoading && userPlans.length === 0) || (activePlan && !activePlan.plan_topics)) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card className="premium-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <Skeleton className="h-2 flex-1 rounded-full" />
              <Skeleton className="h-4 w-10" />
            </div>
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (userPlans.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Training Plan</h1>
          <p className="text-muted-foreground">
            View your assigned learning path and track progress
          </p>
        </div>

        <Card className="premium-card bg-muted/20 border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Training Plan Assigned</h3>
            <p className="text-muted-foreground text-center max-w-md">
              You don't have a training plan assigned yet. Please contact your admin
              to get assigned to a learning path.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show summary view if multiple plans and none selected
  if (userPlans.length > 1 && !activePlan) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Training Plans</h1>
          <p className="text-muted-foreground">
            You have {userPlans.length} training plans assigned. Select one to view details.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {userPlans.map((plan) => (
            <Card key={plan.id} className="premium-card shadow-md cursor-pointer hover:border-primary transition-all duration-300 hover:shadow-lg hover:-translate-y-1" onClick={() => { setActivePlanId(plan.id); setShowAllPlans(false) }}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    {plan.plan_name}
                  </CardTitle>
                </div>
                <CardDescription className="line-clamp-2">
                  {plan.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">{(plan as any).topic_count ?? plan.plan_topics?.length ?? 0} topics</span>
                  <Badge variant="outline">View Plan</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Training Plan</h1>
          <p className="text-muted-foreground">
            Track your progress through the assigned learning path
          </p>
        </div>
        <div className="flex items-center gap-2">
          {userPlans.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setShowAllPlans(true)}>
              View All Plans
            </Button>
          )}
        </div>
      </div>

      {/* Plan Overview Card */}
      <Card className="premium-card shadow-lg border-primary/20 bg-background/50 backdrop-blur-sm">
        <CardHeader className="pb-4 border-b border-border/50">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {activePlan!.plan_name}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {activePlan!.description}
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              {completedLeafCount}/{totalLeafCount} Topics
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{totalLeafCount}</p>
              <p className="text-xs text-muted-foreground">Total Topics</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-success">{completedLeafCount}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roadmap View — resources are inline inside TopicItem */}
      <RoadmapGraph plan={activePlan!} entries={entries} hoursMultiplier={hoursMultiplier} topicEstimates={topicEstimates} />
    </div>
  )
}

