import { WorkflowEngine } from '../workflow/index.js'
import type { WorkflowExecution } from '../workflow/types.js'

async function run() {
  const workflow: WorkflowExecution = {
    id: 'wf-smoke',
    name: 'Smoke Test',
    description: 'Minimal engine execution',
    trigger: { type: 'manual', typeLabel: '手动', name: 'start', label: '开始', params: {} },
    entryNode: 'n1',
    nodes: {
      n1: {
        id: 'n1',
        type: 'console-log',
        params: { message: 'Hello, RenFlow', logLevel: 'log', includeInput: false },
        next: []
      }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  const engine = new WorkflowEngine()
  const result = await engine.execute(workflow, { ping: true }, { minDelay: 0 })

  if (!result.success) {
    console.error('Smoke test failed:', result.error)
    process.exit(1)
  }

  console.log('Smoke test passed. Logs:', result.logs.length)
}

run().catch((e) => { console.error(e); process.exit(1) })

