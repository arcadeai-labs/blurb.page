import { type BaseComponentProps, useBoundProp } from '@json-render/react'
import type { customComponentDefinitions } from '@template/api/ui'
import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { Children } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import type { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Definitions = typeof customComponentDefinitions

type PropsOf<K extends keyof Definitions> = BaseComponentProps<
  z.infer<Definitions[K]['props']>
>

type Row = Record<string, unknown>

const chartColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const colorAt = (index: number) => chartColors[index % chartColors.length]

/** Script results can be anything; tables and charts only plot arrays of objects. */
function rowsOf(data: unknown): Row[] {
  return Array.isArray(data)
    ? data.filter(
        (row): row is Row =>
          typeof row === 'object' && row !== null && !Array.isArray(row),
      )
    : []
}

function ChartBody({ props }: PropsOf<'Chart'>) {
  const data = rowsOf(props.data)
  const series = props.series
  const stackId = props.stacked ? 'stack' : undefined

  if (props.type === 'pie') {
    const valueKey = series[0]?.key ?? 'value'
    const config: ChartConfig = Object.fromEntries(
      data.map((row, index) => [
        String(row[props.xKey]),
        { label: String(row[props.xKey]), color: colorAt(index) },
      ]),
    )

    return (
      <ChartContainer
        config={config}
        className="aspect-auto"
        style={{ height: props.height ?? 300 }}
      >
        <PieChart>
          <ChartTooltip
            content={<ChartTooltipContent nameKey={props.xKey} hideLabel />}
          />
          <Pie data={data} dataKey={valueKey} nameKey={props.xKey}>
            {data.map((row, index) => (
              <Cell key={String(row[props.xKey])} fill={colorAt(index)} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey={props.xKey} />} />
        </PieChart>
      </ChartContainer>
    )
  }

  const config: ChartConfig = Object.fromEntries(
    series.map((item, index) => [
      item.key,
      { label: item.label ?? item.key, color: colorAt(index) },
    ]),
  )
  const axes = [
    <CartesianGrid key="grid" vertical={false} />,
    <XAxis key="x" dataKey={props.xKey} tickLine={false} axisLine={false} />,
    <YAxis key="y" tickLine={false} axisLine={false} />,
    <ChartTooltip key="tooltip" content={<ChartTooltipContent />} />,
    <ChartLegend key="legend" content={<ChartLegendContent />} />,
  ]

  return (
    <ChartContainer
      config={config}
      className="aspect-auto"
      style={{ height: props.height ?? 300 }}
    >
      {props.type === 'line' ? (
        <LineChart data={data}>
          {axes}
          {series.map((item, index) => (
            <Line
              key={item.key}
              dataKey={item.key}
              type="monotone"
              stroke={colorAt(index)}
              dot={false}
            />
          ))}
        </LineChart>
      ) : props.type === 'area' ? (
        <AreaChart data={data}>
          {axes}
          {series.map((item, index) => (
            <Area
              key={item.key}
              dataKey={item.key}
              type="monotone"
              stackId={stackId}
              stroke={colorAt(index)}
              fill={colorAt(index)}
              fillOpacity={0.4}
            />
          ))}
        </AreaChart>
      ) : (
        <BarChart data={data}>
          {axes}
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId={stackId}
              fill={colorAt(index)}
              radius={4}
            />
          ))}
        </BarChart>
      )}
    </ChartContainer>
  )
}

export function Chart(context: PropsOf<'Chart'>) {
  const { title, description } = context.props

  return (
    <Card>
      {title || description ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent>
        <ChartBody {...context} />
      </CardContent>
    </Card>
  )
}

const trendIcons = {
  up: TrendingUpIcon,
  down: TrendingDownIcon,
  neutral: MinusIcon,
}

export function Metric({ props }: PropsOf<'Metric'>) {
  const TrendIcon = props.trend ? trendIcons[props.trend] : undefined
  const value =
    typeof props.value === 'number' ? props.value.toLocaleString() : props.value

  return (
    <Card>
      <CardHeader>
        <CardDescription>{props.label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value ?? '—'}</CardTitle>
        {props.change || TrendIcon ? (
          <CardAction>
            <Badge variant="outline">
              {TrendIcon ? <TrendIcon /> : null}
              {props.change}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      {props.description ? (
        <CardContent>
          <CardDescription>{props.description}</CardDescription>
        </CardContent>
      ) : null}
    </Card>
  )
}

/** Reads a dot path such as `author.name`. */
function valueAt(row: Row, path: string): unknown {
  let value: unknown = row

  for (const key of path.split('.')) {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }
    value = Object.getOwnPropertyDescriptor(value, key)?.value
  }

  return value
}

type ColumnFormat = NonNullable<
  z.infer<Definitions['DataTable']['props']>['columns'][number]['format']
>

function formatCell(value: unknown, format: ColumnFormat = 'text') {
  if (value === null || value === undefined) {
    return ''
  }

  const number = typeof value === 'number' ? value : Number(value)
  const date =
    typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : undefined
  const validDate = date && !Number.isNaN(date.getTime()) ? date : undefined

  switch (format) {
    case 'number':
      return Number.isNaN(number) ? String(value) : number.toLocaleString()
    case 'currency':
      return Number.isNaN(number)
        ? String(value)
        : number.toLocaleString(undefined, {
            style: 'currency',
            currency: 'USD',
          })
    case 'percent':
      return Number.isNaN(number)
        ? String(value)
        : number.toLocaleString(undefined, { style: 'percent' })
    case 'date':
      return validDate ? validDate.toLocaleDateString() : String(value)
    case 'datetime':
      return validDate ? validDate.toLocaleString() : String(value)
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'json':
      return JSON.stringify(value)
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
}

export function DataTable({ props, bindings, emit }: PropsOf<'DataTable'>) {
  const [selected, setSelected] = useBoundProp(
    props.selected ?? undefined,
    bindings?.selected,
  )
  const rows = rowsOf(props.data)
  const rowKey = props.rowKey ?? 'id'
  const selectable = Boolean(bindings?.selected)

  return (
    <Table>
      {props.caption ? <TableCaption>{props.caption}</TableCaption> : null}
      <TableHeader>
        <TableRow>
          {props.columns.map((column) => (
            <TableHead key={column.key}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={props.columns.length}>
              {props.emptyMessage ?? 'No results'}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, index) => (
            <TableRow
              key={String(row[rowKey] ?? index)}
              data-state={
                selected && selected[rowKey] === row[rowKey]
                  ? 'selected'
                  : undefined
              }
              onClick={
                selectable
                  ? () => {
                      setSelected(row)
                      emit('select')
                    }
                  : undefined
              }
            >
              {props.columns.map((column) => (
                <TableCell key={column.key}>
                  {formatCell(
                    valueAt(row, column.key),
                    column.format ?? undefined,
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

export function RowTable({ props, children }: PropsOf<'RowTable'>) {
  return (
    <Table>
      {props.caption ? <TableCaption>{props.caption}</TableCaption> : null}
      <TableHeader>
        <TableRow>
          {props.columns.map((column, index) => (
            <TableHead key={index}>{column}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  )
}

export function RowTableRow({ children }: PropsOf<'RowTableRow'>) {
  return (
    <TableRow>
      {Children.map(children, (child) => (
        <TableCell>{child}</TableCell>
      ))}
    </TableRow>
  )
}

export function JsonView({ props }: PropsOf<'JsonView'>) {
  return (
    <Card>
      {props.title ? (
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent>
        <pre className="overflow-auto text-xs">
          {JSON.stringify(props.value ?? null, null, 2)}
        </pre>
      </CardContent>
    </Card>
  )
}
