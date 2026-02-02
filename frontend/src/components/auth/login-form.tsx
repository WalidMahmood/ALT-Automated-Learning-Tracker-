'use client'

import React, { useState } from "react"
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks'
import api from '@/lib/api'
import { loginStart, loginSuccess, loginFailure } from '@/lib/store/slices/authSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, BookOpen, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function LoginForm() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { isLoading, error } = useAppSelector((state) => state.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(loginStart())

    try {
      const response = await api.post('/users/auth/login/', {
        email,
        password,
      })

      const { user, access, refresh } = response.data
      dispatch(loginSuccess({ user, access, refresh }))

      // Redirect all roles to dashboard (content adjusts based on role)
      navigate('/dashboard')
    } catch (err: any) {
      console.error('Login error:', err)

      let errorMessage = 'An unexpected error occurred.'

      if (!err.response) {
        // Network error (server down, CORS, etc.)
        errorMessage = 'Unable to connect to the server. Please check if the backend is running.'
      } else if (err.response.status === 401 || err.response.status === 400) {
        // Validation/Auth error
        errorMessage = err.response.data.non_field_errors?.[0] ||
          err.response.data.detail ||
          'Invalid email or password.'
      } else {
        // Other server errors
        errorMessage = `Server Error (${err.response.status}). Please try again later.`
      }

      dispatch(loginFailure(errorMessage))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Title */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <BookOpen className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Automated Learning Tracker
          </h1>
          <p className="text-muted-foreground">
            Brain Station 23 Learning Management System
          </p>
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your Brain Station 23 credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@brainstation-23.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Official Access
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <p className="text-sm text-center text-muted-foreground">
                Please use your official Brain Station 23 email.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Protected by enterprise-grade security. Only @brainstation-23.com emails allowed.
        </p>
      </div>
    </div>
  )
}
