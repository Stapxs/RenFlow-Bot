import test from 'node:test'
import assert from 'node:assert/strict'

import { WorkflowConverter } from './converter.js'
import { WorkflowEngine } from './engine.js'
import type { WorkflowExecution, VueFlowWorkflow } from './types.js'

function createExecution(nodes: WorkflowExecution['nodes']): WorkflowExecution {
    return {
        id: 'wf-loop',
        name: 'loop workflow',
        description: '',
        trigger: {
            type: 'manual',
            typeLabel: 'manual',
            name: 'manual',
            label: 'manual',
            params: {}
        },
        entryNode: 'loop-start-1',
        nodes,
        createdAt: Date.now(),
        updatedAt: Date.now()
    }
}

async function runExecution(execution: WorkflowExecution) {
    const engine = new WorkflowEngine()
    const completed = new Map<string, any>()
    const result = await engine.execute(execution, { items: [1, 2, 3], map: { a: 1, b: 2 } }, {
        minDelay: 0,
        callback: {
            onNodeComplete(nodeId, nodeResult) {
                completed.set(nodeId, nodeResult.output)
            }
        }
    })
    return { result, completed }
}

test('WorkflowEngine executes count loop and collects results', async () => {
    const execution = createExecution({
        'loop-start-1': {
            id: 'loop-start-1',
            type: 'loop-start',
            params: { mode: 'count', count: '3', resultMode: 'collect' },
            next: ['body-1'],
            loopRole: 'start',
            loopPairId: 'loop-end-1',
            loopBodyEntry: 'body-1'
        },
        'body-1': {
            id: 'body-1',
            type: 'custom-js',
            params: { code: 'return { index: input.loop.index, item: input.loop.item, first: input.loop.isFirst, last: input.loop.isLast }' },
            next: ['loop-end-1']
        },
        'loop-end-1': {
            id: 'loop-end-1',
            type: 'loop-end',
            params: {},
            next: ['after-1'],
            expectedInputs: 1,
            loopRole: 'end',
            loopPairId: 'loop-start-1',
            loopExitNext: 'after-1'
        },
        'after-1': {
            id: 'after-1',
            type: 'custom-js',
            params: { code: 'return input' },
            next: []
        }
    })

    const { result, completed } = await runExecution(execution)
    assert.equal(result.success, true)
    assert.deepEqual(completed.get('after-1').data.loopSummary, {
        mode: 'count',
        completed: 3,
        total: 3,
        broken: false
    })
    assert.equal(completed.get('after-1').data.results.length, 3)
    assert.deepEqual(completed.get('after-1').data.result.data, {
        index: 2,
        item: 2,
        first: false,
        last: true
    })
})

test('WorkflowEngine executes iterate loop for arrays and last result mode', async () => {
    const execution = createExecution({
        'loop-start-1': {
            id: 'loop-start-1',
            type: 'loop-start',
            params: { mode: 'iterate', source: 'input.items', resultMode: 'last' },
            next: ['body-1'],
            loopRole: 'start',
            loopPairId: 'loop-end-1',
            loopBodyEntry: 'body-1'
        },
        'body-1': {
            id: 'body-1',
            type: 'custom-js',
            params: { code: 'return { item: input.loop.item, iteration: input.loop.iteration }' },
            next: ['loop-end-1']
        },
        'loop-end-1': {
            id: 'loop-end-1',
            type: 'loop-end',
            params: {},
            next: ['after-1'],
            expectedInputs: 1,
            loopRole: 'end',
            loopPairId: 'loop-start-1',
            loopExitNext: 'after-1'
        },
        'after-1': {
            id: 'after-1',
            type: 'custom-js',
            params: { code: 'return input' },
            next: []
        }
    })

    const { completed } = await runExecution(execution)
    assert.deepEqual(completed.get('after-1').data.results, [])
    assert.deepEqual(completed.get('after-1').data.result.data, {
        item: 3,
        iteration: 3
    })
})

