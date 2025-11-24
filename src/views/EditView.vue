<template>
    <div class="edit-view" @drop="onDrop">
        <!-- 工具栏 -->
        <div class="toolbar">
            <button class="toolbar-btn save-btn" @click="saveWorkflow">
                <font-awesome-icon :icon="['fas', 'fa-floppy-disk']" />
                保存
            </button>
            <button class="toolbar-btn" title="撤销 (Ctrl+Z)"
                :disabled="!canUndo"
                @click="undo">
                <font-awesome-icon :icon="['fas', 'fa-rotate-left']" />
                撤销
            </button>
            <button class="toolbar-btn" title="重做 (Ctrl+Shift+Z)"
                :disabled="!canRedo"
                @click="redo">
                <font-awesome-icon :icon="['fas', 'fa-rotate-right']" />
                重做
            </button>
            <button class="toolbar-btn execute-btn" @click="executeWorkflow">
                <font-awesome-icon :icon="['fas', workflowEnabled ? 'fa-toggle-on' : 'fa-toggle-off']" />
                {{ workflowEnabled ? '禁用工作流' : '启用工作流' }}
            </button>
        </div>

        <VueFlow v-model:nodes="nodes" v-model:edges="edges"
            @connect="onConnect"
            @edge-double-click="onEdgeDoubleClick"
            @dragover="onDragOver">
            <Controls />
            <Background
                :gap="35"
                variant="dots"
                :style="{
                    backgroundColor: 'rgba(var(--color-main-rgb), 0.1)',
                    transition: 'background-color 0.2s ease',
                }" />

            <template #node-base="baseNodeProps">
                <BaseNode v-bind="baseNodeProps" />
            </template>

            <template #node-note="noteNodeProps">
                <NoteNode v-bind="noteNodeProps" />
            </template>

            <template #node-ifelse="ifelseNodeProps">
                <IfElseNode v-bind="ifelseNodeProps" />
            </template>

            <template #node-trigger="triggerNodeProps">
                <TriggerNode v-bind="triggerNodeProps" />
            </template>

            <template #node-merge="mergeNodeProps">
                <MergeNodeVue v-bind="mergeNodeProps" />
            </template>

            <template #edge-base="baseEdgeProps">
                <BaseEdge v-bind="baseEdgeProps" />
            </template>
        </VueFlow>
        <div class="ss-card node-list">
            <BcTab class="dept-list">
                <div icon="fa-bars-staggered">
                    <div class="node-list-search">
                        <label>
                            <font-awesome-icon :icon="['fas', 'fa-magnifying-glass']" />
                            <input v-model="searchKeyword" type="text"
                                placeholder="搜索分类或名称……">
                        </label>
                    </div>
                    <div class="node-list-body">
                        <div v-for="item in filteredNodes" :key="item.id"
                            :draggable="true"
                            @dragstart="onDragStart($event, item)">
                            <font-awesome-icon :icon="['fas', item.icon || 'fa-cube']" />
                            <div>
                                <span><span>{{ categoryNames[item.category] || item.category }}</span>{{ item.name }}</span>
                                <a>{{ item.description }}</a>
                            </div>
                        </div>
                    </div>
                </div>
                <div icon="fa-info-circle" class="flow-info">
                    <div class="flow-info-card">
                        <header>工作流信息</header>
                        <div v-if="!editingFlow" class="flow-summary">
                            <div class="flow-row">
                                <label>名称</label>
                                <div class="flow-value">{{ workflowInfo.name || '未命名工作流' }}</div>
                            </div>
                            <div class="flow-row">
                                <label>触发器</label>
                                <div class="flow-value">{{ workflowInfo.triggerLabel || workflowInfo.triggerTypeLabel || '-' }}</div>
                            </div>
                            <div class="flow-row">
                                <label>描述</label>
                                <div class="flow-value flow-desc">{{ workflowInfo.description || '-' }}</div>
                            </div>
                            <div class="flow-actions">
                                <button class="edit-btn" @click="openFlowEditor">编辑</button>
                            </div>
                        </div>

                        <div v-else class="flow-edit">
                            <div class="flow-row">
                                <label>名称</label>
                                <input v-model="localFlow.name" class="flow-value-edit" type="text"
                                    placeholder="工作流名称">
                            </div>
                            <div class="flow-row">
                                <label>触发器</label>
                                <input v-model="localFlow.triggerLabel" class="flow-value-edit" disabled
                                    type="text" placeholder="触发器标签">
                            </div>
                            <div class="flow-row">
                                <label>描述</label>
                                <textarea v-model="localFlow.description" class="flow-value-edit" rows="3"
                                    placeholder="工作流描述" />
                            </div>
                            <div class="flow-actions">
                                <button class="cancel-btn" @click="cancelFlowEdit">取消</button>
                                <button class="save-btn" @click="saveFlowEdit">保存</button>
                            </div>
                        </div>
                    </div>
                    <div v-if="selectedNode" class="flow-info-card">
                        <header>选中节点</header>
                        <div class="selected-node-card">
                            <div class="flow-row">
                                <label>节点 ID</label>
                                <div class="flow-value">{{ (selectedNode as any).id }}</div>
                            </div>
                            <div class="flow-row">
                                <label>类型</label>
                                <div class="flow-value">{{ (selectedNode as any).type }}</div>
                            </div>
                            <div class="flow-row">
                                <label>标题</label>
                                <div class="flow-value">{{ (selectedNode as any).data?.label || '-' }}</div>
                            </div>

                            <div v-if="selectedNodeInputs.length > 0" class="flow-row">
                                <label>输入 (来自上游)</label>
                                <div class="flow-value param-preview">
                                    <pre>{{ selectedNodeInputsText }}</pre>
                                </div>
                            </div>

                            <div v-if="selectedNodeOutputs.length > 0" class="flow-row">
                                <label>输出 (schema)</label>
                                <div class="flow-value param-preview">
                                    <pre>{{ selectedNodeOutputsText }}</pre>
                                </div>
                            </div>

                            <div class="flow-actions">
                                <button class="edit-btn" @click="focusOnNode((selectedNode as any))">聚焦</button>
                            </div>
                        </div>
                    </div>
                </div>
            </BcTab>
        </div>
    </div>
