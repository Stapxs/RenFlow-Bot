<template>
    <div v-if="show" class="activity-preview-mask" @click.self="close">
        <div class="activity-preview-dialog ss-card">
            <header>
                <span>运行活动预览</span>
                <button class="close-btn" @click="close">
                    <font-awesome-icon :icon="['fas', 'times']" />
                </button>
            </header>
            <div class="activity-content">
                <div v-if="!hasActivity" class="no-activity">
                    <font-awesome-icon :icon="['fas', 'circle-pause']" />
                    <span>当前没有正在运行的节点</span>
                </div>
                <div v-else class="activity-list">
                    <div v-for="item in activityList" :key="item.nodeId" class="activity-item">
                        <div class="activity-header">
                            <div class="node-info">
                                <font-awesome-icon :icon="['fas', item.icon || 'cube']" />
                                <span class="node-name">{{ item.nodeName }}</span>
                            </div>
                            <div class="activity-status">
                                <span :class="['status-badge', item.status]">
                                    {{ statusText[item.status] }}
                                </span>
                                <span v-if="item.status === 'timestamp'" class="elapsed-time">
                                    {{ formatTimestamp(item.startTime) }}
                                </span>
                                <span v-else-if="item.startTime" class="elapsed-time">
                                    {{ formatElapsed(item) }}
                                </span>
                            </div>
                        </div>
                        <div v-if="item.params && Object.keys(item.params).length > 0" class="params-section">
                            <div class="section-title">参数</div>
                            <div class="params-list">
                                <div v-for="(value, key) in item.params" :key="key" class="param-row">
                                    <span class="param-key">{{ key }}</span>
                                    <span class="param-value">{{ formatValue(value) }}</span>
                                </div>
                            </div>
                        </div>
                        <div v-if="item.input" class="input-section">
                            <div class="section-title">输入数据</div>
                            <pre class="data-preview">{{ JSON.stringify(item.input, null, 2) }}</pre>
                        </div>
                        <div v-if="item.error" class="error-section">
                            <div class="section-title">错误信息</div>
                            <div class="error-message">{{ item.error }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

defineProps<{
    show: boolean
}>()

const emit = defineEmits<{
    (e: 'update:show', value: boolean): void
}>()

const activityList = ref<any[]>([])
const currentTime = ref(Date.now())

const hasActivity = computed(() => activityList.value.length > 0)

const statusText: Record<string, string> = {
    running: '运行中',
    completed: '已完成',
    error: '错误',
    timestamp: '时间标记'
}

let updateInterval: any = null

onMounted(() => {
    // 每秒更新一次时间显示
    updateInterval = setInterval(() => {
        currentTime.value = Date.now()
    }, 1000)
})

onUnmounted(() => {
    if (updateInterval) {
        clearInterval(updateInterval)
    }
})

function close() {
    emit('update:show', false)
}

function formatValue(value: any): string {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function formatElapsed(item: any): string {
    let elapsed: number
    if (item.status === 'running') {
        // 运行中:显示动态计时
        elapsed = Math.floor((currentTime.value - item.startTime) / 1000)
    } else if (item.endTime) {
        // 已完成/错误:显示固定执行时长
        elapsed = Math.floor((item.endTime - item.startTime) / 1000)
    } else {
        return '-'
    }

    if (elapsed < 60) return `${elapsed}秒`
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    return `${minutes}分${seconds}秒`
}

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
}function addActivity(nodeId: string, nodeName: string, icon: string, params: any, input: any) {
    const existing = activityList.value.find(a => a.nodeId === nodeId && a.status === 'running')
    if (existing) return

    activityList.value.unshift({
        nodeId,
        nodeName,
        icon,
        params,
        input,
        output: null,
        error: null,
        status: 'running',
        startTime: Date.now()
    })
}

function updateActivity(nodeId: string, status: 'completed' | 'error', data?: any) {
    const activity = activityList.value.find(a => a.nodeId === nodeId && a.status === 'running')
    if (!activity) return

    activity.status = status
    activity.endTime = Date.now()
    if (status === 'completed') {
        activity.output = data?.output
    } else if (status === 'error') {
        activity.error = data?.error
    }
}

function clearActivities() {
    activityList.value = []
}

function addTimestamp() {
    activityList.value.unshift({
        nodeId: `timestamp-${Date.now()}`,
        nodeName: '执行开始',
        icon: 'clock',
        params: null,
        input: null,
        output: null,
        error: null,
        status: 'timestamp',
        startTime: Date.now()
    })
}

defineExpose({
    addActivity,
    updateActivity,
    clearActivities,
    addTimestamp
})
</script>

<style scoped>
.activity-preview-mask {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(var(--color-card-rgb), 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
}

.activity-preview-dialog {
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease;
}

.activity-preview-dialog header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(var(--color-font-2-rgb), 0.1);
}

.activity-preview-dialog header span {
    font-size: 1.1rem;
    font-weight: bold;
    color: var(--color-font);
}

.close-btn {
    background: none;
    border: none;
    color: var(--color-font-2);
    cursor: pointer;
    padding: 5px 10px;
    font-size: 1.2rem;
    transition: color 0.2s;
}

.close-btn:hover {
    color: var(--color-font);
}

.activity-content {
    overflow-y: auto;
    padding: 20px;
    flex: 1;
}

.no-activity {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--color-font-2);
}

.no-activity svg {
    font-size: 3rem;
    margin-bottom: 15px;
    opacity: 0.5;
}

.no-activity span {
    font-size: 0.95rem;
}

.activity-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.activity-item {
    background: rgba(var(--color-card-2-rgb), 0.5);
    border-radius: 8px;
    padding: 15px;
    border-left: 3px solid var(--color-main);
}

.activity-item .activity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.node-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.node-info svg {
    color: var(--color-main);
    font-size: 0.9rem;
}

.node-name {
    font-weight: bold;
    color: var(--color-font);
    font-size: 0.95rem;
}

.activity-status {
    display: flex;
    align-items: center;
    gap: 10px;
}

.status-badge {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
}

.status-badge.running {
    background: rgba(var(--color-main-rgb), 0.2);
    color: var(--color-main);
}

.status-badge.completed {
    background: rgba(52, 199, 89, 0.2);
    color: #34c759;
}

.status-badge.error {
    background: rgba(255, 59, 48, 0.2);
    color: #ff3b30;
}

.status-badge.timestamp {
    background: rgba(var(--color-font-2-rgb), 0.1);
    color: var(--color-font-2);
}

.elapsed-time {
    font-size: 0.8rem;
    color: var(--color-font-2);
}

.section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-font-2);
    margin-bottom: 8px;
    margin-top: 12px;
}

.params-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.param-row {
    display: flex;
    gap: 10px;
    font-size: 0.85rem;
}

.param-key {
    color: var(--color-font-2);
    min-width: 100px;
    font-weight: 500;
}

.param-value {
    color: var(--color-font);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.data-preview {
    background: rgba(var(--color-card-rgb), 0.5);
    border-radius: 6px;
    padding: 10px 20px;
    font-size: 0.8rem;
    color: var(--color-font);
    overflow: scroll !important;
    max-height: 200px;
    margin: 0;
}
.data-preview::-webkit-scrollbar {
    height: 0;
}

.error-message {
    background: rgba(255, 59, 48, 0.1);
    border-radius: 6px;
    padding: 10px;
    font-size: 0.85rem;
    color: #ff3b30;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slideUp {
    from {
        transform: translateY(20px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}
</style>
