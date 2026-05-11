<script setup lang="ts">
import { ref, watch } from 'vue'
import { Position, Handle, useVueFlow } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import type { NodeParam } from 'renflow-runner'

import NodeSettingsPanel from '../NodeSettingsPanel.vue'

const props = defineProps<NodeProps>()

// 从 data 中获取触发信息
const triggerType = props.data?.triggerType || '事件'
const triggerName = props.data?.triggerName || ''

// 设置弹窗状态与参数模型（使用通用 NodeSettingsPanel）
const showSettings = ref(false)
const localValues = ref<Record<string, any>>({
    filterParam: (props.data && props.data.filterParam) || '',
    filterMode: (props.data && props.data.filterMode) || 'regex',
    regexExpression: (props.data && props.data.regexExpression) || '',
    prefix: (props.data && props.data.prefix) || '',
    shellCommand: (props.data && props.data.shellCommand) || '',
    shellArgs: (props.data && props.data.shellArgs) || '',
    // 新增：消息类型 与 来源 ID
    messageType: (props.data && props.data.messageType) || '',
    targetId: (props.data && props.data.targetId) || '',
    // 新增：包含自己的开关（默认 false）
    includeSelf: (props.data && props.data.includeSelf) || false
})

// 定义传入 NodeSettingsPanel 的参数描述
// 如果是 message 触发器，则提供特定的过滤参数选项
let filterParamOptions = [] as any[]
if (triggerName === 'message') {
    filterParamOptions = [
        { label: '消息（message）', value: 'message' },
        { label: '消息类型（message.[*].type）', value: 'message.[*].type' },
        { label: '来源（targetId）', value: 'targetId' }
    ]
}

const params: NodeParam[] = [
    { key: 'filterParam', label: '过滤参数', type: 'select', options: filterParamOptions },
    {
        key: 'filterMode', label: '过滤模式', type: 'select', options: [
            { label: '正则表达式', value: 'regex' },
            { label: 'shell 命令解析', value: 'shell' }
        ], visibleWhen: { key: 'filterParam', value: 'message' }
    },
    { key: 'regexExpression', label: '正则表达式', type: 'input', placeholder: '请输入正则表达式', visibleWhen: { key: 'filterMode', value: 'regex' } },
    { key: 'prefix', label: '前缀', type: 'input', placeholder: '命令前缀（例如： /）', visibleWhen: { key: 'filterMode', value: 'shell' } },
    { key: 'shellCommand', label: '命令', type: 'input', placeholder: '命令（例如: mcinfo config）', visibleWhen: { key: 'filterMode', value: 'shell' },
        tip: 'shell 命令解析遵守 shell 规范格式（例如：/mcinfo config --address 127.0.0.1 -f），将从前往后匹配，忽略参数。如：填写 mcinfo 将会被以下命令触发 mcinfo、mcinfo config、mcinfo config --address 127.0.0.1' },
    { key: 'messageType', label: '消息类型', type: 'select', options: [] as any[], visibleWhen: { key: 'filterParam', value: 'message.[*].type' } },
    { key: 'targetId', label: '来源 ID', type: 'input', placeholder: '请输入来源 ID', visibleWhen: { key: 'filterParam', value: 'targetId' } },
    { key: 'includeSelf', label: '包含自己', type: 'switch', defaultValue: false }
]

const emit = defineEmits(['updateNodeInternals', 'updateTriggerOptions'])
const { updateNode } = useVueFlow()

// 当外部更新节点 data 时（例如 undo/redo），同步 localValues 保证面板打开时数据一致
watch(() => props.data, (d) => {
    if (!d) return
    localValues.value.filterParam = d.filterParam || ''
    localValues.value.filterMode = d.filterMode || ''
    localValues.value.regexExpression = d.regexExpression || ''
    localValues.value.prefix = d.prefix || ''
    localValues.value.shellCommand = d.shellCommand || ''
    localValues.value.shellArgs = d.shellArgs || ''
    localValues.value.messageType = d.messageType || ''
    localValues.value.targetId = d.targetId || ''
    localValues.value.includeSelf = !!d.includeSelf
}, { deep: true, immediate: true })

function openSettings(e?: Event) {
    if (e) e.stopPropagation()
    // 从 props.data 同步最新值
    localValues.value.filterParam = (props.data && props.data.filterParam) || ''
    localValues.value.filterMode = (props.data && props.data.filterMode) || ''
    localValues.value.prefix = (props.data && props.data.prefix) || ''
    // 同步新增字段
    localValues.value.messageType = (props.data && props.data.messageType) || ''
    localValues.value.targetId = (props.data && props.data.targetId) || ''
    showSettings.value = true
}

function closeSettings() {
    showSettings.value = false
}

function updateSettings(newValues: Record<string, any>) {
    // 将设置持久化到节点 data，保证加载时能拿到
    try {
        updateNode(props.id, {
            data: {
                ...props.data,
                filterParam: newValues.filterParam || '',
                filterMode: newValues.filterMode || '',
                regexExpression: newValues.regexExpression || '',
                prefix: newValues.prefix || '',
                shellCommand: newValues.shellCommand || '',
                shellArgs: newValues.shellArgs || '',
                // 持久化新增字段
                messageType: newValues.messageType || '',
                targetId: newValues.targetId || '',
                includeSelf: !!newValues.includeSelf
            }
        })
    } catch (e) {
        // fallback: emit event so parent can handle persistence
        emit('updateTriggerOptions', { filterParam: newValues.filterParam || '', filterMode: newValues.filterMode || '', messageType: newValues.messageType || '', targetId: newValues.targetId || '' })
    }
    emit('updateNodeInternals')
    showSettings.value = false
}
</script>

<template>
    <div class="trigger-node" @click.stop>
        <div class="trigger-type">{{ triggerType }}</div>
        <div class="trigger-name">{{ triggerName }}</div>
        <button class="settings-btn" @click.stop="openSettings">
            <span>过滤设置</span>
            <font-awesome-icon :icon="['fas', 'cog']" />
        </button>
    </div>

    <!-- 使用通用设置面板 -->
    <NodeSettingsPanel
        v-model="localValues"
        :pan-show="showSettings"
        :params="params"
        :node-id="props.id"
        @update:model-value="updateSettings"
        @close="closeSettings" />

    <Handle class="handle" type="source" :position="Position.Right" />
</template>

<style scoped>
.handle {
    top: 50%;
}

.trigger-node {
    background: var(--color-card);
    border-radius: 12px;
    padding: 12px 20px;
    box-shadow: 0 0 5px var(--color-shader);
    min-width: 150px;
    text-align: center;
}

.trigger-type {
    font-size: 0.75rem;
    opacity: 0.9;
    margin-bottom: 4px;
}

.trigger-name {
    border-top: 1px solid var(--color-card-2);
    font-size: 0.9rem;
    padding-top: 5px;
    font-weight: bold;
}

.settings-btn {
    cursor: pointer;
    height: 30px;
    margin: 10px -10px 0 -10px;
    padding: 0 15px;
    border-radius: 7px;
    width: calc(100% + 20px);
    background: var(--color-card-2);
    border: none;
    border-left: 7px solid var(--color-main);
    font-size: 1.3rem;
    display: flex;
    align-items: center;
}
.settings-btn > span {
    font-size: 0.75rem;
    text-align: left;
    flex: 1;
}
.settings-btn > svg {
    font-size: 0.75rem;
    color: var(--color-font);
}
</style>