</template>

<script setup lang="ts">
import { LogLevel, init, nodeManager as runnerNodeManager, BaseRenMessage } from 'renflow.runner'

import { MergeNode, type NodeMetadata } from 'renflow.runner'
import type { Node, Edge } from '@vue-flow/core'

import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Controls } from '@vue-flow/controls'
import { Background } from '@vue-flow/background'

import BcTab from 'vue3-bcui/packages/bc-tab'

import BaseNode from '@app/components/BaseNode.vue'
import BaseEdge from '@app/components/BaseEdge.vue'

import TriggerNode from '@app/components/nodes/TriggerNode.vue'
import NoteNode from '@app/components/nodes/NoteNode.vue'
import IfElseNode from '@app/components/nodes/IfElseNode.vue'
import MergeNodeVue from '@app/components/nodes/MergeNode.vue'

import { WorkflowStorage } from '@app/functions/workflow'
import { backend } from '@app/functions/backend'
import type { WorkflowData } from '@app/functions/workflow'
import { toast } from '@app/functions/toast'
import { Logger, LogType } from '@app/functions/base'
import { getExNodeTypes } from '@app/functions/utils/node'

const route = useRoute()
const {
    onNodeDrag,
    getIntersectingNodes,
    getIncomers,
    findNode,
    updateNode,
    addEdges,
    addNodes,
    removeNodes,
    removeEdges,
    project,
    setCenter,
    getViewport
} = useVueFlow()

// 保留对 getIntersectingNodes 的引用以避免 lint 报 unused（该函数在上方注释的推开逻辑中使用）
/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */
void getIntersectingNodes

const logger = new Logger()

// 工作流相关的响应式状态
// workflowInfo: 当前工作流的元信息（id/name/trigger 等）
// localFlow: 本地用于编辑的副本（用于右侧编辑面板）
// editingFlow: 是否处于编辑面板打开状态
// workflowEnabled: 当前工作流是否启用
const workflowInfo = ref<any>({})
const localFlow = ref<any>({})
const editingFlow = ref<boolean>(false)
const workflowEnabled = ref<boolean>(false)

// 初始化 renflow.runner（集中初始化入口）
init(LogLevel.DEBUG, {
    debug: (_: string, ...args: any[]) => {
        logger.debug(args[0])
    },
    info: (_: string, ...args: any[]) => {
        logger.info(args[0])
    },
    warn: (_: string, ...args: any[]) => {
        logger.add(LogType.ERR, '', args)
    },
    error: (_: string, ...args: any[]) => {
        logger.add(LogType.ERR, '', args)
    }
})

const nodeManager = runnerNodeManager

// 打开编辑器（复制当前值到本地副本）
function openFlowEditor() {
    localFlow.value = { ...workflowInfo.value }
    editingFlow.value = true
}

function cancelFlowEdit() {
    editingFlow.value = false
}

async function saveFlowEdit() {
    workflowInfo.value = { ...workflowInfo.value, ...localFlow.value }
    await saveWorkflow()
    editingFlow.value = false
}

watch(workflowInfo, (newVal) => {
    if (!editingFlow.value) {
        localFlow.value = { ...newVal }
    }
}, { deep: true })

// 从 URL 参数获取工作流信息
onMounted(async () => {
    const query = route.query
    if (query.triggerName && query.name) {
        workflowInfo.value = {
            id: query.id as string | undefined,
            triggerType: (query.triggerType as string) || '',
            triggerTypeLabel: (query.triggerTypeLabel as string) || (query.triggerLabel as string) || (query.triggerType as string) || '',
            triggerName: query.triggerName as string,
            triggerLabel: (query.triggerLabel as string) || query.triggerName as string,
            name: query.name as string,
            description: (query.description as string) || ''
        }

        logger.add(LogType.INFO, '工作流信息:', workflowInfo.value)

        // 如果有 ID，尝试加载工作流
        if (query.id) {
            await loadWorkflowById(query.id as string)
        } else {
            const triggerMeta: any = {
                id: 'trigger',
                name: '触发器',
                description: `触发器: ${workflowInfo.value.triggerLabel}`,
                category: 'input',
                params: [],
                icon: 'bolt'
            }

            if (workflowInfo.value.triggerName === 'message') {
                try {
                    const rm = new BaseRenMessage()
                    const keys = Object.keys(rm) as string[]
                    triggerMeta.outputSchema = keys.map(k => {
                        const v = (rm as any)[k]
                        let t: string = 'any'
                        if (v === null || v === undefined) {
                            t = 'any'
                        } else if (v instanceof Date) {
                            t = 'string'
                        } else if (Array.isArray(v)) {
                            t = 'array'
                        } else {
                            const typ = typeof v
                            if (typ === 'string') t = 'string'
                            else if (typ === 'number') t = 'number'
                            else if (typ === 'boolean') t = 'boolean'
                            else if (typ === 'object') t = 'object'
                            else t = 'any'
                        }
                        return { key: k, label: k, type: t }
                    })
                } catch (e) {
                    triggerMeta.outputSchema = [
                        { key: 'messageId', label: 'messageId', type: 'string' },
                        { key: 'message', label: 'message', type: 'any' },
                        { key: 'time', label: 'time', type: 'string' }
                    ]
                }
            }

            applyWithoutHistory(() => {
                nodes.value = [{
                    id: workflowInfo.value.triggerName,
                    type: 'trigger',
                    position: { x: 0, y: 0 },
                    data: {
                        triggerName: workflowInfo.value.triggerName,
                        triggerLabel: workflowInfo.value.triggerLabel,
                        metadata: triggerMeta
                    }
                }]
                // 新建时默认未启用
                workflowEnabled.value = false
                undoStack.value.length = 0
                redoStack.value.length = 0
                snapshotMaps()
            })
        }

        // 更新节点 ID 计数器
        updateNodeIdCounter()

        // 获取窗口宽度
        const width = window.innerWidth
        let { zoom } = getViewport()
        setCenter(width / 3, 0, { zoom: zoom, duration: 200 })
    }
})

