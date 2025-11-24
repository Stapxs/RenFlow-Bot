<template>
    <div class="list-view">
        <!-- 左侧栏：垂直切换标签 -->
        <div class="ss-card left-panel tabs-panel">
            <div class="tabs-body">
                <button class="tab-item" :class="{ active: selectedTab === 'all' }" @click="selectTab('all')">
                    <font-awesome-icon :icon="['fas', 'fa-list']" />
                    <span>所有工作流</span>
                </button>
                <div />
                <button class="tab-item" :class="{ active: selectedTab === 'settings' }" @click="selectTab('settings')">
                    <font-awesome-icon :icon="['fas', 'fa-gear']" />
                    <span>设置</span>
                </button>
            </div>
        </div>

        <!-- 右侧内容区 -->
        <div class="right-content">
            <div class="content-controller">
                <span>RenFlow Bot Editor</span>
                <button title="新建工作流" @click="showCreateDialog = true">
                    <font-awesome-icon :icon="['fas', 'fa-plus']" />
                </button>
                <button title="刷新列表" @click="refreshWorkflowList">
                    <font-awesome-icon :icon="['fas', 'fa-rotate-right']" />
                </button>
                <button v-if="backend.isDesktop()" title="导出工作集" @click="exportWorkspace">
                    <font-awesome-icon :icon="['fas', 'fa-file-export']" />
                    <span>导出</span>
                </button>
                <label>
                    <font-awesome-icon :icon="['fas', 'fa-magnifying-glass']" />
                    <input v-model="searchKeyword" type="text" placeholder="搜索...">
                </label>
            </div>

            <!-- 右侧内容：根据选中标签渲染 -->
            <div class="right-content-inner">
                <!-- 工作流卡片视图（当 selectedTab === 'all'） -->
                <div v-if="selectedTab === 'all'">
                    <div class="workflow-grid">
                        <div v-if="workflowList.length === 0" class="empty-tip">暂无工作流</div>
                        <div class="grid">
                            <div v-for="workflow in filteredWorkflows" :key="workflow.id" class="card"
                                @click="editWorkflow(workflow)">
                                <div class="card-header">
                                    <div class="card-title">{{ workflow.name }}</div>
                                    <button v-if="runningWorkflows.has(workflow.id)" class="card-running">
                                        <font-awesome-icon spin :icon="['fas', 'fa-spinner']" />
                                    </button>
                                    <button :class="'card-status ' + (workflow.enabled ? 'green' : 'red')" @click.stop="toggleEnableWorkflow(workflow)">
                                        <font-awesome-icon :icon="['fas', workflow.enabled ? 'fa-check' : 'fa-xmark']" />
                                        {{ workflow.enabled ? '已启用' : '未启用' }}
                                    </button>
                                    <button class="card-delete" @click.stop="deleteWorkflow(workflow)">✕</button>
                                </div>
                                <div class="card-sub">
                                    <font-awesome-icon :icon="['fas', 'fa-bolt']" />
                                    {{ workflow.triggerLabel || workflow.triggerName }}
                                </div>
                                <div class="card-body">
                                    <div>
                                        <p class="card-desc">{{ workflow.description || '（暂无描述）' }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 设置通过新窗口或路由处理 -->
            </div>
        </div>

        <!-- 新建工作流弹窗 -->
        <WorkflowDialog v-model="showCreateDialog" @create="handleCreateWorkflow" />
    </div>
</template>

<script setup lang="ts">
import confirm from '@app/functions/confirm'
import Option from '@app/functions/option'

import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { windowManager } from '@app/functions/window'
import { backend } from '@app/functions/backend'
import { WorkflowStorage } from '@app/functions/workflow'
import type { WorkflowListItem } from '@app/functions/workflow'
import { Logger, LogType } from '@app/functions/base'
import { toast } from '@app/functions/toast'
import { connectorManager, RenMessage, runWorkflowByTrigger, type VueFlowWorkflow, WorkflowConverter, type WorkflowExecution } from 'renflow.runner'

import WorkflowDialog from '@app/components/WorkflowDialog.vue'
import type { BaseBotAdapter } from 'renflow.runner/dist/connectors'

const router = useRouter()
const logger = new Logger()

const bots = ref<BaseBotAdapter[]>([])

// 控制新建弹窗显示
const showCreateDialog = ref(false)

// 工作流列表
const workflowList = ref<WorkflowListItem[]>([])
const runningWorkflows = ref<Set<string>>(new Set())

// 搜索关键词
const searchKeyword = ref('')

// 左侧标签状态
const selectedTab = ref<'all' | 'settings'>('all')

function selectTab(tab: 'all' | 'settings') {
    if (tab === 'settings') {
        // 提供 bots 信息给设置页（以 id: status 形式）
        const botStates: { [id: string]: boolean } = {}
        for (const bot of bots.value) {
            const id = bot.id
            botStates[id] = bot.connected
        }
        const settingsUrl = '/settings?bots=' + encodeURIComponent(JSON.stringify(botStates))
        if (backend.isDesktop()) {
            void windowManager.createWindow({
                label: 'settings',
                url: settingsUrl,
                title: '设置',
                width: 600,
                height: 500
            })
        } else {
            void router.push(settingsUrl)
        }
        return
    }
    selectedTab.value = tab
}

const filteredWorkflows = computed(() => {
    const k = searchKeyword.value.trim().toLowerCase()
    if (!k) return workflowList.value
    return workflowList.value.filter(w => {
        const name = (w.name || '').toLowerCase()
        const label = (w.triggerLabel || w.triggerName || '').toLowerCase()
        return name.includes(k) || label.includes(k)
    })
})

async function exportWorkspace() {
    if (!backend.isDesktop()) {
        toast.error('仅桌面模式支持导出')
        return
    }
    const ok = await confirm({
        title: '导出工作集',
        message: '将导出可被命令行模式使用的包，包含已配置的连接信息（不包含密码）以及当前已启用的工作流。是否继续？',
        confirmText: '导出',
        cancelText: '取消'
    })
    if (!ok) return
    try {
        const rawBots = Option.get('bots') || []
        const botsConfig = Array.isArray(rawBots) ? rawBots.map((b: any) => ({ id: b.id, name: b.name, type: b.type, address: b.address })) : []
        const list = await WorkflowStorage.list()
        const enabled = list.filter(w => w.enabled)
        const files: { filename: string, content: string }[] = []
        const converter = new WorkflowConverter()
        for (const w of enabled) {
            const full = await WorkflowStorage.load(w.id)
            if (full) files.push({ filename: `${w.id}.json`, content: JSON.stringify(converter.convert(full as unknown as VueFlowWorkflow)) })
        }
        await backend.call('sys:exportWorkspace', { data: { bots: botsConfig, workflows: files } })
        toast.success('导出成功')
    } catch (e) {
        logger.add(LogType.ERR, '导出失败', e)
        toast.error('导出失败')
    }
}

// 加载工作流列表
async function loadWorkflowList() {
    try {
        workflowList.value = await WorkflowStorage.list()
        logger.add(LogType.INFO, '工作流列表已加载：', workflowList.value)
    } catch (error) {
        logger.error(error as unknown as Error, '加载工作流列表失败')
        toast.error('加载工作流列表失败')
    }
}

// 刷新工作流列表
async function refreshWorkflowList() {
    await loadWorkflowList()
    toast.info('列表已刷新')
}

// 切换启用/禁用工作流
async function toggleEnableWorkflow(workflow: WorkflowListItem) {
    try {
        const full = await WorkflowStorage.load(workflow.id)
        if (!full) {
            toast.error('无法加载工作流')
            return
        }

        full.enabled = !full.enabled
        await WorkflowStorage.save(full)
        await loadWorkflowList()
        toast.info(full.enabled ? '工作流已启用' : '工作流已禁用')
    } catch (e) {
        logger.error(e as Error, '切换工作流状态失败')
        toast.error('操作失败')
    }
}

// 编辑工作流
async function editWorkflow(workflow: WorkflowListItem) {
    const params = new URLSearchParams({
        id: workflow.id,
        triggerType: workflow.triggerType,
        triggerTypeLabel: workflow.triggerTypeLabel,
        triggerName: workflow.triggerName,
        triggerLabel: workflow.triggerLabel,
        name: workflow.name,
        description: workflow.description || ''
    })

    const editUrl = `/edit?${params.toString()}`

    if (backend.isDesktop()) {
        // 统一使用单一编辑窗口标签 'edit'，避免为每个 workflow 创建多个窗口
        const res = await windowManager.createWindow({
            label: 'edit',
            url: editUrl,
            title: `编辑工作流 - ${workflow.name}`,
            width: 1200,
            height: 800
        })

        // 如果窗口已存在，通知该窗口打开指定的 workflow
        try {
            if (res === 'existing') {
                backend.call('workflow:open', { id: workflow.id })
            }
        } catch (e) {
            logger.add(LogType.ERR, '发射 workflow:open 事件失败', e)
        }
    } else {
        router.push(editUrl)
    }
}

// 删除工作流
async function deleteWorkflow(workflow: WorkflowListItem) {
    try {
            // 使用全局确认弹窗，避免使用原生 window.confirm
            const ok = await confirm({
                title: '删除工作流',
                message: `确定要删除工作流 "${workflow.name}" 吗？此操作无法撤销。`,
                confirmText: '删除',
                cancelText: '取消'
            })
            if (!ok) return
            await WorkflowStorage.delete(workflow.id)
        toast.info('工作流已删除')

        // 刷新列表
        await loadWorkflowList()
    } catch (error) {
        logger.error(error as unknown as Error, '删除工作流失败')
        toast.error('删除工作流失败')
    }
}

// 处理创建工作流
const handleCreateWorkflow = async (workflow: any) => {
    // 构建触发器显示标签（如果是自定义，使用 customTriggerName）
    const triggerLabel = workflow.triggerName === 'custom' ? (workflow.customTriggerName || '') : (workflow.triggerLabel || workflow.triggerName)

    // 构建 URL 参数（不再包含 triggerType）
    const params = new URLSearchParams({
        triggerName: workflow.triggerName,
        triggerLabel: triggerLabel,
        name: workflow.name,
        description: workflow.description || ''
    })

    const editUrl = `/edit?${params.toString()}`

    if (backend.isDesktop()) {
        await windowManager.createWindow({
            label: `edit-${Date.now()}`, // 使用时间戳确保唯一性
            url: editUrl,
            title: `编辑工作流 - ${workflow.name}`,
            width: 1200,
            height: 800
        })
    } else {
        router.push(editUrl)
    }
}

// 组件挂载时加载工作流列表
onMounted(async () => {
    loadWorkflowList()
    await Option.load()

    const container = document.getElementById('mac-controller')
    if(container) {
        container.style.width = '50%'
    }

    // 如果在桌面模式，监听来自其它窗口的工作流更新事件，以便实时刷新列表
    try {
        if (backend.isDesktop()) {
            backend.addListener('workflow:updated', () => {
                void loadWorkflowList()
            })
        }
    } catch (e) {
        logger.add(LogType.ERR, '注册 workflow:updated 事件监听失败', e)
    }

    const saved = await Option.get('bots')
    if (saved && Array.isArray(saved)) {
        saved.forEach(async item => {
            const adapter = await connectorManager.createBotAdapter(item.type, {
                url: item.address,
                token: item.token
            }, item.id)
            bots.value.push(adapter)

            // 本地订阅适配器事件
            adapter.on(['message', 'message_mine'], (p: RenMessage) => {
                const eventName = p.isMine ? 'message_mine' : 'message'
                runFlow(p, adapter, workflowList.value.filter(w => w.triggerName === eventName && w.enabled))
            })
            adapter.on('connected', () => {
                logger.add(LogType.INFO, `适配器已连接: ${item.id}`)
                toast.success(`适配器已连接: ${item.id}`)
            })
            adapter.on('disconnected', () => {
                logger.add(LogType.ERR, `适配器已断开: ${item.id}`)
                toast.warning(`适配器已断开: ${item.id}，正在尝试重连`)
            })
            adapter.on('error', (err: any) => {
                logger.add(LogType.ERR, `适配器错误: ${item.id}`, err)
                const msg = (err && (err.message || err.toString())) || '未知错误'
                toast.error(`适配器错误: ${item.id} - ${msg}`)
            })

            try {
                await adapter.connect()
            } catch (e: any) {
                logger.add(LogType.ERR, `适配器连接失败: ${item.id}`, e)
                toast.error(`适配器连接失败: ${item.id}`)
            }
        })
    }
})

const runFlow = async (data: any, bot: BaseBotAdapter, workflowList: WorkflowListItem[]) => {
    const converter = new WorkflowConverter()
    // 装载所有 workflowList
    const loadedWorkflows: WorkflowExecution[] = []
    for (const workflowItem of workflowList) {
        const full = await WorkflowStorage.load(workflowItem.id)
        if (full) {
            loadedWorkflows.push(converter.convert(full as unknown as VueFlowWorkflow))
        } else {
            logger.add(LogType.ERR, `加载工作流失败: ${workflowItem.id}`)
        }
    }

    runWorkflowByTrigger(loadedWorkflows, data, { timeout: 60000, bot }, {
        onWorkflowStart: async (workflowId: string): Promise<boolean> => {
            // 如果不是桌面模式，编辑窗口不会接管执行，应当允许工作流继续执行
            if (!backend.isDesktop()) return true

            runningWorkflows.value.add(workflowId)

            try {
                const { listen } = await import('@tauri-apps/api/event')

                // 监听一次性的 handled 事件（短超时） — 如果接收到 executionData，ListView 将执行该数据
                const handledPromise = new Promise<any>((resolve) => {
                    const unlistenPromise = (listen as any)('workflow:execute:handled', (evt: any) => {
                        const payload = evt?.payload || {}
                        if (payload.id === workflowId) {
                            resolve(payload)
                        }
                    })

                    // 如果 400ms 内未被处理则认为未被接管
                    setTimeout(async () => {
                        try {
                            const u = await unlistenPromise
                            if (u && typeof u === 'function') u()
                        } catch (e) {
                            logger.add(LogType.DEBUG, 'unlisten 调用失败', e)
                        }
                        resolve(false)
                    }, 400)
                })

                const handledPayload = await handledPromise

                // 如果编辑窗口返回了 executionData，则本窗口负责执行该执行数据并跳过原本的本地执行
                if (handledPayload && handledPayload.executionData) {
                    try {
                        // 执行来自编辑器的执行数据（只执行该工作流）
                        await runWorkflowByTrigger([handledPayload.executionData], data, { timeout: 60000, bot }, {
                            onNodeStart: async (wfId: string, nodeId: string) => {
                                try {
                                    const { emit } = await import('@tauri-apps/api/event')
                                    void emit('workflow:execute:nodeStart', { id: wfId, nodeId })
                                } catch (e) {
                                    logger.add(LogType.ERR, '发射 workflow:execute:nodeStart 事件失败', e)
                                }
                            },
                            onNodeComplete: async (wfId: string, nodeId: string) => {
                                try {
                                    const { emit } = await import('@tauri-apps/api/event')
                                    void emit('workflow:execute:nodeComplete', { id: wfId, nodeId })
                                } catch (e) {
                                    logger.add(LogType.ERR, '发射 workflow:execute:nodeComplete 事件失败', e)
                                }
                            },
                            onNodeError: async (wfId: string, nodeId: string, error: any) => {
                                try {
                                    const { emit } = await import('@tauri-apps/api/event')
                                    void emit('workflow:execute:nodeError', { id: wfId, nodeId, error: (error as unknown as Error).message })
                                } catch (e) {
                                    logger.add(LogType.ERR, '发射 workflow:execute:nodeError 事件失败', e)
                                }
                            },
                            onWorkflowComplete: async (wfId: string, workflowResult: any) => {
                                try {
                                    const { emit } = await import('@tauri-apps/api/event')
                                    void emit('workflow:execute:complete', { id: wfId, success: !!workflowResult.success, logs: workflowResult.logs })
                                } catch (e) {
                                    logger.add(LogType.ERR, '发射 workflow:execute:complete 事件失败', e)
                                }
                            }
                        })
                    } catch (e) {
                        logger.add(LogType.ERR, '执行来自编辑器的工作流失败', e)
                    }

                    return false
                }

                // 如果 handledPayload 为 true（编辑器接管但未返回 executionData），表示编辑窗口要执行 — 跳过本地执行
                if (handledPayload === true) return false

                return true
            } catch (e) {
                logger.add(LogType.ERR, '询问编辑窗口接管执行失败', e)
                // 出错时默认允许执行
                return true
            }
        },
        onNodeStart: async (workflowId: string, nodeId: string) => {
            try {
                if (backend.isDesktop()) {
                    const { emit } = await import('@tauri-apps/api/event')
                    void emit('workflow:execute:nodeStart', { id: workflowId, nodeId })
                }
            } catch (e) {
                logger.add(LogType.ERR, '发射 workflow:execute:nodeStart 事件失败', e)
            }
        },
        onNodeComplete: async (workflowId: string, nodeId: string) => {
            try {
                if (backend.isDesktop()) {
                    const { emit } = await import('@tauri-apps/api/event')
                    void emit('workflow:execute:nodeComplete', { id: workflowId, nodeId })
                }
            } catch (e) {
                logger.add(LogType.ERR, '发射 workflow:execute:nodeComplete 事件失败', e)
            }
        },
        onNodeError: async (workflowId: string, nodeId: string, error: any) => {
            try {
                if (backend.isDesktop()) {
                    const { emit } = await import('@tauri-apps/api/event')
                    void emit('workflow:execute:nodeError', { id: workflowId, nodeId, error: (error as unknown as Error).message })
                }
            } catch (e) {
                logger.add(LogType.ERR, '发射 workflow:execute:nodeError 事件失败', e)
            }
        },
        onWorkflowComplete: async (workflowId: string, workflowResult: any) => {
            runningWorkflows.value.delete(workflowId)
            try {
                if (backend.isDesktop()) {
                    const { emit } = await import('@tauri-apps/api/event')
                    void emit('workflow:execute:complete', { id: workflowId, success: !!workflowResult.success, logs: workflowResult.logs })
                }
            } catch (e) {
                logger.add(LogType.ERR, '发射 workflow:execute:complete 事件失败', e)
            }
        }
    })
}
</script>
<style scoped>
.list-view {
    background-color: rgba(var(--color-bg-rgb), 0.5);
    width: 100%;
    height: 100vh;
    display: flex;
    gap: 10px;
    padding: 10px;
    box-sizing: border-box;
}

/* 左侧标签面板 */
.left-panel {
    padding: 10px;
    background: rgba(var(--color-card-rgb), 0.5);
    box-shadow: 0 0 5px var(--color-shader);
    backdrop-filter: blur(10px);
    height: calc(100vh - 40px);
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
}

.tabs-body {
    height: 100%;
    margin-top: 30px;
    display: flex;
    flex-direction: column;
    gap: 8px
}
.tabs-body > div {
    flex: 1;
}

.tab-item {
    transition: background 0.2s, color 0.2s, opacity 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    border-radius: 8px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-font-2);
    font-size: 0.8rem;
}
.tab-item.active {
    background: var(--color-main);
    color: var(--color-font-r);
}
.tab-item:hover {
    background: var(--color-card-1);
    color: var(--color-font);
}
.tab-item.active:hover {
    background: var(--color-main);
    color: var(--color-font-r);
    opacity: 0.9;
}

