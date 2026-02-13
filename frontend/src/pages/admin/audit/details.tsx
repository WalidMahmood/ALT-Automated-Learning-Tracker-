import { useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Activity,
    ArrowLeft,
    Clock,
    User,
    Shield,
    Monitor,
    Globe,
    FileText,
} from 'lucide-react'
import api from '@/lib/api'
import type { AuditLog } from '@/lib/types'
import { toast } from 'sonner'
import { useAppSelector } from '@/lib/store/hooks'

export default function AuditLogDetailsPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user: currentUser } = useAppSelector((state) => state.auth)
    const [log, setLog] = useState<AuditLog | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    // Redirect if not admin
    if (!currentUser?.is_superuser) {
        return <Navigate to="/dashboard" replace />
    }

    useEffect(() => {
        if (id) {
            fetchLogDetails(id)
        }
    }, [id])

    const fetchLogDetails = async (logId: string) => {
        if (!currentUser?.is_superuser) return
        setIsLoading(true)
        try {
            const response = await api.get(`/audit/logs/${logId}/`)
            setLog(response.data)
        } catch (error) {
            console.error('Failed to fetch log details:', error)
            toast.error('Failed to load audit log details')
        } finally {
            setIsLoading(false)
        }
    }

    const getActionColor = (action: string) => {
        if (action.includes('CREATE') || action.includes('LOGIN') || action.includes('RESTORE') || action.includes('SUCCESS') || action.includes('APPROVE') || action.includes('ASSIGN'))
            return 'bg-green-500/10 text-green-500 border-green-500/20'
        if (action.includes('DELETE') || action.includes('ARCHIVE') || action.includes('REJECT') || action.includes('FAILURE') || action.includes('CANCEL'))
            return 'bg-red-500/10 text-red-500 border-red-500/20'
        if (action.includes('UPDATE') || action.includes('LOGOUT'))
            return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
        return 'bg-slate-500/10 text-slate-500 border-slate-500/20'
    }

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p className="text-muted-foreground animate-pulse">Loading details...</p>
            </div>
        )
    }

    if (!log) {
        return (
            <div className="flex flex-col h-[50vh] items-center justify-center gap-4">
                <p className="text-muted-foreground">Log not found.</p>
                <Button onClick={() => navigate('/admin/audit')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Logs
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto py-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={() => navigate('/admin/audit')}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Logs
                </Button>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Shield className="h-6 w-6 text-primary" />
                    Audit Log #{log.id}
                </h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Activity className="h-5 w-5 text-primary" />
                            Activity Overview
                        </CardTitle>
                        <CardDescription>
                            Core details of the recorded action
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">Action</p>
                                <Badge variant="outline" className={getActionColor(log.action)}>
                                    {log.action}
                                </Badge>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">Entity Type</p>
                                <div className="font-mono text-sm">{log.entity_type}</div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">Target Entity</p>
                                <div className="font-mono text-sm">{log.target_entity || 'N/A'}</div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">Status</p>
                                <Badge variant={log.status === 'SUCCESS' ? 'default' : 'destructive'} className="text-xs">
                                    {log.status}
                                </Badge>
                            </div>
                        </div>

                        {/* Before/After State Comparison */}
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Before vs After
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Before State */}
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Before</p>
                                    <div className="rounded-md border bg-muted/40 p-4 font-mono text-xs overflow-auto max-h-[300px]">
                                        {log.before_state ? (
                                            <pre>{JSON.stringify(log.before_state, null, 2)}</pre>
                                        ) : (
                                            <span className="text-muted-foreground italic">N/A (New Creation)</span>
                                        )}
                                    </div>
                                </div>
                                {/* After State */}
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">After</p>
                                    <div className="rounded-md border bg-muted/40 p-4 font-mono text-xs overflow-auto max-h-[300px]">
                                        {log.after_state ? (
                                            <pre>{JSON.stringify(log.after_state, null, 2)}</pre>
                                        ) : (
                                            <span className="text-muted-foreground italic">N/A (Hard Delete)</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <User className="h-4 w-4" />
                                Actor Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">User</p>
                                <p className="font-medium">{log.user_email || 'System / Unauthenticated'}</p>
                            </div>
                            {log.user && (
                                <div>
                                    <p className="text-xs text-muted-foreground">User ID</p>
                                    <p className="font-mono text-xs">
                                        {typeof log.user === 'object' ? log.user.id : log.user}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Monitor className="h-4 w-4" />
                                Technical Context
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Timestamp
                                </p>
                                <p className="font-medium">{format(new Date(log.created_at), 'PPpp')}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Request ID</p>
                                <p className="font-mono text-xs break-all">{log.request_id}</p>
                            </div>
                            {log.metadata?.ip_address && (
                                <div>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Globe className="h-3 w-3" /> IP Address
                                    </p>
                                    <p className="font-mono text-xs">{log.metadata.ip_address}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