/**
 * 保存工作流
 */
async function saveWorkflow() {
    try {
        const workflowData: Partial<WorkflowData> = {
            id: workflowInfo.value.id,
            name: workflowInfo.value.name,
            description: workflowInfo.value.description,
            triggerType: workflowInfo.value.triggerType,
            triggerTypeLabel: workflowInfo.value.triggerTypeLabel,
            triggerName: workflowInfo.value.triggerName,
            triggerLabel: workflowInfo.value.triggerLabel,
            enabled: workflowEnabled.value,
            nodes: JSON.parse(JSON.stringify(nodes.value)), // 深拷贝确保数据完整
            edges: JSON.parse(JSON.stringify(edges.value))
        }

        const saved = await WorkflowStorage.save(workflowData)
        workflowInfo.value.id = saved.id

        // 在桌面模式下，通知其他窗口工作流已更新（例如 ListView）
        try {
            if (backend.isDesktop()) {
                const { emit } = await import('@tauri-apps/api/event')
                void emit('workflow:updated', { id: saved.id, enabled: saved.enabled })
            }
        } catch (e) {
            logger.add(LogType.ERR, '触发 workflow:updated 事件失败', e)
        }
        // 使用 Toast 通知
        toast.success(`工作流已保存: ${saved.name}`)
        logger.add(LogType.INFO, '工作流已保存:', saved)
    } catch (error) {
        toast.error('保存工作流失败')
        logger.error(error as unknown as Error, '保存工作流失败')
    }
}

/**
 * 根据 ID 加载工作流
 */
async function loadWorkflowById(id: string) {
    try {
        const workflow = await WorkflowStorage.load(id)
        if (workflow) {
            workflowInfo.value = {
                id: workflow.id,
                name: workflow.name,
                description: workflow.description,
                triggerType: workflow.triggerType,
                triggerTypeLabel: workflow.triggerTypeLabel,
                triggerName: workflow.triggerName,
                triggerLabel: workflow.triggerLabel
            }

            // 恢复启用状态
            workflowEnabled.value = !!workflow.enabled

            // 确保完整恢复节点和边数据（通过 applyWithoutHistory 避免在加载时产生历史记录）
            applyWithoutHistory(() => {
                nodes.value = (workflow.nodes || []).map((n: any) => {
                    const isMerge = (n && ((n.data && n.data.nodeType === 'merge') || (n.data && n.data.metadata && n.data.metadata.id === 'merge') || n.type === getExNodeTypes('merge')))
                    return { ...n, draggable: isMerge ? false : (n.draggable ?? true), class: isMerge ? 'no-transition' : (n.class ?? '') }
                })
                edges.value = workflow.edges || []
                // 清空历史栈并建立初始快照
                undoStack.value.length = 0
                redoStack.value.length = 0
                snapshotMaps()
            })

            // 更新节点 ID 计数器，避免新节点 ID 冲突
            updateNodeIdCounter()

            // 使用 Toast 通知
            toast.success(`工作流已加载: ${workflow.name}`)
            logger.add(LogType.INFO, '工作流已加载完成，当前 nodes.value:', nodes.value)
        } else {
            toast.error('工作流不存在')
        }
    } catch (error) {
        toast.error('加载工作流失败')
        logger.error(error as unknown as Error, '加载工作流失败')
    }
}

/**
 * 执行工作流
 */
async function executeWorkflow() {
    try {
        // 将 "执行" 操作改为切换启用状态并持久化
        if (nodes.value.length === 0) {
            toast.error('当前工作流为空，无法启用/禁用')
            return
        }

        // 如果还没有 ID，先保存工作流以获得 ID
        if (!workflowInfo.value.id) {
            await saveWorkflow()
        }

        const id = workflowInfo.value.id as string
        const full = await WorkflowStorage.load(id)
        if (!full) {
            toast.error('无法加载工作流以切换状态')
            return
        }

        full.enabled = !full.enabled
        const saved = await WorkflowStorage.save(full)
        workflowEnabled.value = !!saved.enabled

        toast.success(saved.enabled ? '工作流已启用' : '工作流已禁用')
        logger.add(LogType.INFO, `工作流 ${saved.id} 状态已切换: ${saved.enabled}`)

        // 在桌面模式下广播事件给其他窗口（如 ListView）实时刷新
        try {
            if (backend.isDesktop()) {
                const { emit } = await import('@tauri-apps/api/event')
                void emit('workflow:updated', { id: saved.id, enabled: saved.enabled })
            }
        } catch (e) {
            logger.add(LogType.ERR, '触发 workflow:updated 事件失败', e)
        }
    } catch (error) {
        toast.error('切换工作流启用状态失败')
        logger.error(error as unknown as Error, '切换工作流启用状态失败')
    }
}

/**
 * 高亮/取消高亮节点（用于外部执行可视化）
 */
function highlightNode(nodeId: string, highlight: boolean) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (node) {
        updateNode(nodeId, {
            class: highlight ? 'executing' : ''
        })
    }
}

