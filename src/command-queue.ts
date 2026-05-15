type QueuedTask<T> = {
  id: string
  label: string
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

type QueueState = {
  active: boolean
  pending: number
}

export type CommandQueue = ReturnType<typeof createCommandQueue>

export function createCommandQueue() {
  const queue: Array<QueuedTask<unknown>> = []
  let activeTask: QueuedTask<unknown> | null = null
  let nextId = 1

  function enqueue<T>(label: string, run: () => Promise<T>) {
    const id = `cmd_${nextId++}`
    const queuedPosition = activeTask ? queue.length + 1 : 0
    let resolveTask!: (value: T) => void
    let rejectTask!: (error: unknown) => void

    const result = new Promise<T>((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })

    queue.push({
      id,
      label,
      run: run as () => Promise<unknown>,
      resolve: resolveTask as (value: unknown) => void,
      reject: rejectTask
    })

    void drain()

    return {
      id,
      label,
      queuedPosition,
      result
    }
  }

  function getState(): QueueState {
    return {
      active: Boolean(activeTask),
      pending: queue.length
    }
  }

  async function drain() {
    if (activeTask) {
      return
    }

    const task = queue.shift()

    if (!task) {
      return
    }

    activeTask = task

    try {
      task.resolve(await task.run())
    } catch (error) {
      task.reject(error)
    } finally {
      activeTask = null
      void drain()
    }
  }

  return {
    enqueue,
    getState
  }
}
