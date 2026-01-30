'use client'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Mail, Calendar } from 'lucide-react'
import type { User as UserType } from '@/lib/types'

interface UserProfileModalProps {
    user: UserType | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function UserProfileModal({ user, open, onOpenChange }: UserProfileModalProps) {
    if (!user) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>User Profile</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center py-6 border-b border-border">
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold mb-4">
                        {(user.full_name || user.name).charAt(0)}
                    </div>
                    <h2 className="text-xl font-bold">{user.full_name || user.name}</h2>
                    <div className="flex items-center gap-1 text-muted-foreground text-sm">
                        <Mail className="h-3 w-3" />
                        <span>{user.email}</span>
                    </div>
                    <Badge variant="secondary" className="mt-2 capitalize">
                        {user.role} • {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 py-6">
                    <div className="flex-1 space-y-1">
                        <Label className="text-muted-foreground flex items-center gap-1 text-xs">
                            <Calendar className="h-3 w-3" /> Experience
                        </Label>
                        <p className="font-semibold text-sm">{user.experience_years} Years</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Account Info</h3>
                    <div className="flex justify-between items-center py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Member Since</span>
                        <span className="text-sm font-medium">Jan 2026</span>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
