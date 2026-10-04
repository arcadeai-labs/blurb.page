import type { CSSProperties } from 'react'

export { cn } from 'cn'

type CSSVariableProperties = Record<`--${string}`, string | number | undefined>

/** Typed inline CSS custom properties, without a type assertion. */
export function cssVariables(variables: CSSVariableProperties): CSSProperties {
  return { ...variables }
}
