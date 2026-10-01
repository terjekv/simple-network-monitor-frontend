import { useEffect, useRef } from 'react'

export function useDialog() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const siblings = [...(dialog.parentElement?.children ?? [])].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== dialog,
    )
    const inert = siblings.map((element) => element.inert)
    siblings.forEach((element) => {
      element.inert = true
    })
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((element) => !element.hidden)
    ;(focusable()[0] ?? dialog).focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusable()
      const index = items.indexOf(document.activeElement as HTMLElement)
      if (!items.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      if (event.shiftKey && index <= 0) {
        event.preventDefault()
        items[items.length - 1].focus()
      } else if (!event.shiftKey && (index < 0 || index === items.length - 1)) {
        event.preventDefault()
        items[0].focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      siblings.forEach((element, index) => {
        element.inert = inert[index]
      })
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return ref
}