onMounted(async () => {
    try {
        if (backend.isDesktop()) {
            // 监听编辑器打开请求
            backend.addListener('workflow:open', async (evt: any) => {
                const payload = evt?.payload || {}
                const id = payload.id
                if (id) {
                    await loadWorkflowById(id)
                }
            })

            // 监听节点开始
            backend.addListener('workflow:execute:nodeStart', (evt: any) => {
                const payload = evt?.payload || {}
                if (payload.id !== workflowInfo.value.id) return
                const nodeId = payload.nodeId
                const node = nodes.value.find(n => n.id === nodeId) as any
                if (node && node.data?.nodeType === 'merge') {
                    const targets = edges.value.filter(e => e.source === nodeId).map(e => e.target)
                    for (const tid of targets) highlightNode(tid, true)
                } else {
                    highlightNode(nodeId, true)
                }
                // try {
                //     const node = (nodes.value as any[]).find((n: any) => n.id === nodeId) as any
                //     if (node && node.position) {
                //         const { zoom } = getViewport()
                //         setCenter(node.position.x + 240, node.position.y + 100, { zoom, duration: 200 })
                //     }
                // } catch (e) {
                //     // ignore
                // }
            })

            // 监听节点完成
            backend.addListener('workflow:execute:nodeComplete', (evt: any) => {
                const payload = evt?.payload || {}
                if (payload.id !== workflowInfo.value.id) return
                const nodeId = payload.nodeId
                const node = nodes.value.find(n => n.id === nodeId) as any
                if (node && node.data?.nodeType === 'merge') {
                    const targets = edges.value.filter(e => e.source === nodeId).map(e => e.target)
                    for (const tid of targets) highlightNode(tid, false)
                } else {
                    highlightNode(nodeId, false)
                }
            })

            // 监听节点错误
            backend.addListener('workflow:execute:nodeError', (evt: any) => {
                const payload = evt?.payload || {}
                if (payload.id !== workflowInfo.value.id) return
                const nodeId = payload.nodeId
                highlightNode(nodeId, false)
                toast.error(`节点执行错误 > ${payload.error || ''}`)
            })

            // 监听执行开始/完成
            backend.addListener('workflow:execute:start', (evt: any) => {
                const payload = evt?.payload || {}
                if (payload.id !== workflowInfo.value.id) return
                toast.info('工作流开始执行')
            })
        }
    } catch (e) {
        logger.add(LogType.ERR, '注册执行可视化事件监听失败', e)
    }
})



// 搜索关键词
const searchKeyword = ref('')

// 分类中文映射
const categoryNames: Record<string, string> = {
    input: '输入',
    output: '输出',
    transform: '转换',
    control: '控制',
    logic: '逻辑',
    data: '数据',
    network: '网络',
    bot: '机器人',
    flow: '流程',
    custom: '自定义'
}

// 过滤后的节点列表
const filteredNodes = computed(() => {
    const keyword = searchKeyword.value.toLowerCase().trim()
    if (!keyword) {
        return nodeManager.getNodeList()
    }

    return nodeManager.getNodeList().filter(node => {
        // 搜索节点名称、描述和分类
        return (
            node.name.toLowerCase().includes(keyword) ||
            node.description.toLowerCase().includes(keyword) ||
            node.category.toLowerCase().includes(keyword)
        )
    })
})

// 节点和边数据
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])

// ---- undo/redo 历史管理 ----
const undoStack = ref<any[]>([])
const redoStack = ref<any[]>([])
let isApplyingHistory = false
// 在节点删除时，用来抑制随后由 edges watcher 产生的重复 edge 删除历史项
const suppressedEdgeRemovals = new Set<string>()

// 可用于模板的撤销/重做可用状态
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

// 快照用于 diff 检测（id -> node/edge）
let prevNodesMap: Record<string, any> = {}
let prevEdgesMap: Record<string, any> = {}

function snapshotMaps() {
    prevNodesMap = {}
    prevEdgesMap = {}
    for (const n of nodes.value) prevNodesMap[(n as any).id] = JSON.parse(JSON.stringify(n))
    for (const e of edges.value) prevEdgesMap[(e as any).id] = JSON.parse(JSON.stringify(e))
}

// 在加载工作流或回放历史时使用，避免产生新的历史记录
function applyWithoutHistory(fn: () => void) {
    isApplyingHistory = true
    try {
        fn()
    } finally {
        setTimeout(() => { isApplyingHistory = false }, 0)
    }
}

function pushAction(action: any) {
    undoStack.value.push(action)
    redoStack.value.length = 0
}

function applyAction(action: any, _isRedo = false) {
    applyWithoutHistory(() => {
        switch (action.type) {
            case 'addNode':
                addNodes([action.node])
                if (action.edges && Array.isArray(action.edges) && action.edges.length > 0) {
                    addEdges(action.edges)
                }
                break
            case 'removeNode':
                try {
                    removeNodes([action.node.id])
                } catch (e) {
                    nodes.value = nodes.value.filter(n => (n as any).id !== action.node.id)
                }
                break
            case 'moveNode':
                if (action && action.to) {
                    updateNode(action.id, { position: action.to })
                }
                break
            case 'updateNode':
                if (action && action.to) {
                    updateNode(action.id, { data: action.to })
                }
                break
            case 'addEdge':
                addEdges([action.edge])
                break
            case 'removeEdge':
                try {
                    removeEdges([action.edge.id])
                } catch (e) {
                    edges.value = edges.value.filter((ed: any) => ed.id !== action.edge.id)
                }
                break
            default:
                logger.add(LogType.ERR, '未知历史操作', action)
        }
    })
}

function undo() {
    if (undoStack.value.length === 0) {
        toast.info('没有更多可撤销的操作')
        return
    }
    const action = undoStack.value.pop()
    // 计算逆操作并执行
    const inverse = (() => {
        switch (action.type) {
            case 'addNode': return { type: 'removeNode', node: action.node }
            case 'removeNode': return { type: 'addNode', node: action.node, edges: action.edges }
            case 'moveNode': return { type: 'moveNode', id: action.id, from: action.to, to: action.from }
            case 'updateNode': return { type: 'updateNode', id: action.id, from: action.to, to: action.from }
            case 'addEdge': return { type: 'removeEdge', edge: action.edge }
            case 'removeEdge': return { type: 'addEdge', edge: action.edge }
            default: return null
        }
    })()
    if (inverse) {
        applyAction(inverse, false)
        redoStack.value.push(action)
    }
}

