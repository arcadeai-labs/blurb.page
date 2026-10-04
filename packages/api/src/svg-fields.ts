// SVG records and their fields. Browser-safe: the frontend parses `get_svg`
// results with `svgSchema`.
import { z } from 'zod'

/** Lowercase words joined by single hyphens, e.g. `runtime-diagram`. */
export const svgName = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    error: 'Name must be a slug: lowercase letters, digits and single hyphens',
  })
  .max(64)
  .describe(
    'Slug-friendly name; apps show it with { "type": "Svg", "props": { "name": "<name>" } }',
  )

export const svgDescription = z
  .string()
  .trim()
  .min(1, { error: 'Description must not be empty' })
  .describe('What the image shows')

/** Largest SVG accepted, in characters. */
export const maxSvgLength = 200_000

export const svgMarkup = z
  .string()
  .trim()
  .max(maxSvgLength, {
    error: `SVG must be at most ${maxSvgLength} characters`,
  })
  .refine((markup) => /^(<\?xml[^>]*>\s*)?<svg[\s>]/.test(markup), {
    error: 'Must be a single <svg> element (an <?xml?> prolog is allowed)',
  })
  .refine((markup) => markup.endsWith('</svg>'), {
    error: 'Must end with </svg>',
  })
  .refine(
    (markup) => /xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(markup),
    {
      error: 'The <svg> element needs xmlns="http://www.w3.org/2000/svg"',
    },
  )
  .describe(
    'A standalone SVG document: one <svg xmlns="http://www.w3.org/2000/svg" viewBox="…"> element. It is drawn as an image, so scripts, event handlers and external images or fonts do nothing. Use currentColor for the text color, and var(--foreground), var(--muted-foreground), var(--background), var(--muted), var(--line) (for lines), var(--primary) or var(--chart-1) … var(--chart-5) to match the app theme. Text uses system fonts, so set font-family="sans-serif".',
  )

/** Fields accepted when creating an SVG; updates take any subset. */
export const svgFields = {
  name: svgName,
  description: svgDescription,
  markup: svgMarkup,
}

export const svgSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  updatedAt: z.iso.datetime(),
})

export const svgSchema = svgSummarySchema.extend({
  markup: z.string(),
  createdAt: z.iso.datetime(),
})

export type SvgJson = z.infer<typeof svgSchema>
