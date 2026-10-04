import { useQuery } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { getSvg } from '@/lib/mcp'
import type { PropsOf } from './components'

/** Theme colors an SVG can use as `var(--name)`. */
const themeVariables = [
  '--foreground',
  '--muted-foreground',
  '--background',
  '--muted',
  '--line',
  '--primary',
  '--primary-foreground',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
]

/**
 * `markup` as a data URL for an img, with the theme's colors (and the text
 * color, for currentColor) resolved where it's shown set on its root. An img
 * runs no scripts, loads nothing external and keeps the SVG's ids and styles
 * to itself, so stored SVGs can't affect the page.
 */
function themedSvgUrl(markup: string, style: CSSStyleDeclaration) {
  const document = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const root = document.documentElement

  if (
    !(root instanceof SVGSVGElement) ||
    document.getElementsByTagName('parsererror').length > 0
  ) {
    throw new Error('The SVG markup is invalid')
  }

  for (const name of themeVariables) {
    root.style.setProperty(name, style.getPropertyValue(name))
  }
  root.style.setProperty('color', style.color)

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    new XMLSerializer().serializeToString(root),
  )}`
}

export function Svg({ props }: PropsOf<'Svg'>) {
  const svg = useQuery({
    queryKey: ['svgs', props.name],
    queryFn: () => getSvg(props.name),
  })
  const box = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<{ src: string } | { error: string }>()
  const markup = svg.data?.markup

  // Before paint, so the image never shows without its theme colors.
  useLayoutEffect(() => {
    if (markup === undefined || !box.current) return

    try {
      setImage({ src: themedSvgUrl(markup, getComputedStyle(box.current)) })
    } catch (error) {
      setImage({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [markup])

  const error =
    svg.error?.message ?? (image && 'error' in image ? image.error : undefined)
  const height = props.height ?? undefined

  return (
    <div ref={box}>
      {error !== undefined ? (
        <Alert variant="destructive">
          <AlertTitle>Could not show {props.name}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : image && 'src' in image ? (
        <img
          src={image.src}
          alt={props.alt ?? ''}
          className="mx-auto block max-w-full"
          style={height === undefined ? { width: '100%' } : { height }}
        />
      ) : (
        <Skeleton style={{ height: height ?? 160 }} />
      )}
    </div>
  )
}
