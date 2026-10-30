import { beforeEach, describe, expect, it, vi } from 'vitest'

const listTasks = vi.fn()
vi.mock('../lib/api', () => ({ api: { listTasks: (...a: unknown[]) => listTasks(...a) } }))

const { refreshTasks, useTasksStore } = await import('./useTasks')

const task = (id: string) => ({ id }) as never

beforeEach(() => {
  listTasks.mockReset()
  useTasksStore.setState({ tasks: [], loading: false, error: null })
})

describe('refreshTasks', () => {
  it('成功时写入任务并清掉上一次的错误', async () => {
    useTasksStore.setState({ error: '上一次失败了' })
    listTasks.mockResolvedValue([task('a'), task('b')])

    await refreshTasks()

    expect(useTasksStore.getState().tasks).toHaveLength(2)
    expect(useTasksStore.getState().error).toBeNull()
  })

  // 这条是这个 store 真正要保住的性质:轮询每 2 秒跑一次,网络抖一下就清空列表的话,
  // 用户会看到任务列表凭空消失又出现。失败只记录错误,已有数据留在原地。
  it('失败时只记录错误,【不清空已有任务】', async () => {
    useTasksStore.setState({ tasks: [task('a')] })
    listTasks.mockRejectedValue(new Error('network down'))

    await refreshTasks()

    expect(useTasksStore.getState().error).toBe('network down')
    expect(useTasksStore.getState().tasks).toHaveLength(1)
  })

  it('失败后再次成功,错误会被清掉', async () => {
    listTasks.mockRejectedValueOnce(new Error('boom'))
    await refreshTasks()
    expect(useTasksStore.getState().error).toBe('boom')

    listTasks.mockResolvedValue([task('a')])
    await refreshTasks()
    expect(useTasksStore.getState().error).toBeNull()
    expect(useTasksStore.getState().tasks).toHaveLength(1)
  })
})
