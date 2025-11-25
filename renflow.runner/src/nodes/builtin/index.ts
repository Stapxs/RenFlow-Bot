import { ConsoleNode } from './ConsoleNode'
import { NoteNode } from './NoteNode'
import { SendTextNode } from './SendTextNode'
import { CustomJSNode } from './CustomJSNode'
import { IfElseNode } from './IfElseNode'
import { HtmlRenderNode } from './HtmlRenderNode'
import { HttpRequestNode } from './HttpRequestNode'
import { SendMessageNode } from './SendMessageNode'
import { CommandAnalNode } from './CommandAnalNode'
import { MergeNode } from './MergeNode'

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
