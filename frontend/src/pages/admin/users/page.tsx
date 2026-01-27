
import { useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
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
import { MoreHorizontal, Search, UserCog, BookOpen, Filter, Trash2 } from 'lucide-react'
import { mockUsers, mockTrainingPlans } from '@/lib/mock-data'
import { useAppSelector } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import type { User } from '@/lib/types'
import { UserProfileModal } from '@/components/admin/user-profile-modal'
import { useMemo } from 'react'

export default function UsersPage() {
    const { user } = useAppSelector((state) => state.auth)
    const [users, setUsers] = useState<User[]>(mockUsers)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
    const [planFilter, setPlanFilter] = useState<string>('all')
    const [expFilter, setExpFilter] = useState<'all' | 'junior' | 'mid' | 'senior'>('all')
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [isAssignPlanOpen, setIsAssignPlanOpen] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)

    // Redirect non-admins
    if (user?.role !== 'admin') {
        return <Navigate to="/dashboard" replace />
    }

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            if (u.role !== 'learner') return false

            const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email.toLowerCase().includes(searchQuery.toLowerCase())

            const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? u.is_active : !u.is_active)

            const assignedPlans = mockTrainingPlans.filter(p => p.assignments.some(a => a.user_id === u.id))
            const matchesPlan = planFilter === 'all' || assignedPlans.some(p => p.id === Number(planFilter))

            const matchesExp = expFilter === 'all' ||
                (expFilter === 'junior' && u.experience_years < 2) ||
                (expFilter === 'mid' && u.experience_years >= 2 && u.experience_years < 5) ||
                (expFilter === 'senior' && u.experience_years >= 5)

            return matchesSearch && matchesStatus && matchesPlan && matchesExp
        })
    }, [searchQuery, statusFilter, planFilter, expFilter, users])

    const handleAssignPlan = (user: User) => {
        setSelectedUser(user)
        setIsAssignPlanOpen(true)
    }

    const handleViewProfile = (user: User) => {
        setSelectedUser(user)
        setIsProfileOpen(true)
    }

    const handleDelete = (id: number) => {
        setUsers(prev => prev.filter(u => u.id !== id))
    }

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
                        <p className="text-muted-foreground">
                            Manage learners and assign training plans
                        </p>
                    </div>
                    {/* Add User button could go here */}
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="relative flex-1 min-w-[300px]">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search learners by name or email..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-8 bg-background/50"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-muted-foreground" />
                                    <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                                        <SelectTrigger className="w-[120px] h-9">
                                            <SelectValue placeholder="Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="inactive">Inactive</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={expFilter} onValueChange={(v: any) => setExpFilter(v)}>
                                        <SelectTrigger className="w-[130px] h-9">
                                            <SelectValue placeholder="Experience" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Exp</SelectItem>
                                            <SelectItem value="junior">Junior (&lt;2y)</SelectItem>
                                            <SelectItem value="mid">Mid (2-5y)</SelectItem>
                                            <SelectItem value="senior">Senior (5y+)</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={planFilter} onValueChange={setPlanFilter}>
                                        <SelectTrigger className="w-[160px] h-9">
                                            <SelectValue placeholder="Training Plan" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Plans</SelectItem>
                                            {mockTrainingPlans.map(p => (
                                                <SelectItem key={p.id} value={p.id.toString()}>{p.plan_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                                <span>Showing {filteredUsers.length} of {users.filter(u => u.role === 'learner').length} learners</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Learner</TableHead>
                                        <TableHead>Experience</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Active Plan</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((learner) => {
                                        const assignedPlans = mockTrainingPlans.filter(p => p.assignments.some(a => a.user_id === learner.id))

                                        return (
                                            <TableRow
                                                key={learner.id}
                                                className="cursor-pointer hover:bg-muted/50"
                                                onClick={() => handleViewProfile(learner)}
                                            >
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                                                            {learner.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">{learner.name}</p>
                                                            <p className="text-xs text-muted-foreground">{learner.email}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        <p className="font-medium">{learner.experience_years} Years</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={learner.is_active ? 'secondary' : 'destructive'} className="text-xs">
                                                        {learner.is_active ? 'Active' : 'Inactive'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {assignedPlans.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {assignedPlans.map(plan => (
                                                                <Badge key={plan.id} variant="secondary" className="flex items-center gap-1 text-[10px] py-0 h-5 px-2 bg-primary/5 text-primary border-primary/20">
                                                                    <BookOpen className="h-3 w-3" />
                                                                    <span>{plan.plan_name}</span>
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground italic">No active plans</span>
                                                    )}
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
                                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAssignPlan(learner); }}>
                                                                <UserCog className="mr-2 h-4 w-4" />
                                                                Assign Plan
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewProfile(learner); }}>
                                                                <Search className="mr-2 h-4 w-4" />
                                                                View Details
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={(e) => { e.stopPropagation(); handleDelete(learner.id); }}
                                                                className="text-destructive font-medium"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Delete Learner
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

                <AssignPlanDialog
                    open={isAssignPlanOpen}
                    onOpenChange={(open) => {
                        setIsAssignPlanOpen(open)
                        if (!open) setSelectedUser(null)
                    }}
                    user={selectedUser}
                />

                <UserProfileModal
                    open={isProfileOpen}
                    onOpenChange={(open) => {
                        setIsProfileOpen(open)
                        if (!open) setSelectedUser(null)
                    }}
                    user={selectedUser}
                />
            </div>
        </AppLayout>
    )
}

function AssignPlanDialog({
    open,
    onOpenChange,
    user,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    user: User | null
}) {
    const [selectedPlanId, setSelectedPlanId] = useState<string>('')

    const handleAssign = () => {
        // Dispatch assign action
        console.log(`Assign plan ${selectedPlanId} to user ${user?.id}`)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Assign Training Plan</DialogTitle>
                    <DialogDescription>
                        Assign a new training plan to {user?.name}.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Select Plan</Label>
                        <Select onValueChange={setSelectedPlanId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose a training plan..." />
                            </SelectTrigger>
                            <SelectContent>
                                {mockTrainingPlans.map((plan) => (
                                    <SelectItem key={plan.id} value={plan.id.toString()}>
                                        {plan.plan_name} ({plan.plan_topics.length} topics)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleAssign} disabled={!selectedPlanId}>
                        Assign Plan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