/* 右侧主区域 */
.right-content {
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.content-controller {
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px
}
.content-controller > span {
    color: var(--color-font);
    font-weight: bold;
    flex: 1;
}

.content-controller button {
    height: 32px;
    padding: 0 9px;
    border-radius: 32px;
    border: none;
    background: rgba(var(--color-card-rgb), 0.5);
    color: var(--color-font-2);
    cursor: pointer
}
.content-controller button > span {
    font-size: 0.7rem;
    margin-left: 5px;
}
.content-controller button:has(span) {
    padding: 0 10px 0 10px;
}


.content-controller label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(var(--color-card-rgb), 0.5);
}
.content-controller input {
    background: transparent;
    border: none;
    outline: none;
    color: var(--color-font)
}
.content-controller svg {
    color: var(--color-font-2);
    width: 13px;
    height: 13px;
}

.detail-card {
    background: rgba(var(--color-card-rgb), 0.5);
    box-shadow: 0 0 5px var(--color-shader);
    padding: 20px;
    border-radius: 10px
}

.workflow-description {
    color: var(--color-font-2);
    margin: 8px 0 16px
}

.workflow-info {
    margin: 12px 0
}

.info-item {
    padding: 8px 0;
    border-bottom: 1px solid var(--color-card-2)
}

.info-label {
    color: var(--color-font-2);
    font-size: 0.85rem
}

