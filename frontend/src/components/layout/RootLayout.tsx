import React from "react"
import { ReduxProvider } from '@/components/providers/redux-provider'
import { Toaster } from "@/components/ui/sonner"

// Removed Next.js specific imports (Metadata, Viewport, Fonts, Analytics)
// We will handle fonts in index.css or index.html
// Metadata should be handled per page with React Helmet if needed

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ReduxProvider>
            <div className="font-sans antialiased min-h-screen bg-background text-foreground">
                {children}
                <Toaster />
            </div>
        </ReduxProvider>
    )
}
