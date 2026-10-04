import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * A page under the navbar, which shows its title and description. Without a
 * title (e.g. while it loads) the navbar shows a skeleton instead.
 */
export function Page({
  title,
  description,
  children,
}: Readonly<{
  title?: string
  description?: ReactNode
  children: ReactNode
}>) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {title === undefined ? (
            <div className="grid gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          ) : (
            <div className="grid min-w-0 gap-0.5">
              <h1 className="truncate text-sm font-medium">{title}</h1>
              {description ? (
                <p className="truncate text-xs text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          )}
          <nav
            aria-label="Primary navigation"
            className="flex shrink-0 items-center gap-1"
          >
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link to="/" activeProps={{ 'aria-current': 'page' }} />}
            >
              Apps
            </Button>
            <Button
              variant="ghost"
              nativeButton={false}
              render={
                <Link to="/docs" activeProps={{ 'aria-current': 'page' }} />
              }
            >
              Docs
            </Button>
            <Button
              variant="ghost"
              nativeButton={false}
              render={<a href="/api">API Docs</a>}
            />
          </nav>
        </div>
        <Separator />
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:py-10">
        {children}
      </main>
    </>
  )
}
