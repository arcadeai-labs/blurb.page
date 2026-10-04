import handler from '@tanstack/react-start/server-entry'
import { apiBasePath, app as api } from '@template/api'

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)

    if (pathname === apiBasePath || pathname.startsWith(`${apiBasePath}/`)) {
      return api.fetch(request, env, ctx)
    }

    return handler.fetch(request)
  },
} satisfies ExportedHandler<Env>
