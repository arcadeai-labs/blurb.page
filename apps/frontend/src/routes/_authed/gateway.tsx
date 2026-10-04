import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Page } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  clearGateway,
  gatewaysQuery,
  meQuery,
  organizationsQuery,
  projectsQuery,
  setGateway,
} from '@/lib/api'
import { connectArcadeAccount } from '@/lib/auth-client'

// Where the user's tool calls go: one of the MCP gateways in their Arcade
// projects, or the default gateway.
export const Route = createFileRoute('/_authed/gateway')({
  head: () => ({ meta: [{ title: 'Gateway · blurb.page' }] }),
  component: GatewayPage,
})

function GatewayPage() {
  const me = useQuery(meQuery)

  return (
    <Page title="Gateway" description="Where your apps and agents run tools">
      {me.data ? (
        <>
          <CurrentGateway
            gateway={me.data.gateway}
            defaultUrl={me.data.defaultGatewayUrl}
          />
          {!me.data.account.available ? (
            <Alert>
              <AlertTitle>Picking a gateway isn't set up here</AlertTitle>
              <AlertDescription>
                This server has no client for Arcade's sign-in
                (ARCADE_IDENTITY_CLIENT_ID), so everyone uses the default
                gateway.
              </AlertDescription>
            </Alert>
          ) : me.data.account.connected ? (
            <GatewayPicker gateway={me.data.gateway} />
          ) : (
            <ConnectAccount />
          )}
        </>
      ) : (
        <Skeleton className="h-64" />
      )}
    </Page>
  )
}

type UserGateway = {
  organizationId: string
  projectId: string
  gatewayId: string
  name: string
  url: string
} | null

function CurrentGateway({
  gateway,
  defaultUrl,
}: Readonly<{ gateway: UserGateway; defaultUrl: string }>) {
  const queryClient = useQueryClient()
  const useDefault = useMutation({
    mutationFn: clearGateway,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{gateway ? gateway.name : 'Default gateway'}</CardTitle>
        <CardDescription>
          <code>{gateway ? gateway.url : defaultUrl}</code>
        </CardDescription>
      </CardHeader>
      {useDefault.error ? (
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Could not switch gateways</AlertTitle>
            <AlertDescription>{useDefault.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}
      {gateway ? (
        <CardFooter>
          <Button
            variant="outline"
            disabled={useDefault.isPending}
            onClick={() => useDefault.mutate()}
          >
            Use the default gateway
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}

function ConnectAccount() {
  const connect = useMutation({
    mutationFn: () => connectArcadeAccount('/gateway', '/gateway'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your Arcade account</CardTitle>
        <CardDescription>
          It lists the gateways in your Arcade projects.
        </CardDescription>
      </CardHeader>
      {connect.error ? (
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Could not connect your Arcade account</AlertTitle>
            <AlertDescription>{connect.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}
      <CardFooter>
        <Button disabled={connect.isPending} onClick={() => connect.mutate()}>
          Connect
        </Button>
      </CardFooter>
    </Card>
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

function GatewayPicker({ gateway }: Readonly<{ gateway: UserGateway }>) {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })

  const error =
    organizations.error ?? projects.error ?? gateways.error ?? save.error
  const unchanged =
    gateway?.organizationId === organizationId &&
    gateway?.projectId === projectId &&
    gateway?.gatewayId === gatewayId

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a gateway</CardTitle>
        <CardDescription>
          Only gateways that sign users in with Arcade can run tools as you.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
      <CardFooter>
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
      </CardFooter>
    </Card>
  )
}
