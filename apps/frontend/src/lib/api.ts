import type { AppType } from '@template/api'
import { queryOptions } from '@tanstack/react-query'
import { hc } from 'hono/client'

// The Hono API (`packages/api`), served by this server at `/api`.
export const api = hc<AppType>('/api')

/** The API answered 401: nobody is signed in. */
export class SignedOutError extends Error {
  name = 'SignedOutError'
}

/** The signed-in user. Fails with {@link SignedOutError} when signed out. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async () => {
    const response = await api.me.$get()

    if (response.status === 401) {
      throw new SignedOutError('Sign in with Arcade first')
    }
    if (!response.ok) {
      throw new Error('Could not load the signed-in user')
    }

    return response.json()
  },
  retry: (count, error) => !(error instanceof SignedOutError) && count < 3,
})

/** The `error` a failed API response explains itself with, or `fallback`. */
async function errorMessage(
  response: { json(): Promise<unknown> },
  fallback: string,
) {
  const body: unknown = await response.json().catch(() => null)

  return body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string'
    ? body.error
    : fallback
}

/** The user's Arcade organizations (needs their Arcade account connected). */
export const organizationsQuery = queryOptions({
  queryKey: ['organizations'],
  queryFn: async () => {
    const response = await api.organizations.$get()

    if (!response.ok) {
      throw new Error(
        await errorMessage(response, 'Could not load your organizations'),
      )
    }

    return response.json()
  },
})

/** The projects the user can access in an organization. */
export const projectsQuery = (organizationId: string) =>
  queryOptions({
    queryKey: ['organizations', organizationId, 'projects'],
    queryFn: async () => {
      const response = await api.organizations[':organizationId'].projects.$get(
        { param: { organizationId } },
      )

      if (!response.ok) {
        throw new Error(
          await errorMessage(response, 'Could not load the projects'),
        )
      }

      return response.json()
    },
  })

/** A project's MCP gateways. */
export const gatewaysQuery = (organizationId: string, projectId: string) =>
  queryOptions({
    queryKey: [
      'organizations',
      organizationId,
      'projects',
      projectId,
      'gateways',
    ],
    queryFn: async () => {
      const response = await api.organizations[':organizationId'].projects[
        ':projectId'
      ].gateways.$get({ param: { organizationId, projectId } })

      if (!response.ok) {
        throw new Error(
          await errorMessage(response, 'Could not load the gateways'),
        )
      }

      return response.json()
    },
  })

/** Sends the user's tool calls to one of their gateways. */
export async function setGateway(choice: {
  organizationId: string
  projectId: string
  gatewayId: string
}) {
  const response = await api.me.gateway.$put({ json: choice })

  if (!response.ok) {
    throw new Error(await errorMessage(response, 'Could not save the gateway'))
  }

  return response.json()
}

/** Sends the user's tool calls to the default gateway again. */
export async function clearGateway() {
  const response = await api.me.gateway.$delete()

  if (!response.ok) {
    throw new Error(
      await errorMessage(response, 'Could not switch to the default gateway'),
    )
  }
}

/**
 * Prefix of the toolkit queries, which change with the user's gateway (whether
 * it has each tool).
 */
export const toolkitsQueryKey = ['toolkits']

/** The toolkits and MCP servers each app's scripts call tools from. */
export const appToolkitsQuery = queryOptions({
  queryKey: [...toolkitsQueryKey, 'apps'],
  queryFn: async () => {
    const response = await api.apps.toolkits.$get()

    if (!response.ok) {
      throw new Error(
        await errorMessage(response, "Could not load the apps' toolkits"),
      )
    }

    return response.json()
  },
})

/** Every script, most recently updated first. */
export const scriptsQuery = queryOptions({
  queryKey: ['scripts'],
  queryFn: async () => {
    const response = await api.scripts.$get()

    if (!response.ok) {
      throw new Error(await errorMessage(response, 'Could not load scripts'))
    }

    return response.json()
  },
})

/** One script, with its source and schemas. */
export const scriptQuery = (id: string) =>
  queryOptions({
    queryKey: ['scripts', id],
    queryFn: async () => {
      const response = await api.scripts[':id'].$get({ param: { id } })

      if (!response.ok) {
        throw new Error(
          await errorMessage(response, 'Could not load the script'),
        )
      }

      return response.json()
    },
  })

/** The toolkits and MCP servers each script calls tools from. */
export const scriptToolkitsQuery = queryOptions({
  queryKey: [...toolkitsQueryKey, 'scripts'],
  queryFn: async () => {
    const response = await api.scripts.toolkits.$get()

    if (!response.ok) {
      throw new Error(
        await errorMessage(response, "Could not load the scripts' toolkits"),
      )
    }

    return response.json()
  },
})
