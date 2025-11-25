import { ConsoleNode } from './ConsoleNode.js'
import { NoteNode } from './NoteNode.js'
import { SendTextNode } from './SendTextNode.js'
import { CustomJSNode } from './CustomJSNode.js'
import { IfElseNode } from './IfElseNode.js'
import { HtmlRenderNode } from './HtmlRenderNode.js'
import { HttpRequestNode } from './HttpRequestNode.js'
import { SendMessageNode } from './SendMessageNode.js'
import { CommandAnalNode } from './CommandAnalNode.js'
import { MergeNode } from './MergeNode.js'

/**
 * 导出所有内置节点
 */
export const builtinNodes = [
    new ConsoleNode(),
    new NoteNode(),
    new SendTextNode(),
    new SendMessageNode(),
    new HtmlRenderNode(),
    new HttpRequestNode(),
    new CustomJSNode(),
    new IfElseNode(),
    new CommandAnalNode(),
    new MergeNode()
]

export {
    ConsoleNode,
    NoteNode,
    SendTextNode,
    SendMessageNode,
    HtmlRenderNode,
    HttpRequestNode,
    CustomJSNode,
    IfElseNode,
    CommandAnalNode,
    MergeNode
}
