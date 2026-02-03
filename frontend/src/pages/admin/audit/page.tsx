import { useState, useEffect, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
    Card,
    CardContent,
    CardHeader,
} from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    ShieldAlert,
    Search,
    Eye,
    History,
    User as UserIcon,
} from 'lucide-react'
import { useAppSelector } from '@/lib/store/hooks'
import api from '@/lib/api'
import type { AuditLog } from '@/lib/types'
import { toast } from 'sonner'

export default function AuditLogsPage() {
    const { user: currentUser } = useAppSelector((state) => state.auth)
    const navigate = useNavigate()
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // Filters
    const [searchQuery, setSearchQuery] = useState('')
    const [actionFilter, setActionFilter] = useState('all')
    const [entityFilter, setEntityFilter] = useState('all')

    // Pagination
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [totalCount, setTotalCount] = useState(0)

    useEffect(() => {
        if (currentUser?.is_superuser) {
            fetchLogs(currentPage)
        }
    }, [currentUser, currentPage])

    const fetchLogs = async (page: number = 1) => {
        if (!currentUser?.is_superuser) return
        setIsLoading(true)
        try {
            const response = await api.get('/audit/logs/', {
                params: { page }
            })
            // The API is paginated
            const data = response.data.results || response.data
            setLogs(data)

            // Set pagination info
            if (response.data.count) {
                setTotalCount(response.data.count)
                const pageSize = 50 // matches backend
                setTotalPages(Math.ceil(response.data.count / pageSize))
            }
        } catch (error: any) {
            console.error('Failed to fetch audit logs:', error)
            toast.error('Failed to load audit logs')
        } finally {
            setIsLoading(false)
        }
    }

    // Redirect if not superuser
    if (!currentUser?.is_superuser) {
        return <Navigate to="/dashboard" replace />
    }

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesSearch =
                log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.target_user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.entity_type.toLowerCase().includes(searchQuery.toLowerCase())

            const matchesAction = actionFilter === 'all' || log.action === actionFilter
            const matchesEntity = entityFilter === 'all' || log.entity_type === entityFilter

            return matchesSearch && matchesAction && matchesEntity
        })
    }, [logs, searchQuery, actionFilter, entityFilter])

    const actions = Array.from(new Set(logs.map(l => l.action))).sort()
    const entities = Array.from(new Set(logs.map(l => l.entity_type))).sort()

    const getActionColor = (action: string) => {
        if (action.includes('create')) return 'bg-green-500/10 text-green-500 border-green-500/20'
        if (action.includes('delete') || action.includes('archive') || action.includes('reject')) return 'bg-red-500/10 text-red-500 border-red-500/20'
        if (action.includes('update') || action.includes('override')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
        return 'bg-slate-500/10 text-slate-500 border-slate-500/20'
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <ShieldAlert className="h-6 w-6 text-primary" />
                        Audit Logs
                    </h1>
                    <p className="text-muted-foreground">
                        Immutable trail of all system activities (Super Admin only)
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => fetchLogs(currentPage)} disabled={isLoading} className="gap-2">
                    <History className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by user, action..."
                                className="pl-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={actionFilter} onValueChange={setActionFilter}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Action" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Actions</SelectItem>
                                    {actions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={entityFilter} onValueChange={setEntityFilter}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Entity" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Entities</SelectItem>
                                    {entities.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="w-[180px]">Timestamp</TableHead>
                                    <TableHead>User (Actor)</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead className="text-right">View</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            Loading audit logs...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            No logs found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <TableRow key={log.id} className="group">
                                            <TableCell className="text-xs font-mono text-muted-foreground">
                                                {format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss')}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <UserIcon className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-sm font-medium">{log.user_email || 'System'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn("text-[10px] font-mono", getActionColor(log.action))}>
                                                    {log.action}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => navigate(`/admin/audit/${log.id}`)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-2 py-4 border-t">
                            <div className="text-sm text-muted-foreground">
                                Page {currentPage} of {totalPages} • Total: {totalCount} logs
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                >
                                    First
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </Button>

                                {/* Page Numbers */}
                                <div className="flex gap-1 mx-2">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(page => {
                                            // Show first page, last page, current page, and adjacent pages
                                            if (page === 1 || page === totalPages) return true
                                            if (Math.abs(page - currentPage) <= 1) return true
                                            return false
                                        })
                                        .map((page, idx, arr) => {
                                            // Add ellipsis where needed
                                            const showEllipsisBefore = idx > 0 && page - arr[idx - 1] > 1
                                            return (
                                                <div key={`page-wrapper-${page}`} className="flex items-center gap-1">
                                                    {showEllipsisBefore && (
                                                        <span className="px-2 py-1 text-muted-foreground">
                                                            ...
                                                        </span>
                                                    )}
                                                    <Button
                                                        variant={currentPage === page ? "default" : "outline"}
                                                        size="sm"
                                                        onClick={() => setCurrentPage(page)}
                                                        className="min-w-[40px]"
                                                    >
                                                        {page}
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                >
                                    Last
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(' ')
}
