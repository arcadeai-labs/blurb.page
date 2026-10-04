// The user's organizations, projects and MCP gateways, read from Arcade's APIs
// with their identity-provider token (the dashboard's), and the gateway they
// picked for their tool calls.
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { arcadeUrls } from './auth/arcade'
import { getDb } from './db'
import { userGateways } from './db/schema'

/** An Arcade API call failed; `status` is its HTTP status. */
export class ArcadeApiError extends Error {
  name = 'ArcadeApiError'
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function getJson<T extends z.ZodType>(
  url: string,
  accessToken: string,
  schema: T,
): Promise<z.infer<T>> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new ArcadeApiError(
      `Arcade answered ${response.status} for ${new URL(url).pathname}`,
      response.status,
    )
  }

  return schema.parse(await response.json())
}

/** The control plane wraps its lists in `{ data: { items } }`. */
const controlPlaneList = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.object({ items: z.array(item) }) })

const organizationSchema = z.object({
  organization_id: z.string(),
  name: z.string(),
  is_default: z.boolean().optional(),
})

const projectSchema = z.object({
  project_id: z.string(),
  name: z.string(),
  is_default: z.boolean().optional(),
})

const gatewaySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  slug: z.string(),
  // `arcade` gateways sign users in with Arcade (the token every-ui holds);
  // `arcade_header` ones need a project API key, `user_source` another IdP.
  auth_type: z.string(),
})

const gatewayListSchema = z.object({ items: z.array(gatewaySchema) })

/** The organizations the user belongs to. */
export async function listOrganizations(accessToken: string) {
  const { data } = await getJson(
    `${arcadeUrls.cloud}/api/v1/orgs`,
    accessToken,
    controlPlaneList(organizationSchema),
  )

  return data.items.map((org) => ({
    id: org.organization_id,
    name: org.name,
    isDefault: org.is_default ?? false,
  }))
}

/** The projects in `organizationId` the user can access. */
export async function listProjects(
  accessToken: string,
  organizationId: string,
) {
  const { data } = await getJson(
    `${arcadeUrls.cloud}/api/v1/orgs/${encodeURIComponent(organizationId)}/projects`,
    accessToken,
    controlPlaneList(projectSchema),
  )

  return data.items.map((project) => ({
    id: project.project_id,
    name: project.name,
    isDefault: project.is_default ?? false,
  }))
}

function projectApi(organizationId: string, projectId: string) {
  return `${arcadeUrls.api}/v1/orgs/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}`
}

function toGateway(gateway: z.infer<typeof gatewaySchema>) {
  return {
    id: gateway.id,
    name: gateway.name,
    description: gateway.description ?? '',
    url: `${arcadeUrls.api}/mcp/${gateway.slug}`,
    // Only gateways that sign users in with Arcade accept their token.
    usable: gateway.auth_type === 'arcade',
  }
}

/** The project's MCP gateways. */
export async function listGateways(
  accessToken: string,
  organizationId: string,
  projectId: string,
) {
  const { items } = await getJson(
    `${projectApi(organizationId, projectId)}/gateways?limit=1000`,
    accessToken,
    gatewayListSchema,
  )

  return items.map(toGateway)
}

/** One of the project's MCP gateways. */
export async function getGateway(
  accessToken: string,
  organizationId: string,
  projectId: string,
  gatewayId: string,
) {
  return toGateway(
    await getJson(
      `${projectApi(organizationId, projectId)}/gateways/${encodeURIComponent(gatewayId)}`,
      accessToken,
      gatewaySchema,
    ),
  )
}

/**
 * The gateway everyone starts on: `MCP_URL`, or else Arcade's global gateway,
 * which runs tools in the user's default project.
 */
export function defaultGatewayUrl() {
  return process.env.MCP_URL ?? `${arcadeUrls.api}/mcp/arcade`
}

/** The gateway the user picked, or `null` for the default. */
export async function userGateway(userId: string) {
  const [gateway] = await getDb()
    .select()
    .from(userGateways)
    .where(eq(userGateways.userId, userId))

  return gateway ?? null
}

/** Sends the user's tool calls to `gateway`. */
export async function setUserGateway(
  userId: string,
  gateway: {
    organizationId: string
    projectId: string
    gatewayId: string
    name: string
    url: string
  },
) {
  const values = { userId, ...gateway }

  await getDb()
    .insert(userGateways)
    .values(values)
    .onConflictDoUpdate({ target: userGateways.userId, set: values })
}

/** Sends the user's tool calls to the default gateway again. */
export async function clearUserGateway(userId: string) {
  await getDb().delete(userGateways).where(eq(userGateways.userId, userId))
}
