<script setup lang="ts">
import { ref, computed, watch } from 'vue'

defineProps<{
    modelValue: boolean
}>()

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    'create': [workflow: WorkflowConfig]
}>()

interface WorkflowConfig {
    triggerName: string
    triggerLabel: string  // 添加显示文本
    customTriggerName?: string
    name: string
    description: string
    timeout: number
}

// 表单数据
const formData = ref<WorkflowConfig>({
    triggerName: 'message',
    triggerLabel: '新消息 (message)',
    customTriggerName: '',
    name: '',
    description: '',
    timeout: 60000
})

// 触发名称选项（合并事件与通知类型）
const triggerNameOptions = computed(() => {
    return [
        { label: '新消息 (message)', value: 'message' },
        { label: '好友请求 (friend_request)', value: 'friend_request' },
        { label: '群邀请 (group_invite)', value: 'group_invite' },
        { label: '自定义', value: 'custom' }
    ]
})

// 监听触发名称变化,更新显示文本
watch(() => formData.value.triggerName, (newValue) => {
    const option = triggerNameOptions.value.find(opt => opt.value === newValue)
    if (option) {
        formData.value.triggerLabel = option.label
    }
})

// 是否显示自定义触发名称输入框
const showCustomTriggerName = computed(() => formData.value.triggerName === 'custom')

// 表单验证
const isValid = computed(() => {
    if (!formData.value.name.trim()) return false
    if (showCustomTriggerName.value && !formData.value.customTriggerName?.trim()) return false
    return true
})

// 关闭弹窗
const close = () => {
    emit('update:modelValue', false)
}

// 创建工作流
const create = () => {
    if (!isValid.value) return

    const workflow: WorkflowConfig = {
        triggerName: formData.value.triggerName,
        triggerLabel: formData.value.triggerLabel,
        customTriggerName: formData.value.customTriggerName,
        name: formData.value.name.trim(),
        description: formData.value.description.trim(),
        timeout: Math.max(1000, Number(formData.value.timeout) || 60000)
    }

    emit('create', workflow)
    emit('update:modelValue', false)

    // 重置表单
    formData.value = {
        triggerName: 'message',
        triggerLabel: '新消息 (message)',
        customTriggerName: '',
        name: '',
        description: '',
        timeout: 60000
    }
}
</script>

<template>
    <Teleport to="body">
        <div v-if="modelValue" class="workflow-dialog-overlay" @click.self="close">
            <div class="workflow-dialog-panel ss-card">
                <div class="dialog-header">
                    <h3>新建工作流</h3>
                    <button title="关闭" class="close-btn" @click="close">
                        <font-awesome-icon :icon="['fas', 'times']" />
                    </button>
                </div>

                <div class="dialog-body">
                    <!-- 触发名称 -->
                    <div class="form-item">
                        <label class="required">触发名称</label>
                        <select v-model="formData.triggerName">
                            <option
                                v-for="option in triggerNameOptions"
                                :key="option.value"
                                :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <!-- 自定义触发名称 -->
                    <div v-if="showCustomTriggerName" class="form-item">
                        <label class="required">自定义触发名称</label>
                        <input v-model="formData.customTriggerName"
                            type="text"
                            placeholder="请输入自定义触发名称">
                    </div>

                    <!-- 工作流名称 -->
                    <div class="form-item">
                        <label class="required">工作流名称</label>
                        <input v-model="formData.name"
                            type="text"
                            placeholder="请输入工作流名称">
                    </div>

                    <!-- 工作流备注 -->
                    <div class="form-item">
                        <label>备注</label>
                        <textarea
                            v-model="formData.description"
                            placeholder="请输入工作流备注(可选)"
                            rows="3" />
                    </div>

                    <div class="form-item">
                        <label>执行超时(ms)</label>
                        <input v-model.number="formData.timeout"
                            type="number"
                            min="1000"
                            step="1000"
                            placeholder="请输入工作流执行超时">
                    </div>
                </div>

                <div class="dialog-footer">
                    <button class="cancel-btn" @click="close">取消</button>
                    <button class="create-btn" :disabled="!isValid" @click="create">创建</button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* 使用与 NodeSettingsPanel 相同的样式 */
.workflow-dialog-overlay {
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
}

.workflow-dialog-panel {
    box-shadow: 0 0 5px var(--color-shader);
    background: var(--color-card);
    border-radius: 12px;
    min-width: 400px;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    padding: 10px;
}

.dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 20px 10px 20px;
    border-bottom: 1px solid var(--color-card-2);
    gap: 12px;
}

.dialog-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--color-font);
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
}

.close-btn {
    font-size: 1.1rem;
    background: transparent;
    border: none;
    color: var(--color-font-1);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s, color 0.2s;
    flex-shrink: 0;
}

.close-btn:hover {
    background: rgba(var(--color-main-rgb), 0.1);
    color: var(--color-font);
}

.dialog-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
}

.form-item {
    margin-bottom: 16px;
}

.form-item:last-child {
    margin-bottom: 0;
}

.form-item > label {
    display: block;
    font-size: 0.85rem;
    color: var(--color-font);
    margin-bottom: 6px;
    font-weight: 500;
}

.form-item > label.required::after {
    content: ' *';
    color: var(--color-main);
}

.form-item input[type="text"],
.form-item input[type="number"],
.form-item textarea,
.form-item select {
    width: 100%;
    background: var(--color-card-2);
    border: 1px solid var(--color-card-2);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 0.85rem;
    color: var(--color-font);
    outline: none;
    transition: border-color 0.2s, background 0.2s;
    box-sizing: border-box;
}

.form-item select {
    height: 36px;
}

.form-item input[type="text"]:focus,
.form-item textarea:focus,
.form-item select:focus {
    border-color: var(--color-main);
    background: var(--color-bg);
}

.form-item textarea {
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
}

.form-item select {
    cursor: pointer;
}

.dialog-footer {
    background: var(--color-card-1);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 15px 20px;
    margin: 0 -10px -10px -10px;
}

.dialog-footer button {
    padding: 6px 20px;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s, opacity 0.2s;
    font-weight: 500;
}

.cancel-btn {
    background: var(--color-card-2);
    color: var(--color-font);
}

.cancel-btn:hover {
    background: var(--color-card-1);
}

.create-btn {
    background: var(--color-main);
    color: var(--color-font-r);
}

.create-btn:hover:not(:disabled) {
    opacity: 0.9;
}

.create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.dialog-footer button:active:not(:disabled) {
    transform: scale(0.98);
}
</style>
