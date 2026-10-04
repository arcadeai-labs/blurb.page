import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Page } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { createDoc, listDocs } from '@/lib/mcp'

export const Route = createFileRoute('/docs/')({
  component: Docs,
})

/** `Q3 review!` → `q3-review`. */
function toSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}

function NewDocDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [name, setName] = useState<string>()
  const slug = name ?? toSlug(title)

  const create = useMutation({
    mutationFn: () => createDoc({ name: slug, title, body: '' }),
    onSuccess: async (doc) => {
      await queryClient.invalidateQueries({ queryKey: ['docs'] })
      void navigate({ to: '/docs/$name', params: { name: doc.name } })
    },
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>New doc</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="doc-title">Title</FieldLabel>
              <Input
                id="doc-title"
                value={title}
                required
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="doc-name">Name</FieldLabel>
              <Input
                id="doc-name"
                value={slug}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </FieldGroup>
          {create.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not create the doc</AlertTitle>
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Docs() {
  const [creating, setCreating] = useState(false)
  const docsQuery = useQuery({ queryKey: ['docs'], queryFn: listDocs })

  return (
    <Page
      title="Docs"
      description="Pages with live components, written by people and agents"
    >
      <div>
        <Button onClick={() => setCreating(true)}>New doc</Button>
        {creating ? <NewDocDialog onClose={() => setCreating(false)} /> : null}
      </div>

      {docsQuery.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : null}

      {docsQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load docs</AlertTitle>
          <AlertDescription>{docsQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {docsQuery.data?.docs.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No docs yet</EmptyTitle>
            <EmptyDescription>
              Create one, or ask an agent to write one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {docsQuery.data?.docs.length ? (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {docsQuery.data.docs.map((doc) => (
            <Card key={doc.id}>
              <CardHeader>
                <CardTitle>{doc.title}</CardTitle>
                <CardDescription>
                  Updated {new Date(doc.updatedAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link to="/docs/$name" params={{ name: doc.name }} />}
                >
                  Open
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      ) : null}
    </Page>
  )
}