function redo() {
    if (redoStack.value.length === 0) {
        toast.info('没有更多可重做的操作')
        return
    }
    const action = redoStack.value.pop()
    if (!action) return
    applyAction(action, true)
    undoStack.value.push(action)
}

// 监听键盘快捷键 Ctrl+Z / Ctrl+Shift+Z
function onKeyDown(e: KeyboardEvent) {
    const isMac = navigator.platform.toLowerCase().includes('mac')
    const ctrl = isMac ? e.metaKey : e.ctrlKey
    if (!ctrl) return
    if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
    }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

// 初始快照
onMounted(() => {
    snapshotMaps()
})

// 监听 nodes/edges 变化并记录历史（注意：在回放历史或加载时会跳过）
watch(nodes, (newNodes) => {
    if (isApplyingHistory) {
        snapshotMaps()
        return
    }

    const newMap: Record<string, any> = {}
    for (const n of newNodes) newMap[(n as any).id] = JSON.parse(JSON.stringify(n))

    // 新增节点
    for (const id of Object.keys(newMap)) {
        if (!prevNodesMap[id]) {
            pushAction({ type: 'addNode', node: newMap[id] })
        }
    }

    // 删除节点（同时捕获该节点相关的边，便于撤销时恢复）
    for (const id of Object.keys(prevNodesMap)) {
        if (!newMap[id]) {
            // 收集该节点相关的边
            const relatedEdges = Object.values(prevEdgesMap).filter((ed: any) => ed.source === id || ed.target === id)
            // 标记这些 edge id，抑制 edges watcher 产生重复的 removeEdge 记录
            for (const re of relatedEdges) {
                if (re && re.id) suppressedEdgeRemovals.add(re.id)
            }
            pushAction({ type: 'removeNode', node: prevNodesMap[id], edges: relatedEdges })
        }
    }

    // 变更检测（位置、data）
    for (const id of Object.keys(newMap)) {
        if (!prevNodesMap[id]) continue
        const prev = prevNodesMap[id]
        const cur = newMap[id]
        // 位置变化
        const prevPos = prev.position || { x: 0, y: 0 }
        const curPos = cur.position || { x: 0, y: 0 }
        if (prevPos.x !== curPos.x || prevPos.y !== curPos.y) {
            // 合并连续的 move 操作（如果最近一条 undo 是相同节点的 move）
            // 合并节点不记录 move 操作
            const node = nodes.value.find(n => (n as any).id === id)
            if (node && node.class === 'no-transition') {
                continue
            }
            const last = undoStack.value[undoStack.value.length - 1]
            if (last && last.type === 'moveNode' && last.id === id) {
                // 更新 last.to
                last.to = curPos
            } else {
                pushAction({ type: 'moveNode', id, from: prevPos, to: curPos })
            }
        }

        // data 变化（参数等）
        const prevData = JSON.stringify(prev.data || {})
        const curData = JSON.stringify(cur.data || {})
        if (prevData !== curData) {
            pushAction({ type: 'updateNode', id, from: JSON.parse(prevData), to: JSON.parse(curData) })
        }
    }

    snapshotMaps()
}, { deep: true })

watch(edges, (newEdges) => {
    if (isApplyingHistory) {
        snapshotMaps()
        return
    }

    const newMap: Record<string, any> = {}
    for (const e of newEdges) newMap[(e as any).id] = JSON.parse(JSON.stringify(e))

    // 新增边
    for (const id of Object.keys(newMap)) {
        if (!prevEdgesMap[id]) {
            // 如果最近的节点删除操作包含此边，则跳过（避免重复记录）
            const last = undoStack.value[undoStack.value.length - 1]
            if (last && last.type === 'removeNode' && Array.isArray(last.edges) && last.edges.find((e: any) => e.id === id)) {
                continue
            }
            pushAction({ type: 'addEdge', edge: newMap[id] })
        }
    }

    // 删除边
    for (const id of Object.keys(prevEdgesMap)) {
        if (!newMap[id]) {
            // 如果这个 edge 是作为 node 删除的一部分被移除的，则跳过记录（由 suppressedEdgeRemovals 标记）
            if (suppressedEdgeRemovals.has(id)) {
                // 已处理，移除标记
                suppressedEdgeRemovals.delete(id)
                continue
            }

            // 兼容以前的逻辑：如果最近的节点删除操作包含此边，也跳过
            const last = undoStack.value[undoStack.value.length - 1]
            if (last && last.type === 'removeNode' && Array.isArray(last.edges) && last.edges.find((e: any) => e.id === id)) {
                continue
            }

            pushAction({ type: 'removeEdge', edge: prevEdgesMap[id] })
        }
    }

    snapshotMaps()
}, { deep: true })


// 当前选中节点（Vue Flow 在被选中时会在节点对象上标记 selected）
const selectedNode = computed(() => {
    return (nodes.value as any[]).find(n => (n as any).selected) as (Node & { data?: any }) | undefined
})

// 计算当前选中节点的可用输入（来自上游节点的 outputSchema）
const selectedNodeInputs = computed(() => {
    const res: Array<{ label: string; key: string; type?: string }> = []
    const node = selectedNode.value
    if (!node) return res

    const current = findNode(node.id)
    if (!current) return res

    const incomers = getIncomers(current)
    for (const incomer of incomers) {
        const metadata = incomer.data?.metadata
        if (metadata?.outputSchema && Array.isArray(metadata.outputSchema)) {
            for (const f of metadata.outputSchema) {
                res.push({ label: f.label, key: f.key, type: f.type })
            }
        }
    }

    return res
})

// 计算当前选中节点的输出 schema（来自节点自身的 metadata.outputSchema 或 data.metadata）
const selectedNodeOutputs = computed(() => {
    const node = selectedNode.value
    if (!node) return [] as Array<{ key: string; label: string; type?: string }>
    const meta = node.data?.metadata
    if (!meta) return []
    if (!meta.outputSchema || !Array.isArray(meta.outputSchema)) return []
    return meta.outputSchema.map((f: any) => ({ key: f.key, label: f.label, type: f.type }))
})

