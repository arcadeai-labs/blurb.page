import type { Doc } from '@template/api/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { DocEditor } from '@/components/doc-editor/doc-editor'
import { Page } from '@/components/page'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { deleteDoc, getDoc, updateDoc } from '@/lib/mcp'

export const Route = createFileRoute('/docs/$name')({
  component: DocPage,
})

function DocForm({ doc }: { doc: Doc }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(doc.title)
  // Undefined until the body is edited, so an untouched doc saves as it was.
  const [body, setBody] = useState<string>()
  const dirty = title !== doc.title || body !== undefined

  const save = useMutation({
    mutationFn: () => updateDoc(doc.id, { title, body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['docs', saved.name], saved)
      void queryClient.invalidateQueries({ queryKey: ['docs'], exact: true })
      setBody(undefined)
      toast.add({ title: 'Saved', type: 'success' })
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteDoc(doc.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['docs'], exact: true })
      void navigate({ to: '/docs' })
    },
    onError: (error) =>
      toast.add({
        title: 'Could not delete the doc',
        description: error.message,
        type: 'error',
      }),
  })

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button
          disabled={!dirty || !title.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="outline" disabled={remove.isPending} />}
          >
            Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this doc?</AlertDialogTitle>
              <AlertDialogDescription>
                The scripts its components run are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => remove.mutate()}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {save.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">
            {save.error.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <DocEditor body={doc.body} onChange={setBody} />
    </>
  )
}

function DocPage() {
  const { name } = Route.useParams()
  const docQuery = useQuery({
    queryKey: ['docs', name],
    queryFn: () => getDoc(name),
  })

  if (docQuery.isPending) {
    return (
      <Page>
        <Skeleton className="h-64" />
      </Page>
    )
  }

  if (docQuery.isError) {
    return (
      <Page title={name}>
        <Alert variant="destructive">
          <AlertTitle>Could not load the doc</AlertTitle>
          <AlertDescription>{docQuery.error.message}</AlertDescription>
        </Alert>
      </Page>
    )
  }

  const doc = docQuery.data

  return (
    <Page title={doc.title}>
      {/* Edits stay local until saved, so refetches don't reset the editor. */}
      <DocForm key={doc.id} doc={doc} />
    </Page>
  )
}
