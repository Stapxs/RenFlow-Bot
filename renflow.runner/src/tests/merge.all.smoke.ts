import { WorkflowEngine } from '../workflow/index.js'
import type { WorkflowExecution } from '../workflow/types.js'

async function run() {
  const wf: WorkflowExecution = {
    id: 'wf-merge-all',
    name: 'Merge ALL Smoke',
    description: 'Merge ALL waits for multiple inputs',
    trigger: { type: 'manual', typeLabel: '手动', name: 'start', label: '开始' },
    entryNode: 'start',
    nodes: {
      start: { id: 'start', type: 'console-log', params: { message: 'Start' }, next: ['a', 'b'] },
      a: { id: 'a', type: 'custom-js', params: { code: 'return { a: 1 }' }, next: ['m'] },
      b: { id: 'b', type: 'custom-js', params: { code: 'return { b: 2 }' }, next: ['m'] },
      m: { id: 'm', type: 'merge', params: { mode: 'ALL', timeout: 0 }, next: ['out'], expectedInputs: 2 },
      out: { id: 'out', type: 'console-log', params: { message: '{m.inputs.0.a}-{m.inputs.1.b}' }, next: [] }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const engine = new WorkflowEngine()
  const res = await engine.execute(wf, {}, { minDelay: 0 })
  if (!res.success) {
    console.error('Merge ALL test failed:', res.error)
    process.exit(1)
  }
  console.log('Merge ALL test passed. Logs:', res.logs.length)
}

run().catch((e) => { console.error(e); process.exit(1) })

