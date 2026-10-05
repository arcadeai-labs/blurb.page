import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import type { ReactNode } from 'react'
import { Blurb } from '@/components/blurb'
import { GatewaySettings } from '@/components/gateway'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/toast'
import { meQuery } from '@/lib/api'
import { authClient } from '@/lib/auth-client'

/** The signed-in user's menu, with sign out. */
function UserMenu() {
  const me = useQuery(meQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const signOut = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut()

      if (error) {
        throw new Error(error.message ?? 'Could not sign out')
      }
    },
    onSuccess: () => {
      queryClient.clear()
      navigate({ to: '/login' })
    },
    onError: (error) =>
      toast.add({ title: 'Could not sign out', description: error.message }),
  })

  if (!me.data) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" />}>
        {me.data.email}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Signed in with Arcade</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A page under the navbar, headed by its title and description (none while it
 * loads). A `fill` page stretches its content to the bottom of the page, for
 * apps.
 */
export function Page({
  title,
  description,
  fill = false,
  children,
}: Readonly<{
  title?: string
  description?: ReactNode
  fill?: boolean
  children: ReactNode
}>) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 text-sm font-medium"
          >
            <Blurb className="size-5" />
            blurb.page
          </Link>
          <nav
            aria-label="Primary navigation"
            className="flex shrink-0 items-center gap-1"
          >
            <GatewaySettings />
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
            <UserMenu />
          </nav>
        </div>
        <Separator />
      </header>
      <main
        className={cn(
          'mx-auto w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:py-10',
          fill ? 'flex flex-1 flex-col' : 'grid',
        )}
      >
        {title === undefined ? null : (
          <div className="grid gap-1">
            <h1 className="text-xl font-medium">{title}</h1>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        )}
        {children}
      </main>
    </>
  )
}