.info-value {
    color: var(--color-font);
    margin-left: 8px
}

.workflow-actions {
    display: flex;
    gap: 10px;
    margin-top: 14px
}

.btn-primary {
    background: var(--color-main);
    color: var(--color-font-r);
    padding: 8px 14px;
    border-radius: 6px
}

.btn-danger {
    background: rgba(255, 59, 48, 0.8);
    color: #fff;
    padding: 8px 14px;
    border-radius: 6px
}

/* 卡片网格 */
.workflow-grid .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    margin-top: 12px
}

.card {
    background: rgba(var(--color-card-rgb), 0.5);
    padding: 12px;
    border-radius: 7px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: space-between
}
.card-header {
    display: flex;
    align-items: center
}
.card-running,
.card-status,
.card-delete {
    cursor: pointer;
    margin-left: 5px;
    width: 25px;
    height: 25px;
    border-radius: 25px;
    border: 2px solid var(--color-card-2);
    background: var(--color-card-1);
}
.card-status {
    border: 2px solid transparent;
    width: fit-content;
    color: #000;
}
.card-status.red {
    background: #f8c7c7;
}
.card-status.green {
    background: #c6f1c2;
}
.card-title {
    font-weight: 600;
    flex: 1;
    color: var(--color-font)
}
.card-sub {
    color: var(--color-font-2);
    font-size: 0.85rem
}
.card-sub > svg {
    color: var(--color-font-2);
}
.card-body {
    margin: 8px 0;
    display: flex;

}
.card-body > div {
    flex: 1;
}
.card-body > div > p {
    color: var(--color-font-2);
    font-size: 0.9rem;
    max-height: 3.6em;
    overflow: hidden
}

.settings-panel {
    padding: 12px
}

.empty-tip {
    text-align: center;
    color: var(--color-font-2);
    padding: 18px
}
</style>
