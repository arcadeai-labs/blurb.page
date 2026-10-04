import { defineCatalog } from '@json-render/core'
import { defineRegistry } from '@json-render/react'
import { schema } from '@json-render/react/schema'
import { shadcnComponents } from '@json-render/shadcn'
import { appComponentDefinitions } from '@template/api/ui'
import {
  Chart,
  DataTable,
  JsonView,
  Metric,
  Query,
  RowTable,
  RowTableRow,
  ScrollArea,
} from './components'

// Actions aren't registered here: AppRenderer handles them, since they need
// the app's state store and form validation.
const componentCatalog = defineCatalog(schema, {
  components: appComponentDefinitions,
  actions: {},
})

export const { registry } = defineRegistry(componentCatalog, {
  components: {
    ...shadcnComponents,
    // Vertical stacks stretch their children unless told otherwise.
    Stack: (context) =>
      shadcnComponents.Stack({
        ...context,
        props: {
          ...context.props,
          align:
            context.props.align ??
            (context.props.direction === 'horizontal' ? 'start' : 'stretch'),
        },
      }),
    Chart,
    DataTable,
    JsonView,
    Metric,
    Query,
    RowTable,
    RowTableRow,
    ScrollArea,
  },
})
