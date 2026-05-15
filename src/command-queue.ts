type QueuedTask<T> = {
  id: string
  label: string
  queueKey: string
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

type QueueOptions = {
  queueKey?: string
}

type QueueState = {
  active: boolean
  pending: number
}

export type CommandQueue = ReturnType<typeof createCommandQueue>

export function createCommandQueue() {
  const queues = new Map<string, Array<QueuedTask<unknown>>>()
  const activeTasks = new Map<string, QueuedTask<unknown>>()
  let nextId = 1

  function enqueue<T>(label: string, run: () => Promise<T>, options: QueueOptions = {}) {
    const id = `cmd_${nextId++}`
    const queueKey = normalizeQueueKey(options.queueKey)
    const queue = getQueue(queueKey)
    const queuedPosition = activeTasks.has(queueKey) ? queue.length + 1 : 0
    let resolveTask!: (value: T) => void
    let rejectTask!: (error: unknown) => void

    const result = new Promise<T>((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })

    queue.push({
      id,
      label,
      queueKey,
      run: run as () => Promise<unknown>,
      resolve: resolveTask as (value: unknown) => void,
      reject: rejectTask
    })

    void drain(queueKey)

    return {
      id,
      label,
      queueKey,
      queuedPosition,
      result
    }
  }

  function getState(): QueueState {
    return {
      active: activeTasks.size > 0,
      pending: Array.from(queues.values()).reduce((total, queue) => total + queue.length, 0)
    }
  }

  async function drain(queueKey: string) {
    if (activeTasks.has(queueKey)) {
      return
    }

    const queue = getQueue(queueKey)
    const task = queue.shift()

    if (!task) {
      queues.delete(queueKey)
      return
    }

    activeTasks.set(queueKey, task)

    try {
      task.resolve(await task.run())
    } catch (error) {
      task.reject(error)
    } finally {
      activeTasks.delete(queueKey)
      void drain(queueKey)
    }
  }

  function getQueue(queueKey: string) {
    const existingQueue = queues.get(queueKey)

    if (existingQueue) {
      return existingQueue
    }

    const queue: Array<QueuedTask<unknown>> = []
    queues.set(queueKey, queue)
    return queue
  }

  return {
    enqueue,
    getState
  }
}

function normalizeQueueKey(queueKey: string | undefined) {
  const normalizedQueueKey = String(queueKey || '').trim()

  return normalizedQueueKey || 'default'
}