const selectedNodeInputsText = computed(() => selectedNodeInputs.value.map((i: any) => `${i.label != i.key  ? (i.label + '【' +i.key + '】') : i.key} : ${i.type || 'any'}`).join('\n'))
const selectedNodeOutputsText = computed(() => selectedNodeOutputs.value.map((o: any) => `${o.label != o.key ? (o.label + '【' +o.key + '】') : o.key} : ${o.type || 'any'}`).join('\n'))

// 本地编辑选中节点的参数（用于右侧面板快速编辑）
const editingNodeParams = ref<Record<string, any>>({})

// 当选中节点变化，同步本地参数副本
watch(selectedNode, (node) => {
    if (node && node.data && node.data.params) {
        editingNodeParams.value = { ...(node.data.params || {}) }
    } else {
        editingNodeParams.value = {}
    }
})

// 聚焦到节点位置
function focusOnNode(node: any) {
    if (!node || !node.position) return
    const { zoom } = getViewport()
    setCenter(node.position.x + 240, node.position.y + 100, { zoom, duration: 300 })
}

// 节点 ID 计数器
let nodeIdCounter = 0

/**
 * 更新节点 ID 计数器
 * 确保新节点 ID 不会与现有节点冲突
 */
function updateNodeIdCounter() {
    let maxId = 0
    nodes.value.forEach(node => {
        // 提取节点 ID 中的数字部分
        const match = node.id.match(/^node-(\d+)$/)
        if (match) {
            const id = parseInt(match[1])
            if (id > maxId) {
                maxId = id
            }
        }
    })
    // 设置计数器为最大值 + 1
    nodeIdCounter = maxId + 1
}

/**
 * 矫正目标节点的上游 merge 节点位置，使其与目标节点保持一致的偏移
 * nodeId: 目标节点 ID
 * targetPos: 可选的目标位置（如果未提供则使用当前节点的位置）
 */
function correctUpstreamMergeNodes(nodeId: string, targetPos?: { x: number; y: number }) {
    try {
        const target = findNode(nodeId)
        if (!target) return
        const pos = targetPos || target.position || { x: 0, y: 0 }
        const incomers = getIncomers(target)
        if (!incomers || incomers.length === 0) return

        for (const inc of incomers) {
            const isMerge = (inc && ((inc.data && inc.data.nodeType === 'merge') || (inc.data && inc.data.metadata && inc.data.metadata.id === 'merge') || inc.type === getExNodeTypes('merge')))
            if (!isMerge) continue

            const desiredPos = {
                x: (pos.x || 0) - 45,
                y: (pos.y || 0)
            }

            try {
                updateNode(inc.id, { position: desiredPos })
            } catch (e) {
                // 忽略单个更新失败
            }
        }
    } catch (e) {
        // 保证不抛出异常影响编辑器
    }
}

// 拖拽状态
const draggedNodeType = ref<NodeMetadata | null>(null)

// 拖拽时记录上一次位置，用于计算位移以联动 merge 节点
const dragLastPositions = ref<Record<string, { x: number; y: number }>>({})
/**
 * 处理拖拽开始
 */
function onDragStart(event: DragEvent, nodeType: NodeMetadata) {
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('application/vueflow', nodeType.id)
        draggedNodeType.value = nodeType
    }
}

/**
 * 处理拖拽经过画布
 */
function onDragOver(event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
    }
}

/**
 * 处理放置节点
 */
function onDrop(event: DragEvent) {
    if (!draggedNodeType.value) return

    // 获取鼠标在画布上的位置
    const position = project({
        x: event.clientX,
        y: event.clientY
    })

    // 创建新节点
    const newNode: Node = {
        id: `node-${nodeIdCounter++}`,
        type: getExNodeTypes(draggedNodeType.value.id),
        position,
        // 如果拖拽的是 merge 类型，创建到画布后禁止拖动
        draggable: draggedNodeType.value.id === 'merge' ? false : true,
        class: draggedNodeType.value.id === 'merge' ? 'no-transition' : undefined,
        data: {
            label: draggedNodeType.value.name,
            nodeType: draggedNodeType.value.id,
            metadata: draggedNodeType.value,
            params: {}
        }
    }

    // 添加节点到画布
    addNodes([newNode])

    // 清除拖拽状态
    draggedNodeType.value = null
}

/**
 * 计算两个节点的重叠区域和推开方向
 */

/*
 * 之前的推开逻辑（保留注释，必要时取消注释以启用）:
onNodeDrag(({ node: draggedNode }) => {
    return // 设置功能还没完成，暂时禁用
    // eslint-disable-next-line no-unreachable
    const intersections = getIntersectingNodes(draggedNode)

    if (intersections.length > 0) {
        // 对每个重叠的节点进行推开
        for (const intersectingNode of intersections) {
            // 跳过被拖拽的节点本身
            if (intersectingNode.id === draggedNode.id) continue

            const direction = calculatePushDirection(draggedNode, intersectingNode)

            // 计算推开的距离（节点宽度 + 一些间距）
            const pushDistance = 30

            // 计算新位置
            const newPosition = {
                x: intersectingNode.position.x + direction.x * pushDistance,
                y: intersectingNode.position.y + direction.y * pushDistance,
            }

            // 更新节点位置
            updateNode(intersectingNode.id, {
                position: newPosition,
            })
        }
    }
})

function calculatePushDirection(draggedNode: Node, intersectingNode: Node) {
    // 安全地获取节点尺寸，使用类型断言
    const draggedDimensions = (draggedNode as any).dimensions || { width: 150, height: 50 }
    const intersectingDimensions = (intersectingNode as any).dimensions || { width: 150, height: 50 }

    const draggedCenter = {
        x: draggedNode.position.x + draggedDimensions.width / 2,
        y: draggedNode.position.y + draggedDimensions.height / 2,
    }

    const intersectingCenter = {
        x: intersectingNode.position.x + intersectingDimensions.width / 2,
        y: intersectingNode.position.y + intersectingDimensions.height / 2,
    }

    // 计算从被拖拽节点到重叠节点的方向向量
    const dx = intersectingCenter.x - draggedCenter.x
    const dy = intersectingCenter.y - draggedCenter.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance === 0) {
        // 如果完全重叠，默认向右下推
        return { x: 1, y: 1 }
    }

    // 归一化方向向量
    return {
        x: dx / distance,
        y: dy / distance,
    }
}

/**
 * 处理节点拖拽时的重叠检测和推开（当前为增强的 merge 联动实现在下方）
 */
