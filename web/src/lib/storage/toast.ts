import { createStore } from 'solid-js/store'
import { nanoid } from 'nanoid'

export const [toastStore, setToastStore] = createStore({
  toasts: [] as {
    id: string
    description: string
    level: 'info' | 'success' | 'warning' | 'error'
    duration?: number
    reject?: () => void
    rejectLabel?: string
    accept?: () => void
    acceptLabel?: string
  }[],
})

export function addToast(toast: {
  description: string
  level: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  reject?: () => void
  rejectLabel?: string
  accept?: () => void
  acceptLabel?: string
}): string {
  const id = nanoid()
  setToastStore('toasts', toasts => [...toasts, { id, ...toast }])
  return id
}

export function removeToast(id: string) {
  setToastStore('toasts', toasts => toasts.filter(item => item.id !== id))
}

export function clearToasts() {
  setToastStore('toasts', [])
}
