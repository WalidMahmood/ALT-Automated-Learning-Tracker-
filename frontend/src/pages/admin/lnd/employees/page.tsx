/**
 * L&D Employees Page
 * 
 * Shows employees from the LND sidecar (synced from ERP).
 * Admin can view employee details and their course enrollments.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { lndStudentsAPI } from '@/lib/lnd-api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Users, Search, Building2 } from 'lucide-react'
import type { LNDStudent } from '@/lib/lnd-types'

export default function LndEmployeesPage() {
  const [employees, setEmployees] = useState<LNDStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoading(true)
        const response = await lndStudentsAPI.getAll({ is_active: true, limit: 200 })
        setEmployees(response.data)
      } catch (err: any) {
        setError(err.response?.status === 503
          ? 'L&D service is offline'
          : err.response?.data?.detail || 'Failed to fetch employees')
      } finally {
        setLoading(false)
      }
    }
    fetchEmployees()
  }, [])

  const filtered = employees.filter((e) =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_id.toLowerCase().includes(search.toLowerCase()) ||
    e.department.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/lnd"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">L&D employee directory (from ERP)</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="shrink-0">
          <Users className="h-3 w-3 mr-1" />
          {filtered.length} employees
        </Badge>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="animate-pulse">
          <CardContent className="py-12 text-center text-muted-foreground">Loading employees...</CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No employees found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-mono text-sm">{emp.employee_id}</TableCell>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.email}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm">
                        <Building2 className="h-3 w-3" /> {emp.department}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{emp.designation}</TableCell>
                    <TableCell>
                      <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                        {emp.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