onNodeDrag(({ node: draggedNode }) => {
    if (!draggedNode || !draggedNode.id) return

    // 找到当前在画布上的节点实例（vue-flow 的 findNode）
    const current = findNode(draggedNode.id)
    if (!current) return

    // 读取上一次记录的位置
    const last = dragLastPositions.value[draggedNode.id]

    // 如果没有记录，初始化并返回（下一次更新时能计算差值）
    if (!last) {
        // 使用共用方法在第一次移动前矫正上游 merge 节点位置
        try {
            applyWithoutHistory(() => {
                correctUpstreamMergeNodes(draggedNode.id, draggedNode.position)
            })
        } catch (e) {
            // 忽略错误以保证拖拽体验
        }

        dragLastPositions.value[draggedNode.id] = { x: draggedNode.position.x, y: draggedNode.position.y }
        return
    }

    const dx = draggedNode.position.x - last.x
    const dy = draggedNode.position.y - last.y

    // 没有位移则跳过
    if (dx === 0 && dy === 0) return

    // 获取该节点的上游节点（incomers），如果有 merge 节点则一并移动
    const incomers = getIncomers(current)
    if (incomers && incomers.length > 0) {
        for (const inc of incomers) {
            const isMerge = (inc && ((inc.data && inc.data.nodeType === 'merge') || (inc.data && inc.data.metadata && inc.data.metadata.id === 'merge') || inc.type === getExNodeTypes('merge')))
            if (!isMerge) continue

            // 计算 merge 节点的新位置并更新
            const newPos = {
                x: (inc.position?.x || 0) + dx,
                y: (inc.position?.y || 0) + dy
            }
            try {
                updateNode(inc.id, { position: newPos })
            } catch (e) {
                // 忽略更新错误
            }
        }
    }

    // 更新记录位置
    dragLastPositions.value[draggedNode.id] = { x: draggedNode.position.x, y: draggedNode.position.y }
})

// 鼠标释放时清理拖拽记录，避免残留影响后续拖拽
function clearDragLastPositions() {
    dragLastPositions.value = {}
}

// 注册全局 mouseup 以在拖拽结束时清理状态
onMounted(() => {
    window.addEventListener('mouseup', clearDragLastPositions)
})
onUnmounted(() => {
    window.removeEventListener('mouseup', clearDragLastPositions)
})

/**
 * 处理连接事件
 */
function onConnect(params: any) {
    // 连接线右边的 node 已连接的线段数
    const inputCount = edges.value.filter(
        e => e.target === params.target
    ).length
    // 连接线左边的 node 已连接的线段数
    const outputCount = edges.value.filter(
        e => e.source === params.source
    ).length

    // 连接线右边的 node
    const targetNode = findNode(params.target)
    // 连接线左边的 node
    const sourceNode = findNode(params.source)

    // 连接线右边的 node 的最大连接数
    const maxInputCount = targetNode?.data?.metadata?.maxInput || 1
    // 连接线左边的 node 的最大连接数
    const maxOutputCount = sourceNode?.data?.metadata?.maxOutput || -1

    // 检查连接点
    if (maxOutputCount !== -1 && outputCount >= maxOutputCount) {
        logger.add(LogType.ERR, `节点 ${params.source} 的输出连接数已达上限`)
        return
    }
    if (maxInputCount !== -1 && inputCount >= maxInputCount) {
        logger.add(LogType.ERR, `节点 ${params.target} 的输入连接数已达上限`)

        // 检查 targetNode 的所有的上一个节点中是否有 mergeNode
        const incomers = getIncomers(targetNode!)
        let newNode
        newNode = incomers.find(n => n.type === getExNodeTypes('merge'))
        // 自动创建一个 MergeNode
        const mergeNodeRaw: MergeNode = new MergeNode()
        if(!newNode) {
            const newPosition = {
                x: targetNode!.position.x - 45,
                y: targetNode!.position.y,
            }
            newNode = {
                id: `node-${nodeIdCounter++}`,
                type: getExNodeTypes(mergeNodeRaw.metadata.id),
                position: newPosition,
                draggable: false,
                class: 'no-transition',
                data: {
                    label: mergeNodeRaw.metadata.name,
                    nodeType: mergeNodeRaw.metadata.id,
                    metadata: mergeNodeRaw.metadata,
                    params: {}
                }
            }
            addNodes([newNode])
        }
        // 将 targetNode 的所有已有 edge 连接到 MergeNode
        const existingEdges = edges.value.filter(
            e => e.target === params.target
        )
        const newEdges = existingEdges.map(e => ({
            ...e,
            target: newNode.id
        }))
        edges.value = edges.value.filter(
            e => e.target !== params.target
        )
        // 添加新的 edges
        addEdges(newEdges)
        // 连接 sourceNode 到 MergeNode, 再连接 MergeNode 到 targetNode
        addEdges([
            { source: params.source, target: newNode.id, type: 'base' },
            { source: newNode.id, target: params.target, type: 'base' }
        ])

        return
    }

    const data = {} as { [key: string]: any }
    addEdges([
        {
            ...params,
            data: data,
            type: 'base',
        },
    ])
}

/**
 * 处理边双击事件，删除边
 */
function onEdgeDoubleClick({ edge }: { edge: Edge }) {
    edges.value = edges.value.filter(e => e.id !== edge.id)
}
</script>

