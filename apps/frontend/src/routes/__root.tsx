import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import '../index.css'

const queryClient = new QueryClient()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'every-ui' },
    ],
  }),
  component: RootLayout,
})

function RootLayout() {
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-svh">
            <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
                <div className="grid gap-0.5">
                  <strong className="text-sm font-medium">every-ui</strong>
                  <span className="text-xs text-muted-foreground">
                    Apps built by agents over MCP
                  </span>
                </div>
                <nav
                  aria-label="Primary navigation"
                  className="flex items-center gap-1"
                >
                  <Button variant="ghost" asChild>
                    <Link to="/" activeProps={{ 'aria-current': 'page' }}>
                      Apps
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild>
                    <a href="/api">API Docs</a>
                  </Button>
                </nav>
              </div>
              <Separator />
            </header>
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
              <Outlet />
            </div>
          </div>
          <Toaster />
          <TanStackRouterDevtools />
        </TooltipProvider>
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
