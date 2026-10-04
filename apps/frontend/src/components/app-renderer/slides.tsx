import { cn } from 'cn'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MaximizeIcon,
  MinimizeIcon,
} from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import type { PropsOf } from './components'

// Slides are laid out on a fixed canvas and scaled to fit, so they look the
// same inline and full screen. Like slides in a presentation app, they never
// scroll: the deck fills its parent, and a slide's content fits the slide.
const canvasWidth = 960
const canvasHeight = 540

/** How much to scale the canvas to fit inside `area`. */
function useFitScale(area: RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const element = area.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setScale(Math.min(width / canvasWidth, height / canvasHeight))
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return scale
}

/**
 * Shows only slide `index` on `canvas` (or the last one, if there are fewer)
 * and returns how many there are. Slides are counted from the DOM because
 * repeated children reach Slides as one element, and invisible ones render
 * nothing.
 */
function useSlides(canvas: RefObject<HTMLDivElement | null>, index: number) {
  const [count, setCount] = useState(0)

  useLayoutEffect(() => {
    const element = canvas.current
    if (!element) return

    function update(element: HTMLDivElement) {
      const slides = Array.from(element.children)
      const current = Math.min(index, slides.length - 1)

      slides.forEach((slide, position) => {
        if (slide instanceof HTMLElement) slide.hidden = position !== current
      })
      setCount(slides.length)
    }

    update(element)
    const observer = new MutationObserver(() => update(element))
    observer.observe(element, { childList: true })
    return () => observer.disconnect()
  }, [index])

  return count
}

/** Whether `element` uses arrow keys itself, so they shouldn't change slides. */
function usesArrowKeys(element: EventTarget) {
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable ||
      element.closest(
        'input, textarea, select, [role="slider"], [role="tablist"], [role="radiogroup"], [role="listbox"], [role="menu"]',
      ) !== null)
  )
}

export function Slides({ children }: PropsOf<'Slides'>) {
  // The deck fills its parent (see [data-fill] in index.css), and the slide is
  // as big as fits in what the controls leave.
  const deck = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const scale = useFitScale(area)

  const [index, setIndex] = useState(0)
  const count = useSlides(canvas, index)
  const last = Math.max(count - 1, 0)
  const current = Math.min(index, last)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    function onChange() {
      setFullscreen(
        deck.current !== null && document.fullscreenElement === deck.current,
      )
    }

    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function go(to: number) {
    setIndex(Math.max(0, Math.min(last, to)))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (usesArrowKeys(event.target)) return

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
        go(current + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        go(current - 1)
        break
      case 'Home':
        go(0)
        break
      case 'End':
        go(last)
        break
      default:
        return
    }
    event.preventDefault()
  }

  function toggleFullscreen() {
    if (fullscreen) {
      void document.exitFullscreen()
    } else {
      deck.current?.requestFullscreen().catch(() => {
        toast.add({ title: 'Could not enter full screen', type: 'error' })
      })
    }
  }

  return (
    <div
      ref={deck}
      role="region"
      aria-roledescription="carousel"
      aria-label="Slides"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the deck takes focus so arrow keys change slides
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex min-h-60 flex-col gap-2 bg-background outline-none data-[fullscreen=true]:p-4"
      data-fill
      data-fullscreen={fullscreen}
    >
      <div ref={area} className="relative min-h-0 flex-1">
        <div
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden',
            !fullscreen && 'rounded-xl border border-line',
          )}
          style={{
            width: canvasWidth * scale,
            height: canvasHeight * scale,
          }}
        >
          <div
            ref={canvas}
            className="origin-top-left"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${scale})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous slide"
          disabled={current === 0}
          onClick={() => go(current - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-12 text-center text-sm text-muted-foreground tabular-nums">
          {count === 0 ? 0 : current + 1} / {count}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next slide"
          disabled={current === last}
          onClick={() => go(current + 1)}
        >
          <ChevronRightIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
      </div>
    </div>
  )
}

/**
 * Fills the space left in its flex column and shrinks its children (never
 * grows them) until they fit, so a slide with too much on it never overflows.
 */
function ShrinkToFit({
  className,
  origin,
  children,
}: {
  className: string
  origin: string
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const boxElement = box.current
    const contentElement = content.current
    if (!boxElement || !contentElement) return

    // Layout sizes ignore transforms, so scaling doesn't change what's measured.
    function measure(boxElement: HTMLElement, contentElement: HTMLElement) {
      const available = boxElement.clientHeight
      const needed = contentElement.offsetHeight

      setScale(needed > available ? available / needed : 1)
    }

    const observer = new ResizeObserver(() =>
      measure(boxElement, contentElement),
    )
    observer.observe(boxElement)
    observer.observe(contentElement)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={box} className="min-h-0 flex-1 overflow-hidden">
      <div
        ref={content}
        className={className}
        style={
          scale < 1
            ? { transform: `scale(${scale})`, transformOrigin: origin }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  )
}

export function Slide({ props, children }: PropsOf<'Slide'>) {
  const layout = props.layout ?? 'content'

  if (layout === 'title' || layout === 'section') {
    return (
      <div className="flex size-full flex-col p-16 text-2xl">
        <ShrinkToFit
          className="flex min-h-full flex-col items-center justify-center gap-6 text-center"
          origin="top center"
        >
          {props.title ? (
            <h2
              className={cn(
                'font-semibold tracking-tight text-balance',
                layout === 'title' ? 'text-6xl' : 'text-5xl',
              )}
            >
              {props.title}
            </h2>
          ) : null}
          <div className="text-muted-foreground">{children}</div>
        </ShrinkToFit>
      </div>
    )
  }

  return (
    <div className="flex size-full flex-col gap-8 p-14 text-2xl">
      {props.title ? (
        <h2 className="text-4xl font-semibold tracking-tight">{props.title}</h2>
      ) : null}
      <ShrinkToFit
        className={
          layout === 'two-column'
            ? 'grid grid-cols-2 items-start gap-10'
            : 'flex flex-col gap-6'
        }
        origin="top left"
      >
        {children}
      </ShrinkToFit>
    </div>
  )
}
