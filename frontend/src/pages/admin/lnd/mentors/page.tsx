/**
 * L&D Mentors Page
 * 
 * Manages internal and external mentors for L&D courses.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { lndMentorsAPI } from '@/lib/lnd-api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, GraduationCap, Mail, Phone, Building2 } from 'lucide-react'
import type { LNDMentor } from '@/lib/lnd-types'

export default function LndMentorsPage() {
  const [mentors, setMentors] = useState<LNDMentor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'internal' | 'external'>('all')

  useEffect(() => {
    const fetchMentors = async () => {
      try {
        setLoading(true)
        const response = await lndMentorsAPI.getAll(filter)
        setMentors(response.data)
      } catch (err: any) {
        setError(err.response?.status === 503
          ? 'L&D service is offline'
          : 'Failed to fetch mentors')
      } finally {
        setLoading(false)
      }
    }
    fetchMentors()
  }, [filter])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/lnd"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mentors</h1>
          <p className="text-muted-foreground">Manage training mentors</p>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="internal">Internal</TabsTrigger>
          <TabsTrigger value="external">External</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="animate-pulse">
          <CardContent className="py-12 text-center text-muted-foreground">Loading mentors...</CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company / Specialty</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mentors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No mentors found
                  </TableCell>
                </TableRow>
              ) : (
                mentors.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === 'internal' ? 'default' : 'outline'}>
                        {m.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {m.email}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {m.company}</span>}
                      {m.specialty && <span className="text-muted-foreground ml-1">· {m.specialty}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? 'default' : 'secondary'}>
                        {m.is_active ? 'Active' : 'Inactive'}
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
