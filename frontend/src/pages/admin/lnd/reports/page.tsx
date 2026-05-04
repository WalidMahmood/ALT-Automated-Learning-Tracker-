/**
 * L&D Reports Page
 * 
 * Report generation for L&D courses, students, and LMS data.
 */
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { lndCoursesAPI, lndStudentsAPI, lndLmsAPI } from '@/lib/lnd-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Users,
  BookOpen,
  Globe,
  Loader2,
} from 'lucide-react'

export default function LndReportsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleDownload = async (type: string) => {
    setDownloading(type)
    try {
      let response
      const sd = startDate || undefined
      const ed = endDate || undefined

      switch (type) {
        case 'onsite':
          response = await lndCoursesAPI.generateOverallReport('onsite', sd, ed)
          downloadBlob(response.data as unknown as Blob, `onsite_courses_report.xlsx`)
          break
        case 'online':
          response = await lndLmsAPI.generateOverallReport(sd, ed)
          downloadBlob(response.data as unknown as Blob, `online_courses_report.xlsx`)
          break
        case 'external':
          response = await lndCoursesAPI.generateOverallReport('external', sd, ed)
          downloadBlob(response.data as unknown as Blob, `external_courses_report.xlsx`)
          break
        case 'employees':
          response = await lndStudentsAPI.generateOverallReport(sd, ed)
          downloadBlob(response.data as unknown as Blob, `employees_report.xlsx`)
          break
      }
    } catch (err) {
      console.error('Report download failed:', err)
    } finally {
      setDownloading(null)
    }
  }

  const reports = [
    { id: 'onsite', title: 'Onsite Courses Report', desc: 'All onsite course data with enrollments and completion', icon: BookOpen, color: 'text-blue-600' },
    { id: 'online', title: 'Online Courses Report', desc: 'LMS/Moodle course data and progress tracking', icon: Globe, color: 'text-emerald-600' },
    { id: 'external', title: 'External Courses Report', desc: 'Third-party training course data', icon: FileSpreadsheet, color: 'text-violet-600' },
    { id: 'employees', title: 'Employee Training Report', desc: 'All employees with their course enrollment history', icon: Users, color: 'text-amber-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/lnd"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">L&D Reports</h1>
          <p className="text-muted-foreground">Generate training reports</p>
        </div>
      </div>

      {/* Date Range */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Date Range (Optional)</CardTitle>
          <CardDescription>Filter reports by date range</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="space-y-1">
            <Label htmlFor="start-date">Start Date</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end-date">End Date</Label>
            <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Report Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <div className="p-2 rounded-lg bg-muted">
                <report.icon className={`h-5 w-5 ${report.color}`} />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">{report.title}</CardTitle>
                <CardDescription>{report.desc}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleDownload(report.id)}
                disabled={downloading !== null}
                className="w-full"
                variant="outline"
              >
                {downloading === report.id ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" /> Download Report</>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
