import { useEffect, useMemo, useState } from 'react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Target,
  Loader2,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchTrainingPlans, fetchUserAssignments } from '@/lib/store/slices/trainingPlansSlice'
import { fetchTopics } from '@/lib/store/slices/topicsSlice'
import { fetchEntries } from '@/lib/store/slices/entriesSlice'

export default function TrainingPlanPage() {
  return <TrainingPlanContent />
}

function TrainingPlanContent() {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { plans, userAssignments, isLoading: plansLoading } = useAppSelector((state) => state.trainingPlans)
  const { topics, isLoading: topicsLoading } = useAppSelector((state) => state.topics)
  const { entries, isLoading: entriesLoading } = useAppSelector((state) => state.entries)

  const [activePlanId, setActivePlanId] = useState<number | null>(null)

  useEffect(() => {
    dispatch(fetchTrainingPlans())
    dispatch(fetchUserAssignments())
    dispatch(fetchTopics())
    dispatch(fetchEntries({}))
  }, [dispatch])

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
    if (activePlanId) {
      return userPlans.find(p => p.id === activePlanId) || userPlans[0]
    }
    return userPlans.length === 1 ? userPlans[0] : null
  }, [userPlans, activePlanId])

  // Calculate progress for each topic of the active plan
  const topicProgressMap = useMemo(() => {
    if (!activePlan || !user) return new Map<number, { hours: number; completed: boolean; progress: number }>()

    const progressMap = new Map<number, { hours: number; completed: boolean; progress: number }>()

    activePlan.plan_topics.forEach((pt) => {
      const topic = topics.find(t => t.id === pt.topic_id)
      const mastery = topic?.mastery

      const hoursLogged = mastery?.total_hours || 0
      const completed = mastery?.progress === 100
      const currentProgress = mastery?.progress || 0

      progressMap.set(pt.topic_id, {
        hours: hoursLogged,
        completed,
        progress: currentProgress
      })
    })

    return progressMap
  }, [activePlan, user, topics])

  // Calculate overall progress and counts based only on leaf topics (to avoid double-counting categories)
  const { overallProgress, completedLeafCount, totalLeafCount } = useMemo(() => {
    if (!activePlan || activePlan.plan_topics.length === 0) {
      return { overallProgress: 0, completedLeafCount: 0, totalLeafCount: 0 }
    }

    // Identify leaf topics in the plan
    const leafTopics = activePlan.plan_topics.filter(pt => {
      const topicId = pt.topic_id
      // A topic is a leaf if no other topic in the plan has it as a parent
      return !activePlan!.plan_topics.some(other => {
        const otherTopic = topics.find(t => t.id === other.topic_id)
        return otherTopic?.parent_id === topicId
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
  }, [activePlan, topicProgressMap, topics])

  const isLoading = plansLoading || topicsLoading || entriesLoading

  if (isLoading && userPlans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground">Loading your training plans...</p>
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

        <Card>
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
            <Card key={plan.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setActivePlanId(plan.id)}>
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
                  <span className="text-muted-foreground">{plan.plan_topics.length} topics</span>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Training Plan</h1>
          <p className="text-muted-foreground">
            Track your progress through the assigned learning path
          </p>
        </div>
        {userPlans.length > 1 && (
          <Button variant="outline" size="sm" onClick={() => setActivePlanId(null)}>
            View All Plans
          </Button>
        )}
      </div>

      {/* Plan Overview Card */}
      <Card>
        <CardHeader>
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

          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{totalLeafCount}</p>
              <p className="text-xs text-muted-foreground">Total Topics</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-success">{completedLeafCount}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">
                {activePlan!.plan_topics.reduce((sum, pt) => sum + Number(pt.expected_hours), 0).toFixed(1)}h
              </p>
              <p className="text-xs text-muted-foreground">Expected Hours</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Topic Sequence */}
      <Card>
        <CardHeader>
          <CardTitle>Learning Sequence</CardTitle>
          <CardDescription>
            Complete topics in order for the best learning experience
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full space-y-2">
            {(() => {
              const planTopics = [...activePlan!.plan_topics].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))

              const renderTopicTree = (parentId: number | null, level: number) => {
                const itemsAtThisLevel = planTopics.filter(pt => {
                  const tid = pt.topic_id || pt.topic?.id || 0
                  const topic = topics.find(t => t.id === tid)
                  if (!topic) return false

                  if (parentId !== null) {
                    return topic.parent_id === parentId
                  } else {
                    return !planTopics.some(other => {
                      const otherTid = other.topic_id || other.topic?.id || 0
                      const otherTopic = topics.find(t => t.id === otherTid)
                      return otherTopic?.id === topic.parent_id
                    })
                  }
                })

                return itemsAtThisLevel.map((pt, index) => {
                  const topicId = pt.topic_id || pt.topic?.id || 0
                  const topic = topics.find((t) => t.id === topicId) || pt.topic
                  const progressData = topicProgressMap.get(topicId)

                  const isCompleted = progressData?.completed || false
                  const hoursLogged = progressData?.hours || 0
                  const progressPercent = progressData?.progress || 0

                  // Children in plan
                  const planDescendants = planTopics.filter(other => {
                    let curr = topics.find(t => t.id === (other.topic_id || other.topic?.id))
                    while (curr?.parent_id) {
                      if (curr.parent_id === topicId) return true
                      curr = topics.find(t => t.id === curr?.parent_id)
                    }
                    return false
                  })
                  const hasPlanChildren = planDescendants.length > 0

                  // Determine if this topic is the "current" one (first uncompleted in order)
                  // For a tree, we'll keep it simple: if it's uncompleted and all previous siblings/parents are completed
                  const prevTopicsCompleted = planTopics
                    .filter((other) => (other.sequence_order || 0) < (pt.sequence_order || 0))
                    .every((other) => topicProgressMap.get(other.topic_id)?.completed)
                  const isCurrent = !isCompleted && prevTopicsCompleted

                  // Recursive sum for display hours
                  const displayExpectedHours = hasPlanChildren
                    ? planDescendants.reduce((sum, d) => sum + Number(d.expected_hours), Number(pt.expected_hours))
                    : Number(pt.expected_hours)

                  const topicEntries = entries
                    .filter(e => e.topic === topicId)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 3)

                  return (
                    <div key={`${topicId}-${level}`} className="space-y-2">
                      <AccordionItem
                        value={`topic-${topicId}`}
                        className={cn(
                          "border rounded-lg px-2 transition-all",
                          hasPlanChildren ? "bg-muted/30" : "bg-card",
                          level > 0 && "mt-2"
                        )}
                        style={{ marginLeft: `${level * 20}px` }}
                      >
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-4 w-full pr-4">
                            <div
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                                isCompleted
                                  ? 'border-success bg-success/10 text-success'
                                  : isCurrent
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-muted-foreground/30 text-muted-foreground'
                              )}
                            >
                              {isCompleted ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <span className="text-sm font-medium">{level === 0 ? index + 1 : '•'}</span>
                              )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={cn(
                                    'font-medium truncate max-w-[200px] md:max-w-none',
                                    isCompleted && 'text-muted-foreground line-through',
                                    hasPlanChildren && "font-bold"
                                  )}
                                >
                                  {topic?.name}
                                </span>
                                {hasPlanChildren && (
                                  <Badge variant="outline" className="text-xs h-4 py-0 px-1 font-normal opacity-70">Category</Badge>
                                )}
                                {isCurrent && !hasPlanChildren && (
                                  <Badge className="bg-primary/10 text-primary h-5">
                                    Current
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {hoursLogged.toFixed(1)}h / {displayExpectedHours.toFixed(1)}h
                                {hasPlanChildren && <span className="ml-1 opacity-60">(Aggregated)</span>}
                              </p>
                            </div>
                            <div className="w-16 md:w-24 shrink-0">
                              <Progress value={progressPercent} className="h-1.5" />
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="pl-12 space-y-4">
                            {!hasPlanChildren && (
                              <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Difficulty</p>
                                  <div className="flex items-center gap-1 mt-1">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <div
                                        key={i}
                                        className={cn(
                                          'h-1.5 w-3 rounded-sm',
                                          i < (topic?.difficulty || 0)
                                            ? 'bg-primary'
                                            : 'bg-muted'
                                        )}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Benchmark</p>
                                  <p className="font-medium mt-1">
                                    ~{topic?.benchmark_hours}h base
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Recent Entries */}
                            {topicEntries.length > 0 && (
                              <div className="pt-3 border-t">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recent Activities</p>
                                <div className="space-y-1.5">
                                  {topicEntries.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between text-xs py-1 px-3 bg-muted/40 rounded border border-border/30">
                                      <div className="flex items-center gap-2">
                                        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">{entry.date}</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="font-medium">
                                          {entry.hours}h
                                        </div>
                                        {entry.is_completed && <CheckCircle2 className="h-3 w-3 text-success" />}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div>
                              <p className="text-muted-foreground text-xs mb-2 uppercase tracking-wide">
                                Topic Status
                              </p>
                              <div className="flex items-center justify-between bg-muted/20 p-2 rounded-md">
                                <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-sm font-medium">
                                      {hoursLogged.toFixed(1)} logged
                                    </span>
                                  </div>
                                  {isCompleted && (
                                    <div className="flex items-center gap-2 text-success">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span className="text-sm font-bold">Completed</span>
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs font-bold text-primary">
                                  {progressPercent}%
                                </div>
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      {/* Sub-topics */}
                      {renderTopicTree(topicId, level + 1)}
                    </div>
                  )
                })
              }

              return renderTopicTree(null, 0)
            })()}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
