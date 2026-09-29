import { useEffect } from 'react'

export function usePageMetadata(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = meta?.content
    const descriptionMeta = meta ?? document.createElement('meta')

    document.title = title
    descriptionMeta.name = 'description'
    descriptionMeta.content = description
    if (!meta) document.head.appendChild(descriptionMeta)

    return () => {
      document.title = previousTitle
      if (previousDescription === undefined) {
        descriptionMeta.remove()
      } else {
        descriptionMeta.content = previousDescription
      }
    }
  }, [description, title])
}
