import type { ComponentProps } from 'react'

// A blob of a page, folded at the corner, with lines of text cut out of it.
// The same shape as `public/favicon.svg`.
const blurbPath =
  'M14.8 2.3V8.4q0 .8.8.8h6.2c.5 2.3.2 4.8-.7 6.9-1.1 2.7-2.8 5.3-5.8 5.7-2.2.3-3.9-.8-5.9-.5-2.2.3-4.7.3-6.1-1.6-1.4-1.9-.7-4.3-1-6.5-.3-2.4-.6-4.9.6-7.1 1.5-2.7 4.7-3.5 7.7-3.8 1.4-.1 2.8-.1 4.2 0Z M15.8 3.3c0-.9 1.1-1.3 1.7-.7l3.7 3.7c.6.6.2 1.7-.7 1.7h-3.7a1 1 0 0 1-1-1Z M6.6 6.7h4.6a.9.9 0 0 1 0 1.8H6.6a.9.9 0 0 1 0-1.8Z M6.6 11h10.8a.9.9 0 0 1 0 1.8H6.6a.9.9 0 0 1 0-1.8Z M6.6 15.2h6.8a.9.9 0 0 1 0 1.8H6.6a.9.9 0 0 1 0-1.8Z'

/** The blurb.page logo, in the current text color. */
export function Blurb(props: Readonly<ComponentProps<'svg'>>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path fillRule="evenodd" d={blurbPath} />
    </svg>
  )
}