<style scoped>
.edit-view {
    background-color: rgba(var(--color-bg-rgb), 0.8);
    width: 100%;
    height: 100vh;
    position: relative;
}

.toolbar {
    width: fit-content;
    position: absolute;
    bottom: 15px;
    left: calc(50% - 120px);
    transform: translateX(-50%);
    height: 50px;
    background: rgba(var(--color-card-rgb), 0.8);
    backdrop-filter: blur(10px);
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    z-index: 10;
    display: flex;
    align-items: center;
    padding: 0 5px;
    justify-content: space-between;
}

.toolbar-btn {
    background: var(--color-card-2);
    margin: 5px;
    color: var(--color-font);
    transition: all 0.3s;
    align-items: center;
    border-radius: 7px;
    font-size: 0.7rem;
    padding: 8px 15px;
    cursor: pointer;
    display: flex;
    border: none;
    gap: 6px;
}

.toolbar-btn:hover {
    background: var(--color-card-1);
    color: var(--color-font);
}

.toolbar-btn:active {
    transform: scale(0.95);
}

.toolbar-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.toolbar-btn svg {
    width: 14px;
    height: 14px;
}

.execute-btn {
    background: var(--color-main);
    color: var(--color-font-r);
}

.execute-btn:hover:not(:disabled) {
    opacity: 0.9;
}

.execute-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.node-list {
    background: rgba(var(--color-card-rgb), 0.5);
    box-shadow: 0 0 5px var(--color-shader);
    backdrop-filter: blur(10px);
    height: calc(100vh - 60px);
    position: absolute;
    width: 250px;
    right: 10px;
    z-index: 10;
    top: 10px;
}

:deep(.vue-flow__node) {
    transition: transform 0.3s ease-out;
}

/* 对于 merge 节点禁用位移动画，使用 class 'no-transition' 标记 */
:deep(.vue-flow__node.no-transition) {
    transition: none !important;
}

:deep(.vue-flow__node.dragging) {
    transition: none;
}

/* 执行中的节点高亮样式 */
:deep(.vue-flow__node.executing > div.ss-card) {
    outline: 2px solid var(--color-main);
}

.node-list-search {
    background: rgba(var(--color-card-2-rgb), 0.8);
    border-radius: 99px;
}
.node-list-search svg {
    color: var(--color-font-1);
    margin-left: 10px;
    margin-top: 6px;
    width: 14px;
}
.node-list-search input {
    color: var(--color-font);
    width: calc(100% - 40px);
    background: transparent;
    margin-left: 10px;
    outline: none;
    height: 25px;
    border: none;
}

.node-list-body {
    margin-top: 15px;
}
.node-list-body > div {
    background: rgba(var(--color-card-2-rgb), 0.8);
    transition: background 0.3s, transform 0.2s;
    margin-top: 5px;
    border-radius: 7px;
    user-select: none;
    cursor: grab;
    padding: 10px;
    display: flex;
}
.node-list-body > div:hover {
    background: rgba(var(--color-card-2-rgb), 0.5);
}
.node-list-body > div:active {
    cursor: grabbing;
    opacity: 0.6;
}
.node-list-body > div svg {
    color: var(--color-font-1);
    margin-top: 2px;
    height: 0.9rem;
    width: 0.9rem;
}
.node-list-body > div div {
    flex-direction: column;
    align-items: start;
    margin-left: 10px;
    display: flex;
}
.node-list-body > div div > span {
    color: var(--color-font);
    font-weight: bold;
    font-size: 0.8rem;
}
.node-list-body > div div > span > span {
    background: var(--color-main);
    color: var(--color-font-r);
    border-radius: 99px;
    padding: 1px 5px;
    margin-right: 5px;
    font-size: calc(0.8rem - 2px);
}
.node-list-body > div div a {
    font-size: 0.75rem;
    color: var(--color-font-2);
}

.flow-info-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--color-font);
    background: rgba(var(--color-card-2-rgb), 0.8);
    padding: 10px;
    border-radius: 7px;
    margin-top: 10px;
}
.flow-info-card header {
    font-size: 0.9rem;
    font-weight: 600;
    border-bottom: 1px solid var(--color-shader);
    padding-bottom: 6px;
}

.flow-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
.flow-row label {
    font-size: 0.75rem;
    color: var(--color-font-2);
}
.flow-value {
    text-align: right;
    flex: 1;
    font-size: 0.8rem;
    color: var(--color-font);
    word-break: break-word;
}
.flow-value-edit {
    background: var(--color-card-1);
    min-height: 20px;
    padding: 0 10px;
    border-radius: 7px;
    margin-left: 30px;
    text-align: right;
    border: unset;
    flex: 1;
}
.flow-value-edit:disabled {
    background: transparent;
}
.flow-value.param-preview {
    background: rgba(var(--color-card-1-rgb), 0.7);
    overflow-x: scroll;
    overflow-y: hidden;
    border-radius: 7px;
    text-align: left;
    padding: 10px;
    min-width: calc(100% - 20px);
    font-size: 0.7rem;
}
.flow-value.param-preview::-webkit-scrollbar {
    height: 6px;
}
.flow-value.param-preview pre {
    margin: 0;
}
.flow-desc {
    max-height: 48px;
    overflow: hidden;
}
.flow-actions {
    border-radius: 7px;
    padding: 5px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 6px -5px 0 -5px;
}
.flow-actions .edit-btn,
.flow-actions .save-btn,
.flow-actions .cancel-btn {
    padding: 6px 10px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
}
.flow-actions .edit-btn { background: var(--color-card-1); }
.flow-actions .save-btn { background: var(--color-main); color: var(--color-font-r); }
.flow-actions .cancel-btn { background: var(--color-card-1); }
</style>
<style>
.node-list .tab-bar {
    --bc-tab-margin: 10px;
}
.node-list .tab-main > div:first-child {
    background: transparent;
    box-shadow: unset;
}
</style>