test('WorkflowEngine executes iterate loop for objects', async () => {
    const execution = createExecution({
        'loop-start-1': {
            id: 'loop-start-1',
            type: 'loop-start',
            params: { mode: 'iterate', source: 'input.map', resultMode: 'collect' },
            next: ['body-1'],
            loopRole: 'start',
            loopPairId: 'loop-end-1',
            loopBodyEntry: 'body-1'
        },
        'body-1': {
            id: 'body-1',
            type: 'custom-js',
            params: { code: 'return { key: input.loop.key, value: input.loop.value }' },
            next: ['loop-end-1']
        },
        'loop-end-1': {
            id: 'loop-end-1',
            type: 'loop-end',
            params: {},
            next: ['after-1'],
            expectedInputs: 1,
            loopRole: 'end',
            loopPairId: 'loop-start-1',
            loopExitNext: 'after-1'
        },
        'after-1': {
            id: 'after-1',
            type: 'custom-js',
            params: { code: 'return input' },
            next: []
        }
    })

    const { completed } = await runExecution(execution)
    assert.deepEqual(
        completed.get('after-1').data.results.map((item: any) => item.data),
        [
            { key: 'a', value: 1 },
            { key: 'b', value: 2 }
        ]
    )
})

test('WorkflowEngine skips loop body when count is zero', async () => {
    const execution = createExecution({
        'loop-start-1': {
            id: 'loop-start-1',
            type: 'loop-start',
            params: { mode: 'count', count: '0', resultMode: 'collect' },
            next: ['body-1'],
            loopRole: 'start',
            loopPairId: 'loop-end-1',
            loopBodyEntry: 'body-1'
        },
        'body-1': {
            id: 'body-1',
            type: 'custom-js',
            params: { code: 'return { shouldNotRun: true }' },
            next: ['loop-end-1']
        },
        'loop-end-1': {
            id: 'loop-end-1',
            type: 'loop-end',
            params: {},
            next: ['after-1'],
            expectedInputs: 1,
            loopRole: 'end',
            loopPairId: 'loop-start-1',
            loopExitNext: 'after-1'
        },
        'after-1': {
            id: 'after-1',
            type: 'custom-js',
            params: { code: 'return input' },
            next: []
        }
    })

    const { completed } = await runExecution(execution)
    assert.equal(completed.has('body-1'), false)
    assert.deepEqual(completed.get('after-1').data.loopSummary, {
        mode: 'count',
        completed: 0,
        total: 0,
        broken: false
    })
})

test('WorkflowEngine supports loop-break on nearest loop', async () => {
    const execution = createExecution({
        'loop-start-outer': {
            id: 'loop-start-outer',
            type: 'loop-start',
            params: { mode: 'count', count: '2', resultMode: 'collect' },
            next: ['loop-start-inner'],
            loopRole: 'start',
            loopPairId: 'loop-end-outer',
            loopBodyEntry: 'loop-start-inner'
        },
        'loop-start-inner': {
            id: 'loop-start-inner',
            type: 'loop-start',
            params: { mode: 'count', count: '3', resultMode: 'collect' },
            next: ['if-break'],
            loopRole: 'start',
            loopPairId: 'loop-end-inner',
            loopBodyEntry: 'if-break'
        },
        'if-break': {
            id: 'if-break',
            type: 'ifelse',
            params: {
                condition: {
                    parameter: 'input.loop.index',
                    mode: 'equals',
                    value: 1
                }
            },
            next: [],
            branches: {
                true: 'break-inner',
                false: 'inner-body'
            }
        },
        'break-inner': {
            id: 'break-inner',
            type: 'loop-break',
            params: {},
            next: [],
            loopRole: 'break'
        },
        'inner-body': {
            id: 'inner-body',
            type: 'custom-js',
            params: { code: 'return { innerIndex: input.loop.index }' },
            next: ['loop-end-inner']
        },
        'loop-end-inner': {
            id: 'loop-end-inner',
            type: 'loop-end',
            params: {},
            next: ['loop-end-outer'],
            expectedInputs: 1,
            loopRole: 'end',
            loopPairId: 'loop-start-inner',
            loopExitNext: 'loop-end-outer'
        },
        'loop-end-outer': {
            id: 'loop-end-outer',
            type: 'loop-end',
            params: {},
            next: ['after-1'],
            expectedInputs: 1,
            loopRole: 'end',
            loopPairId: 'loop-start-outer',
            loopExitNext: 'after-1'
        },
        'after-1': {
            id: 'after-1',
            type: 'custom-js',
            params: { code: 'return input' },
            next: []
        }
    })

    const { completed } = await runExecution(execution)
    const inner = completed.get('loop-end-inner')
        || completed.get('after-1')?.data?.result
    assert.ok(inner)
    assert.equal(inner.loopSummary.broken, true)
    assert.equal(inner.loopSummary.completed, 2)
    assert.equal(inner.loopSummary.total, 3)
})

