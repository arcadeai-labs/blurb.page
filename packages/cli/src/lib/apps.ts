/** Apps that can be served behind the portless proxy, and the port each uses. */
export const APP_PORTS = {
  frontend: 5173,
  server: 8787,
}

export type AppName = keyof typeof APP_PORTS

export const APP_NAMES = Object.keys(APP_PORTS)

export function isAppName(value: string): value is AppName {
  return Object.hasOwn(APP_PORTS, value)
}
