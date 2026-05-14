import { ConsoleNode } from './ConsoleNode.js'
import { NoteNode } from './NoteNode.js'
import { SendTextNode } from './SendTextNode.js'
import { CustomJSNode } from './CustomJSNode.js'
import { IfElseNode } from './IfElseNode.js'
import { HtmlRenderNode } from './HtmlRenderNode.js'
import { MarkdownRenderNode } from './MarkdownRenderNode.js'
import { HttpRequestNode } from './HttpRequestNode.js'
import { SendMessageNode } from './SendMessageNode.js'
import { CommandAnalNode } from './CommandAnalNode.js'
import { MergeNode } from './MergeNode.js'
import { LoopStartNode } from './LoopStartNode.js'
import { LoopEndNode } from './LoopEndNode.js'
import { LoopBreakNode } from './LoopBreakNode.js'
import { SystemInfoNode } from './SystemInfoNode.js'
import { GetLoginInfoNode } from './GetLoginInfoNode.js'
import { LlmNode } from './LlmNode.js'

/**
 * 导出所有内置节点
 */
export const builtinNodes = [
    new ConsoleNode(),
    new NoteNode(),
    new SendTextNode(),
    new SendMessageNode(),
    new HtmlRenderNode(),
    new MarkdownRenderNode(),
    new HttpRequestNode(),
    new CustomJSNode(),
    new IfElseNode(),
    new CommandAnalNode(),
    new MergeNode(),
    new LoopStartNode(),
    new LoopEndNode(),
    new LoopBreakNode(),
    new SystemInfoNode(),
    new GetLoginInfoNode(),
    new LlmNode(),
]

export {
    ConsoleNode,
    NoteNode,
    SendTextNode,
    SendMessageNode,
    HtmlRenderNode,
    MarkdownRenderNode,
    HttpRequestNode,
    CustomJSNode,
    IfElseNode,
    CommandAnalNode,
    MergeNode,
    LoopStartNode,
    LoopEndNode,
    LoopBreakNode,
    SystemInfoNode,
    GetLoginInfoNode,
    LlmNode,
}
