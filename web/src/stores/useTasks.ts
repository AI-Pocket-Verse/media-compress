import { useEffect } from 'react'
import { create } from 'zustand'

import { api } from '../lib/api'
import type { Task } from '../lib/types'

interface TasksState {
  tasks: Task[]
  loading: boolean
  error: string | null
  setTasks: (t: Task[]) => void
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  loading: false,
  error: null,
  setTasks: (tasks) => set({ tasks }),
}))

let pollTimer: ReturnType<typeof setTimeout> | null = null
let subscribers = 0

async function pollOnce() {
  try {
    const tasks = await api.listTasks()
    useTasksStore.setState({ tasks, error: null })
  } catch (e) {
    useTasksStore.setState({ error: (e as Error).message })
  }
}

function schedule() {
  if (subscribers <= 0) return
  pollTimer = setTimeout(async () => {
    await pollOnce()
    schedule()
  }, 2000)
}

export function useTasksPolling(): void {
  useEffect(() => {
    subscribers++
    if (subscribers === 1) {
      pollOnce()
      schedule()
    }
    return () => {
      subscribers--
      if (subscribers === 0 && pollTimer) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
    }
  }, [])
}

export async function refreshTasks(): Promise<void> {
  await pollOnce()
}
