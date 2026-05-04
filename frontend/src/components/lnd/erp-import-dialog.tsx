/**
 * ERP Import Dialog
 *
 * Admin can search ERP employees and create ALTS user accounts from them.
 * Used in the User Management page alongside the manual "Create User" flow.
 */
import { useState, useEffect } from 'react'
import { erpBridgeAPI } from '@/lib/lnd-bridge-api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  Search,
  Building2,
  UserPlus,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type { ERPEmployee } from '@/lib/lnd-types'

interface ERPImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserCreated?: () => void
}

export function ERPImportDialog({ open, onOpenChange, onUserCreated }: ERPImportDialogProps) {
  const [search, setSearch] = useState('')
  const [employees, setEmployees] = useState<ERPEmployee[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Search ERP employees
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await erpBridgeAPI.searchEmployees({
          search: search.trim(),
          limit: 50,
        })
        setEmployees(res.data)
      } catch (err: any) {
        if (err.response?.status === 503) {
          setError('L&D service is offline. Please start the LND sidecar.')
        } else {
          setError('Failed to fetch employees from ERP')
        }
        setEmployees([])
      } finally {
        setLoading(false)
      }
    }, 400) // debounce

    return () => clearTimeout(timer)
  }, [search, open])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSearch('')
      setEmployees([])
      setError(null)
    }
  }, [open])

  const handleImport = async (emp: ERPEmployee) => {
    setCreating(emp.employee_id)
    try {
      const res = await erpBridgeAPI.createUserFromERP({
        employee_id: emp.employee_id,
        name: emp.name,
        email: emp.email,
        department: emp.department || '',
        designation: emp.designation || '',
        sbu_name: emp.sbu_name || '',
        erp_role: '',
        joining_date: emp.joining_date,
        total_experience: emp.total_experience,
      })
      toast.success(res.data.message)
      // Mark as imported in local state
      setEmployees(prev =>
        prev.map(e =>
          e.employee_id === emp.employee_id ? { ...e, has_alts_account: true } : e
        )
      )
      onUserCreated?.()
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.email?.[0] || 'Failed to create user'
      toast.error(detail)
    } finally {
      setCreating(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Import User from ERP
          </DialogTitle>
          <DialogDescription>
            Search employees from the ERP system and create their ALTS account.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, employee ID, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Searching ERP...
            </div>
          ) : employees.length === 0 && search && !error ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No employees found matching "{search}"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {employees.map((emp) => (
                <div
                  key={emp.employee_id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{emp.name}</span>
                      <Badge variant="outline" className="shrink-0 text-xs font-mono">
                        {emp.employee_id}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {emp.department && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {emp.department}
                        </span>
                      )}
                      {emp.designation && (
                        <span className="text-xs text-muted-foreground">· {emp.designation}</span>
                      )}
                    </div>
                  </div>

                  <div className="ml-3 shrink-0">
                    {emp.has_alts_account ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Already in ALTS
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleImport(emp)}
                        disabled={creating !== null}
                      >
                        {creating === emp.employee_id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <UserPlus className="h-3 w-3 mr-1" />
                        )}
                        Import
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
