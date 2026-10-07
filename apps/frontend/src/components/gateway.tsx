import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import {
  clearGateway,
  gatewaysQuery,
  gatewayToolsQuery,
  meQuery,
  organizationsQuery,
  projectsQuery,
  setGateway,
} from '@/lib/api'
import { connectArcadeAccount } from '@/lib/auth-client'

type UserGateway = {
  organizationId: string
  projectId: string
  gatewayId: string
  name: string
  url: string
} | null

/**
 * Where the user's tool calls go: one of the MCP gateways in their Arcade
 * projects, or the default gateway. A navbar button that changes it in a
 * dialog. Hidden without a client for Arcade's sign-in
 * (ARCADE_IDENTITY_CLIENT_ID): then everyone uses the default gateway.
 */
export function GatewaySettings() {
  const me = useQuery(meQuery)
  const [open, setOpen] = useState(false)

  if (!me.data?.account.available) {
    return null
  }

  const { gateway, defaultGatewayUrl, account } = me.data

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" title={gateway?.url ?? defaultGatewayUrl} />
        }
      >
        Gateway: {gateway ? gateway.name : 'Default'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gateway</DialogTitle>
          <DialogDescription>
            Where your apps and agents run tools. Only gateways that sign users
            in with Arcade can run tools as you.
          </DialogDescription>
        </DialogHeader>
        {account.connected ? (
          <GatewayPicker gateway={gateway} onDone={() => setOpen(false)} />
        ) : (
          <ConnectAccount gateway={gateway} onDone={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function UseDefaultGateway({ onDone }: Readonly<{ onDone: () => void }>) {
  const queryClient = useQueryClient()
  const useDefault = useMutation({
    mutationFn: clearGateway,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        // Whether the tools apps and scripts need are on the gateway changes with it.
        queryClient.invalidateQueries({ queryKey: gatewayToolsQuery.queryKey }),
      ])
      onDone()
    },
    onError: (error) =>
      toast.add({
        title: 'Could not switch gateways',
        description: error.message,
        type: 'error',
      }),
  })

  return (
    <Button
      variant="outline"
      disabled={useDefault.isPending}
      onClick={() => useDefault.mutate()}
    >
      Use the default gateway
    </Button>
  )
}

function ConnectAccount({
  gateway,
  onDone,
}: Readonly<{ gateway: UserGateway; onDone: () => void }>) {
  const connect = useMutation({
    mutationFn: () => connectArcadeAccount('/', '/'),
  })

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Connect your Arcade account to list the gateways in your projects.
      </p>
      {connect.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not connect your Arcade account</AlertTitle>
          <AlertDescription>{connect.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        {gateway ? <UseDefaultGateway onDone={onDone} /> : null}
        <Button disabled={connect.isPending} onClick={() => connect.mutate()}>
          Connect
        </Button>
      </DialogFooter>
    </>
  )
}

/** A Select over `options`, which shows their names. */
function OptionSelect({
  label,
  placeholder,
  value,
  options,
  disabled,
  onChange,
}: Readonly<{
  label: string
  placeholder: string
  value: string | null
  options: { id: string; name: string; disabled?: boolean }[]
  disabled?: boolean
  onChange: (value: string) => void
}>) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        disabled={disabled}
        items={options.map((option) => ({
          value: option.id,
          label: option.name,
        }))}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            onChange(next)
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id}
              disabled={option.disabled}
            >
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function GatewayPicker({
  gateway,
  onDone,
}: Readonly<{ gateway: UserGateway; onDone: () => void }>) {
  const queryClient = useQueryClient()
  const [organizationId, setOrganizationId] = useState(
    gateway?.organizationId ?? null,
  )
  const [projectId, setProjectId] = useState(gateway?.projectId ?? null)
  const [gatewayId, setGatewayId] = useState(gateway?.gatewayId ?? null)

  const organizations = useQuery(organizationsQuery)
  const projects = useQuery({
    ...projectsQuery(organizationId ?? ''),
    enabled: organizationId !== null,
  })
  const gateways = useQuery({
    ...gatewaysQuery(organizationId ?? '', projectId ?? ''),
    enabled: organizationId !== null && projectId !== null,
  })

  const save = useMutation({
    mutationFn: setGateway,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        // Whether the tools apps and scripts need are on the gateway changes with it.
        queryClient.invalidateQueries({ queryKey: gatewayToolsQuery.queryKey }),
      ])
      onDone()
    },
  })

  const error =
    organizations.error ?? projects.error ?? gateways.error ?? save.error
  const unchanged =
    gateway?.organizationId === organizationId &&
    gateway?.projectId === projectId &&
    gateway?.gatewayId === gatewayId

  return (
    <>
      <FieldGroup>
        {organizations.isPending ? (
          <Skeleton className="h-8" />
        ) : (
          <OptionSelect
            label="Organization"
            placeholder="Choose an organization"
            value={organizationId}
            options={organizations.data ?? []}
            onChange={(id) => {
              setOrganizationId(id)
              setProjectId(null)
              setGatewayId(null)
            }}
          />
        )}
        <OptionSelect
          label="Project"
          placeholder={
            projects.isFetching ? 'Loading projects…' : 'Choose a project'
          }
          value={projectId}
          options={projects.data ?? []}
          disabled={!projects.data}
          onChange={(id) => {
            setProjectId(id)
            setGatewayId(null)
          }}
        />
        <OptionSelect
          label="Gateway"
          placeholder={
            gateways.isFetching
              ? 'Loading gateways…'
              : gateways.data?.length === 0
                ? 'This project has no gateways'
                : 'Choose a gateway'
          }
          value={gatewayId}
          options={(gateways.data ?? []).map((option) => ({
            id: option.id,
            name: option.usable
              ? option.name
              : `${option.name} (needs an API key)`,
            disabled: !option.usable,
          }))}
          disabled={!gateways.data?.length}
          onChange={setGatewayId}
        />
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        {gateway ? <UseDefaultGateway onDone={onDone} /> : null}
        <Button
          disabled={
            !organizationId ||
            !projectId ||
            !gatewayId ||
            unchanged ||
            save.isPending
          }
          onClick={() => {
            if (organizationId && projectId && gatewayId) {
              save.mutate({ organizationId, projectId, gatewayId })
            }
          }}
        >
          Use this gateway
        </Button>
      </DialogFooter>
    </>
  )
}
