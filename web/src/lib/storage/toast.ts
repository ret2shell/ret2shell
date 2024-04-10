import { createStore } from 'solid-js/store'
import { nanoid } from 'nanoid'
import { DateTime } from 'luxon'

export type ToastMessage = {
  id?: string
  img?: string
  description: string
  level: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  reject?: () => void
  rejectLabel?: string
  accept?: () => void
  acceptLabel?: string
  createdAt?: number
  shown?: boolean
}

export const [toastStore, setToastStore] = createStore({
  toasts: [] as ToastMessage[],
})

export function addToast(toast: ToastMessage): string {
  const id = nanoid()
  setToastStore('toasts', toasts => [...toasts, { ...toast, id, createdAt: DateTime.now().toMillis(), shown: false }])
  return id
}

export function removeToast(id: string) {
  setToastStore('toasts', toasts => toasts.filter(item => item.id !== id))
}

export function clearToasts() {
  setToastStore('toasts', [])
}
