import assert from 'node:assert/strict'
import test from 'node:test'

import { createCommandQueue } from '../src/command-queue'

test('command queue runs tasks one at a time in order', async () => {
  const commandQueue = createCommandQueue()
  const events: string[] = []
  let finishFirst!: () => void

  const firstFinished = new Promise<void>(resolve => {
    finishFirst = resolve
  })

  const first = commandQueue.enqueue('first', async () => {
    events.push('first:start')
    await firstFinished
    events.push('first:end')
    return 'first result'
  })

  const second = commandQueue.enqueue('second', async () => {
    events.push('second:start')
    return 'second result'
  })

  assert.equal(first.queuedPosition, 0)
  assert.equal(second.queuedPosition, 1)
  assert.deepEqual(events, ['first:start'])

  finishFirst()

  assert.equal(await first.result, 'first result')
  assert.equal(await second.result, 'second result')
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start'])
  assert.deepEqual(commandQueue.getState(), {
    active: false,
    pending: 0
  })
})

test('command queue runs different queue keys in parallel', async () => {
  const commandQueue = createCommandQueue()
  const events: string[] = []
  let finishFirst!: () => void

  const firstFinished = new Promise<void>(resolve => {
    finishFirst = resolve
  })

  const first = commandQueue.enqueue('first', async () => {
    events.push('first:start')
    await firstFinished
    events.push('first:end')
    return 'first result'
  }, {
    queueKey: 'workspace-a'
  })

  const second = commandQueue.enqueue('second', async () => {
    events.push('second:start')
    return 'second result'
  }, {
    queueKey: 'workspace-b'
  })

  assert.equal(first.queuedPosition, 0)
  assert.equal(second.queuedPosition, 0)
  assert.deepEqual(events, ['first:start', 'second:start'])
  assert.equal(await second.result, 'second result')

  finishFirst()

  assert.equal(await first.result, 'first result')
  assert.deepEqual(events, ['first:start', 'second:start', 'first:end'])
})

test('command queue keeps matching queue keys serialized', async () => {
  const commandQueue = createCommandQueue()
  const events: string[] = []
  let finishFirst!: () => void

  const firstFinished = new Promise<void>(resolve => {
    finishFirst = resolve
  })

  const first = commandQueue.enqueue('first', async () => {
    events.push('first:start')
    await firstFinished
    events.push('first:end')
    return 'first result'
  }, {
    queueKey: 'workspace-a'
  })

  const second = commandQueue.enqueue('second', async () => {
    events.push('second:start')
    return 'second result'
  }, {
    queueKey: 'workspace-a'
  })

  assert.equal(first.queuedPosition, 0)
  assert.equal(second.queuedPosition, 1)
  assert.deepEqual(events, ['first:start'])

  finishFirst()

  assert.equal(await first.result, 'first result')
  assert.equal(await second.result, 'second result')
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start'])
})