test('WorkflowConverter validates loop structure rules', () => {
    const converter = new WorkflowConverter()
    const invalid = createExecution({
        'loop-start-1': {
            id: 'loop-start-1',
            type: 'loop-start',
            params: { mode: 'count', count: '-1', resultMode: 'collect' },
            next: ['loop-end-1'],
            loopRole: 'start',
            loopPairId: 'loop-end-1',
            loopBodyEntry: 'loop-end-1'
        },
        'loop-end-1': {
            id: 'loop-end-1',
            type: 'loop-end',
            params: {},
            next: [],
            expectedInputs: 1,
            loopRole: 'end',
            loopPairId: 'loop-start-1',
            loopExitNext: null
        },
        'break-1': {
            id: 'break-1',
            type: 'loop-break',
            params: {},
            next: [],
            loopRole: 'break'
        }
    })

    const validation = converter.validate(invalid)
    assert.equal(validation.valid, false)
    assert.match(validation.errors.join('\n'), /count 必须是大于等于 0/)
    assert.match(validation.errors.join('\n'), /不允许普通直连/)
    assert.match(validation.errors.join('\n'), /跳出节点 break-1 不能位于循环外/)
})

test('WorkflowConverter converts loop pair metadata from VueFlow edges', () => {
    const converter = new WorkflowConverter()
    const workflow: VueFlowWorkflow = {
        id: 'wf-convert',
        name: 'convert',
        description: '',
        triggerType: 'manual',
        triggerTypeLabel: 'manual',
        triggerName: 'manual',
        triggerLabel: 'manual',
        startParams: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nodes: [
            {
                id: 'node-trigger',
                type: 'trigger',
                position: { x: 0, y: 0 },
                data: { triggerName: 'manual' }
            },
            {
                id: 'start-1',
                type: 'base',
                position: { x: 10, y: 10 },
                data: { nodeType: 'loop-start', params: { mode: 'count', count: '1' } }
            },
            {
                id: 'body-1',
                type: 'base',
                position: { x: 20, y: 10 },
                data: { nodeType: 'custom-js', params: { code: 'return input' } }
            },
            {
                id: 'end-1',
                type: 'base',
                position: { x: 30, y: 10 },
                data: { nodeType: 'loop-end', params: {} }
            }
        ],
        edges: [
            { id: 'e1', source: 'node-trigger', target: 'start-1' },
            { id: 'e2', source: 'start-1', target: 'body-1' },
            { id: 'e3', source: 'body-1', target: 'end-1' },
            { id: 'e4', source: 'start-1', target: 'end-1', data: { kind: 'loop-pair' } }
        ]
    }

    const execution = converter.convert(workflow)
    assert.equal(execution.nodes['start-1'].loopRole, 'start')
    assert.equal(execution.nodes['start-1'].loopPairId, 'end-1')
    assert.equal(execution.nodes['start-1'].loopBodyEntry, 'body-1')
    assert.equal(execution.nodes['end-1'].loopRole, 'end')
    assert.equal(execution.nodes['end-1'].loopPairId, 'start-1')
})
