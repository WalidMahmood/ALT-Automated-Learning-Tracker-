
import { useState } from 'react'

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
import { MoreHorizontal, Search, UserCog, BookOpen, Filter, Trash2, Plus, Mail, Shield, CheckCircle2, XCircle, Pencil } from 'lucide-react'
import { useAppSelector, useAppDispatch } from '@/lib/store/hooks'
import { Navigate } from 'react-router-dom'
import type { User, UserRole } from '@/lib/types'
import { UserProfileModal } from '@/components/admin/user-profile-modal'
import { useMemo, useEffect } from 'react'
import { fetchUsers, createUserThunk, updateUserThunk, deleteUserThunk } from '@/lib/store/slices/usersSlice'
import { fetchTrainingPlans, assignPlanThunk } from '@/lib/store/slices/trainingPlansSlice'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function UsersPage() {
    const dispatch = useAppDispatch()
    const { user: currentUser } = useAppSelector((state) => state.auth)
    const { users } = useAppSelector((state) => state.users)
    const { plans } = useAppSelector((state) => state.trainingPlans)

    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
    const [planFilter, setPlanFilter] = useState<string>('all')
    const [expFilter, setExpFilter] = useState<'all' | 'junior' | 'mid' | 'senior'>('all')

    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [isAssignPlanOpen, setIsAssignPlanOpen] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false)

    useEffect(() => {
        if (currentUser?.role === 'admin') {
            dispatch(fetchUsers())
            dispatch(fetchTrainingPlans())
        }
    }, [dispatch, currentUser])

    // Redirect non-admins
    if (currentUser?.role !== 'admin') {
        return <Navigate to="/dashboard" replace />
    }

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            const matchesSearch = (u.full_name || u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email.toLowerCase().includes(searchQuery.toLowerCase())

            const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? u.is_active : !u.is_active)

            // Needs fix: real assignments logic
            // Check both a.user_id and a.user.id for robustness
            const assignedPlans = plans.filter(p => p.assignments?.some(a => (a.user_id || a.user?.id) === u.id))
            const matchesPlan = planFilter === 'all' || assignedPlans.some(p => p.id === Number(planFilter))

            const matchesExp = expFilter === 'all' ||
                (expFilter === 'junior' && u.experience_years < 2) ||
                (expFilter === 'mid' && u.experience_years >= 2 && u.experience_years < 5) ||
                (expFilter === 'senior' && u.experience_years >= 5)

            return matchesSearch && matchesStatus && matchesPlan && matchesExp
        })
    }, [searchQuery, statusFilter, planFilter, expFilter, users, plans])

    const handleAssignPlan = (user: User) => {
        setSelectedUser(user)
        setIsAssignPlanOpen(true)
    }

    const handleViewProfile = (user: User) => {
        setSelectedUser(user)
        setIsProfileOpen(true)
    }

    const handleEditUser = (user: User) => {
        setSelectedUser(user)
        setIsEditOpen(true)
    }

    const handleDeleteClick = (user: User) => {
        setSelectedUser(user)
        setIsDeleteAlertOpen(true)
    }

    const confirmDelete = async () => {
        if (!selectedUser) return
        try {
            await dispatch(deleteUserThunk(selectedUser.id)).unwrap()
            toast.success('User deactivated successfully')
            setIsDeleteAlertOpen(false)
        } catch (error: any) {
            toast.error(error.message || 'Failed to deactivate user')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
                    <p className="text-muted-foreground">
                        Manage learners and assign training plans
                    </p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create User
                </Button>
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
                                        {plans.map(p => (
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
                                {filteredUsers.map((learner) => (
                                    <TableRow
                                        key={learner.id}
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => handleViewProfile(learner)}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                                                    {(learner.full_name || learner.name || learner.email || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{learner.full_name || learner.name || learner.email}</p>
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
                                            {plans.filter(p => p.assignments?.some(a => (a.user_id || a.user?.id) === learner.id)).length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {plans.filter(p => p.assignments?.some(a => (a.user_id || a.user?.id) === learner.id)).map(plan => (
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
                                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditUser(learner); }}>
                                                        <Pencil className="mr-2 h-4 w-4" />
                                                        Edit Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewProfile(learner); }}>
                                                        <Search className="mr-2 h-4 w-4" />
                                                        View Full Bio
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteClick(learner); }}
                                                        className="text-destructive font-medium"
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Delete Learner
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
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

            <CreateUserDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
            />

            <EditUserDialog
                open={isEditOpen}
                onOpenChange={(open) => {
                    setIsEditOpen(open)
                    if (!open) setSelectedUser(null)
                }}
                user={selectedUser}
            />

            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Deactivate User?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will prevent <strong>{selectedUser?.full_name || selectedUser?.name || selectedUser?.email}</strong> from logging in.
                            Their historical data will be preserved.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Deactivate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <UserProfileModal
                open={isProfileOpen}
                onOpenChange={(open) => {
                    setIsProfileOpen(open)
                    if (!open) setSelectedUser(null)
                }}
                user={selectedUser}
            />
        </div>

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
    const dispatch = useAppDispatch()
    const { plans } = useAppSelector(state => state.trainingPlans)
    const [selectedPlanId, setSelectedPlanId] = useState<string>('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleAssign = async () => {
        if (!user || !selectedPlanId) return
        setIsSubmitting(true)
        try {
            await dispatch(assignPlanThunk({
                planId: Number(selectedPlanId),
                userIds: [user.id]
            })).unwrap()
            toast.success('Plan assigned successfully')
            onOpenChange(false)
        } catch (error: any) {
            toast.error(error.message || 'Failed to assign plan')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Assign Training Plan</DialogTitle>
                    <DialogDescription>
                        Assign a new training plan to {user?.full_name || user?.name}.
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
                                {plans.map((plan) => (
                                    <SelectItem key={plan.id} value={plan.id.toString()}>
                                        {plan.plan_name} ({plan.plan_topics?.length || 0} topics)
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
                    <Button onClick={handleAssign} disabled={!selectedPlanId || isSubmitting}>
                        {isSubmitting ? 'Assigning...' : 'Assign Plan'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function CreateUserDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const dispatch = useAppDispatch()
    const [isLoading, setIsLoading] = useState(false)
    const [formData, setFormData] = useState({
        email: '',
        full_name: '',
        password: '',
        password_confirm: '',
        role: 'learner' as UserRole
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (formData.password !== formData.password_confirm) {
            toast.error('Passwords do not match')
            return
        }
        setIsLoading(true)
        try {
            await dispatch(createUserThunk(formData)).unwrap()
            toast.success('User created successfully')
            onOpenChange(false)
            setFormData({ email: '', full_name: '', password: '', password_confirm: '', role: 'learner' })
        } catch (error: any) {
            toast.error(error.email?.[0] || error.password?.[0] || 'Failed to create user')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5 text-primary" />
                        Create New User
                    </DialogTitle>
                    <DialogDescription>
                        Add a new learner or admin to the system.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <div className="relative">
                            <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="name@brainstation-23.com"
                                className="pl-9"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <div className="relative">
                            <UserCog className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="name"
                                placeholder="e.g. John Doe"
                                className="pl-9"
                                value={formData.full_name}
                                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                required
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                required
                                minLength={12}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm">Confirm Password</Label>
                            <Input
                                id="confirm"
                                type="password"
                                value={formData.password_confirm}
                                onChange={e => setFormData({ ...formData, password_confirm: e.target.value })}
                                required
                                minLength={12}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Role</Label>
                        <Select
                            value={formData.role}
                            onValueChange={(v: any) => setFormData({ ...formData, role: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="learner">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="h-4 w-4" /> Learner
                                    </div>
                                </SelectItem>
                                <SelectItem value="admin">
                                    <div className="flex items-center gap-2">
                                        <Shield className="h-4 w-4" /> Administrator
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Creating...' : 'Create User'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function EditUserDialog({
    open,
    onOpenChange,
    user
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    user: User | null
}) {
    const dispatch = useAppDispatch()
    const [isLoading, setIsLoading] = useState(false)
    const [formData, setFormData] = useState({
        full_name: '',
        role: 'learner' as UserRole,
        is_active: true
    })

    useEffect(() => {
        if (user) {
            setFormData({
                full_name: user.full_name || user.name || '',
                role: user.role,
                is_active: user.is_active
            })
        }
    }, [user])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return
        setIsLoading(true)
        try {
            await dispatch(updateUserThunk({ id: user.id, data: formData })).unwrap()
            toast.success('User updated successfully')
            onOpenChange(false)
        } catch (error: any) {
            toast.error(error.message || 'Failed to update user')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit User Details</DialogTitle>
                    <DialogDescription>
                        Update account settings for {user?.email}.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit-name">Full Name</Label>
                        <Input
                            id="edit-name"
                            value={formData.full_name}
                            onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Role</Label>
                        <Select
                            value={formData.role}
                            onValueChange={(v: any) => setFormData({ ...formData, role: v })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="learner">Learner</SelectItem>
                                <SelectItem value="admin">Administrator</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                            value={formData.is_active ? 'active' : 'inactive'}
                            onValueChange={(v: any) => setFormData({ ...formData, is_active: v === 'active' })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="active">
                                    <div className="flex items-center gap-2 text-success">
                                        <CheckCircle2 className="h-4 w-4" /> Active
                                    </div>
                                </SelectItem>
                                <SelectItem value="inactive">
                                    <div className="flex items-center gap-2 text-destructive">
                                        <XCircle className="h-4 w-4" /> Inactive
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
