import { WorkflowEngine } from '../workflow/index.js'
import type { WorkflowExecution } from '../workflow/types.js'

async function run() {
  const wf: WorkflowExecution = {
    id: 'wf-ifelse-default',
    name: 'IfElse Default Smoke',
    description: 'IfElse default branch execution',
    trigger: { type: 'manual', typeLabel: '手动', name: 'start', label: '开始' },
    entryNode: 'if1',
    nodes: {
      if1: {
        id: 'if1',
        type: 'ifelse',
        params: { condition: { parameter: 'input.value', mode: 'exists', value: '' } },
        next: [],
        branches: { true: 'nTrue', default: 'nDefault' }
      },
      nTrue: {
        id: 'nTrue',
        type: 'console-log',
        params: { message: 'Branch TRUE', includeInput: false },
        next: []
      },
      nDefault: {
        id: 'nDefault',
        type: 'console-log',
        params: { message: 'Branch DEFAULT', includeInput: false },
        next: []
      }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const engine = new WorkflowEngine()
  const res = await engine.execute(wf, { }, { })

  if (!res.success) {
    console.error('IfElse default test failed:', res.error)
    process.exit(1)
  }
  console.log('IfElse default test passed. Logs:', res.logs.length)
}

run().catch((e) => { console.error(e); process.exit(1) })
