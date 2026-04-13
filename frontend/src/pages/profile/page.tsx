import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/lib/store/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    ArrowLeft,
    Mail,
    Github,
    Calendar,
    Briefcase,
    Code2,
    Pencil,
    Save,
    X,
    Loader2,
    BookOpen,
    Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import api from '@/lib/api'
import type { User, TrainingPlan } from '@/lib/types'
import { TOPIC_DOMAINS, TECH_STACK_OPTIONS } from '@/lib/constants'

export default function ProfilePage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { user: currentUser } = useAppSelector((state) => state.auth)

    const isOwnProfile = !id || (currentUser && String(currentUser.id) === id)
    const isAdmin = currentUser?.role === 'admin'

    const [profileUser, setProfileUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    // Editable form state
    const [formData, setFormData] = useState({
        full_name: '',
        github_url: '',
        experience_years: '',
        tech_stack: [] as string[],
        primary_domain: 'general',
    })
    const [newTag, setNewTag] = useState('')

    // Assigned plans with estimates
    const [assignedPlans, setAssignedPlans] = useState<any[]>([])
    const [plansLoading, setPlansLoading] = useState(false)

    // Fetch profile data
    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true)
            try {
                if (isOwnProfile) {
                    const res = await api.get('/users/profile/')
                    setProfileUser(res.data)
                } else {
                    const res = await api.get(`/users/${id}/`)
                    setProfileUser(res.data)
                }
            } catch (err) {
                console.error('Failed to fetch profile:', err)
                toast.error('Failed to load profile')
            } finally {
                setIsLoading(false)
            }
        }
        fetchProfile()
    }, [id, isOwnProfile])

    // Set form data when profile loads
    useEffect(() => {
        if (profileUser) {
            setFormData({
                full_name: profileUser.full_name || '',
                github_url: profileUser.github_url || '',
                experience_years: String(profileUser.experience_years || ''),
                tech_stack: profileUser.tech_stack || [],
                primary_domain: profileUser.primary_domain || 'general',
            })
        }
    }, [profileUser])

    // Fetch assigned plans with estimates
    useEffect(() => {
        if (!profileUser) return
        const fetchPlans = async () => {
            setPlansLoading(true)
            try {
                const [plansRes, assignmentsRes] = await Promise.all([
                    api.get('/training-plans/'),
                    api.get('/training-plans/assignments/my_assignments/', {
                        params: { user_id: profileUser.id }
                    }),
                ])
                const plans: TrainingPlan[] = plansRes.data
                const assignments = assignmentsRes.data

                // Find plans assigned to this user
                // Assignments are already filtered by the API for this user
                const userAssignments = assignments
                const userPlanData = userAssignments.map((a: any) => {
                    const plan = plans.find(p => p.id === a.plan)
                    return plan ? { ...plan, assigned_at: a.assigned_at } : null
                }).filter(Boolean)

                // Fetch estimates for each plan
                const withEstimates = await Promise.all(
                    userPlanData.map(async (plan: any) => {
                        try {
                            const estRes = await api.get(`/training-plans/${plan.id}/estimate/${profileUser.id}/`)
                            return { ...plan, estimate: estRes.data }
                        } catch {
                            return { ...plan, estimate: null }
                        }
                    })
                )
                setAssignedPlans(withEstimates)
            } catch (err) {
                console.error('Failed to fetch plans:', err)
            } finally {
                setPlansLoading(false)
            }
        }
        fetchPlans()
    }, [profileUser])

    const handleSave = async () => {
        if (!profileUser) return
        setIsSaving(true)
        try {
            const payload = {
                full_name: formData.full_name || null,
                github_url: formData.github_url || null,
                experience_years: formData.experience_years && !isNaN(parseFloat(formData.experience_years)) ? parseFloat(formData.experience_years) : null,
                tech_stack: formData.tech_stack,
                primary_domain: formData.primary_domain,
            }

            if (isOwnProfile) {
                const res = await api.patch('/users/profile/', payload)
                setProfileUser(res.data)
            } else {
                const res = await api.patch(`/users/${id}/`, payload)
                setProfileUser(res.data)
            }
            setIsEditing(false)
            toast.success('Profile updated successfully')
        } catch (err: any) {
            console.error('Failed to update profile:', err)
            toast.error(err?.response?.data?.github_url?.[0] || 'Failed to update profile')
        } finally {
            setIsSaving(false)
        }
    }

    const handleAddTag = () => {
        const tag = newTag.trim()
        if (tag && !formData.tech_stack.includes(tag)) {
            setFormData(prev => ({
                ...prev,
                tech_stack: [...prev.tech_stack, tag]
            }))
            setNewTag('')
        }
    }

    const handleRemoveTag = (tag: string) => {
        setFormData(prev => ({
            ...prev,
            tech_stack: prev.tech_stack.filter(t => t !== tag)
        }))
    }

    const canEdit = isOwnProfile || isAdmin

    if (isLoading) {
        return (
            <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-7 w-48" />
                </div>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-6">
                            <Skeleton className="h-24 w-24 rounded-full" />
                            <div className="flex-1 space-y-3">
                                <Skeleton className="h-6 w-48" />
                                <Skeleton className="h-4 w-64" />
                                <Skeleton className="h-5 w-24 rounded-full" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent className="pt-6">
                                <Skeleton className="h-4 w-24 mb-2" />
                                <Skeleton className="h-6 w-32" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    if (!profileUser) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <p className="text-muted-foreground">User not found</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Go Back
                </Button>
            </div>
        )
    }

    const displayName = profileUser.full_name || profileUser.name || profileUser.email.split('@')[0]
    const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    const memberSince = profileUser.created_at ? format(new Date(profileUser.created_at), 'MMMM yyyy') : 'Unknown'

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {!isOwnProfile && (
                        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {isOwnProfile ? 'My Profile' : 'User Profile'}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {isOwnProfile ? 'View and edit your profile information' : `Viewing ${displayName}'s profile`}
                        </p>
                    </div>
                </div>
                {canEdit && !isEditing && (
                    <Button variant="outline" onClick={() => setIsEditing(true)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit Profile
                    </Button>
                )}
                {isEditing && (
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => {
                            setIsEditing(false)
                            // Reset form data
                            if (profileUser) {
                                setFormData({
                                    full_name: profileUser.full_name || '',
                                    github_url: profileUser.github_url || '',
                                    experience_years: String(profileUser.experience_years || ''),
                                    tech_stack: profileUser.tech_stack || [],
                                    primary_domain: profileUser.primary_domain || 'general',
                                })
                            }
                        }}>
                            <X className="mr-2 h-4 w-4" />
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Save Changes
                        </Button>
                    </div>
                )}
            </div>

            {/* Profile Card */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-start gap-6">
                        {/* Avatar */}
                        <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold shrink-0">
                            {initials}
                        </div>

                        {/* Basic Info */}
                        <div className="flex-1 space-y-3 w-full">
                            {isEditing ? (
                                <div className="space-y-2">
                                    <Label>Full Name</Label>
                                    <Input
                                        value={formData.full_name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                                        placeholder="Enter full name"
                                    />
                                </div>
                            ) : (
                                <h2 className="text-2xl font-bold">{displayName}</h2>
                            )}

                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Mail className="h-4 w-4" />
                                <span className="text-sm">{profileUser.email}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <Badge variant={profileUser.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                                    {profileUser.role}
                                </Badge>
                                <Badge variant={profileUser.is_active ? 'outline' : 'destructive'}>
                                    {profileUser.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Calendar className="h-4 w-4" />
                                <span>Member since {memberSince}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* GitHub */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2">
                            <Github className="h-4 w-4" />
                            GitHub Profile
                        </div>
                        {isEditing ? (
                            <Input
                                value={formData.github_url}
                                onChange={(e) => setFormData(prev => ({ ...prev, github_url: e.target.value }))}
                                placeholder="https://github.com/username"
                            />
                        ) : profileUser.github_url ? (
                            <a href={profileUser.github_url} target="_blank" rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline break-all">
                                {profileUser.github_url}
                            </a>
                        ) : (
                            <p className="text-sm text-muted-foreground italic">Not provided</p>
                        )}
                    </CardContent>
                </Card>

                {/* Experience */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2">
                            <Briefcase className="h-4 w-4" />
                            Experience
                        </div>
                        {isEditing ? (
                            <Input
                                type="number"
                                step="0.5"
                                min="0"
                                value={formData.experience_years}
                                onChange={(e) => setFormData(prev => ({ ...prev, experience_years: e.target.value }))}
                                placeholder="Years of experience"
                            />
                        ) : (
                            <p className="text-xl font-bold">
                                {profileUser.experience_years || 0} <span className="text-sm font-normal text-muted-foreground">years</span>
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Primary Domain */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2">
                            <Briefcase className="h-4 w-4" />
                            Primary Domain
                        </div>
                        {isEditing ? (
                            <Select
                                value={formData.primary_domain}
                                onValueChange={(v) => setFormData(prev => ({ ...prev, primary_domain: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select primary domain" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TOPIC_DOMAINS.map((d) => (
                                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <p className="text-xl font-bold capitalize">
                                {TOPIC_DOMAINS.find(d => d.value === profileUser.primary_domain)?.label || profileUser.primary_domain || 'General'}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Member Since */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2">
                            <Calendar className="h-4 w-4" />
                            Member Since
                        </div>
                        <p className="text-xl font-bold">{memberSince}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tech Stack */}
            <Card className="overflow-visible">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Code2 className="h-4 w-4" />
                        Tech Stack
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isEditing ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {formData.tech_stack.map((tag) => (
                                    <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTag(tag)}
                                            className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                            <div className="relative">
                                <Input
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    placeholder="Search technologies..."
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
                                    className="max-w-sm"
                                />
                                {newTag.trim().length > 0 && (
                                    <div className="absolute z-50 top-full left-0 mt-1 w-full max-w-sm bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                        {TECH_STACK_OPTIONS
                                            .filter(opt =>
                                                opt.toLowerCase().includes(newTag.trim().toLowerCase()) &&
                                                !formData.tech_stack.includes(opt)
                                            )
                                            .slice(0, 12)
                                            .map((opt) => (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                                                    onClick={() => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            tech_stack: [...prev.tech_stack, opt]
                                                        }))
                                                        setNewTag('')
                                                    }}
                                                >
                                                    {opt}
                                                </button>
                                            ))
                                        }
                                        {!TECH_STACK_OPTIONS.some(
                                            opt => opt.toLowerCase() === newTag.trim().toLowerCase()
                                        ) && newTag.trim().length > 1 && !formData.tech_stack.includes(newTag.trim()) && (
                                            <button
                                                type="button"
                                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors border-t text-primary font-medium"
                                                onClick={handleAddTag}
                                            >
                                                + Add custom "{newTag.trim()}"
                                            </button>
                                        )}
                                        {TECH_STACK_OPTIONS
                                            .filter(opt =>
                                                opt.toLowerCase().includes(newTag.trim().toLowerCase()) &&
                                                !formData.tech_stack.includes(opt)
                                            ).length === 0 && (
                                                !newTag.trim() || formData.tech_stack.includes(newTag.trim())
                                            ) && (
                                            <p className="px-3 py-2 text-sm text-muted-foreground italic">No matches found</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {(profileUser.tech_stack?.length > 0) ? (
                                profileUser.tech_stack.map((tech) => (
                                    <Badge key={tech} variant="secondary">{tech}</Badge>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground italic">No technologies listed</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Assigned Training Plans */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Assigned Training Plans
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {plansLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 2 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-lg border">
                                    <Skeleton className="h-10 w-10 rounded" />
                                    <div className="flex-1 space-y-1">
                                        <Skeleton className="h-4 w-40" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                    <Skeleton className="h-5 w-20 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : assignedPlans.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic py-4 text-center">No training plans assigned</p>
                    ) : (
                        <div className="space-y-3">
                            {assignedPlans.map((plan) => (
                                <div
                                    key={plan.id}
                                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/admin/training-plans/${plan.id}/user/${profileUser.id}`)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <BookOpen className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{plan.plan_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {plan.topic_count || plan.plan_topics?.length || 0} topics
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {plan.estimate && (
                                            <div className="flex items-center gap-1 text-sm">
                                                <Clock className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-semibold">{Math.round(plan.estimate.estimated_hours)}h</span>
                                                <span className="text-xs text-muted-foreground">estimated</span>
                                            </div>
                                        )}
                                        <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                                            {plan.is_active ? 'Active' : 'Draft'}
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
