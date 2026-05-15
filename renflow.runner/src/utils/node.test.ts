import test from 'node:test'
import assert from 'node:assert/strict'

import { fillTextTemplate } from './node.js'

function createContext() {
    return {
        nodeId: 'node-current',
        nodeType: 'test',
        globalState: new Map<string, any>(),
        logger: {
            log: () => {},
            warn: () => {},
            error: () => {}
        }
    }
}

test('fillTextTemplate resolves nested paths from current input first', () => {
    const context = createContext()
    const result = fillTextTemplate(
        'index={loop.index}, item={loop.item}, user={user.profile.name}',
        {
            loop: { index: 2, item: 'alpha' },
            user: { profile: { name: 'RenFlow' } }
        },
        context as any
    )

    assert.equal(result, 'index=2, item=alpha, user=RenFlow')
})

test('fillTextTemplate falls back to global node data for legacy multi-part paths', () => {
    const context = createContext()
    context.globalState.set('node-1', {
        result: {
            title: 'done'
        }
    })

    const result = fillTextTemplate(
        'status={node-1.result.title}',
        {
            loop: { index: 1 }
        },
        context as any
    )

    assert.equal(result, 'status=done')
})

test('fillTextTemplate prefers current input when both input and global paths exist', () => {
    const context = createContext()
    context.globalState.set('loop', {
        index: 99
    })

    const result = fillTextTemplate(
        'index={loop.index}',
        {
            loop: { index: 3 }
        },
        context as any
    )

    assert.equal(result, 'index=3')
})
