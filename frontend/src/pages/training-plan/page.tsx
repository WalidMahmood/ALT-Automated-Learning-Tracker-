
import { useMemo, useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { useAppSelector } from '@/lib/store/hooks'
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
} from 'lucide-react'
import { mockTrainingPlans, mockTopics, mockEntries } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

export default function TrainingPlanPage() {
  return (
    <AppLayout>
      <TrainingPlanContent />
    </AppLayout>
  )
}

function TrainingPlanContent() {
  const { user } = useAppSelector((state) => state.auth)
  const [activePlanId, setActivePlanId] = useState<number | null>(null)

  if (user?.role === 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  // Find all user's assigned training plans
  const userPlans = useMemo(() => {
    return mockTrainingPlans.filter((plan) =>
      plan.assignments.some((a) => a.user_id === user?.id)
    )
  }, [user?.id])

  // Get the plan to display
  const activePlan = useMemo(() => {
    if (activePlanId) {
      return userPlans.find(p => p.id === activePlanId) || userPlans[0]
    }
    return userPlans.length === 1 ? userPlans[0] : null
  }, [userPlans, activePlanId])

  // Calculate progress for each topic of the active plan
  const topicProgress = useMemo(() => {
    if (!activePlan || !user) return new Map<number, { hours: number; completed: boolean }>()

    const progress = new Map<number, { hours: number; completed: boolean }>()

    activePlan.plan_topics.forEach((pt) => {
      const topicEntries = mockEntries.filter(
        (e) => e.user_id === user.id && e.topic_id === pt.topic_id && e.status === 'approved'
      )
      const totalHours = topicEntries.reduce((sum, e) => sum + e.hours, 0)
      const completed = totalHours >= pt.expected_hours * 0.8 // 80% threshold

      progress.set(pt.topic_id, { hours: totalHours, completed })
    })

    return progress
  }, [activePlan, user])

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (!activePlan) return 0

    const totalExpected = activePlan.plan_topics.reduce((sum, pt) => sum + pt.expected_hours, 0)
    const totalLogged = Array.from(topicProgress.values()).reduce((sum, p) => sum + p.hours, 0)

    return Math.min(100, Math.round((totalLogged / totalExpected) * 100))
  }, [activePlan, topicProgress])

  const completedTopics = Array.from(topicProgress.values()).filter((p) => p.completed).length
  const totalTopics = activePlan?.plan_topics.length || 0

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
              {completedTopics}/{totalTopics} Topics
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
              <p className="text-2xl font-bold text-primary">{totalTopics}</p>
              <p className="text-xs text-muted-foreground">Total Topics</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-success">{completedTopics}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">
                {activePlan!.plan_topics.reduce((sum, pt) => sum + pt.expected_hours, 0)}h
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
          <Accordion type="single" collapsible className="w-full">
            {activePlan!.plan_topics
              .sort((a, b) => a.sequence_order - b.sequence_order)
              .map((planTopic, index) => {
                const topic = mockTopics.find((t) => t.id === planTopic.topic_id)
                const progress = topicProgress.get(planTopic.topic_id)
                const isCompleted = progress?.completed || false
                const hoursLogged = progress?.hours || 0
                const progressPercent = Math.min(
                  100,
                  Math.round((hoursLogged / planTopic.expected_hours) * 100)
                )

                // Determine if this topic is the current one
                const prevTopicsCompleted = activePlan!.plan_topics
                  .filter((pt) => pt.sequence_order < planTopic.sequence_order)
                  .every((pt) => topicProgress.get(pt.topic_id)?.completed)
                const isCurrent = !isCompleted && prevTopicsCompleted

                return (
                  <AccordionItem key={planTopic.id} value={`topic-${planTopic.id}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-4 w-full pr-4">
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full border-2',
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
                            <span className="text-sm font-medium">{index + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'font-medium',
                                isCompleted && 'text-muted-foreground line-through'
                              )}
                            >
                              {topic?.name}
                            </span>
                            {isCurrent && (
                              <Badge className="bg-primary/10 text-primary">
                                Current
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {hoursLogged.toFixed(1)}h / {planTopic.expected_hours}h
                          </p>
                        </div>
                        <div className="w-24">
                          <Progress value={progressPercent} className="h-1.5" />
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-12 space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Difficulty</p>
                            <div className="flex items-center gap-1 mt-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div
                                  key={i}
                                  className={cn(
                                    'h-2 w-4 rounded-sm',
                                    i < (topic?.difficulty || 0)
                                      ? 'bg-primary'
                                      : 'bg-muted'
                                  )}
                                />
                              ))}
                              <span className="ml-2 text-muted-foreground">
                                {topic?.difficulty}/5
                              </span>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Benchmark Hours</p>
                            <p className="font-medium mt-1">
                              ~{topic?.benchmark_hours}h for this topic
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-muted-foreground text-sm mb-2">
                            Your Progress
                          </p>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">
                                {hoursLogged.toFixed(1)} hours logged
                              </span>
                            </div>
                            {isCompleted && (
                              <div className="flex items-center gap-2 text-success">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-sm font-medium">Completed</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
