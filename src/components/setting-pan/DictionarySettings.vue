<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface DictionaryEntry {
    id: string
    key: string
    value: string
}

interface Props {
    nodeId: string
    params?: any[]
    modelValue: Record<string, any>
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'update:model-value', value: Record<string, any>): void
}>()

const createEntry = (entry?: Partial<DictionaryEntry>): DictionaryEntry => ({
    id: entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key: entry?.key || '',
    value: entry?.value || '',
})

const localTitle = ref(props.modelValue.title || '字典')
const localEntries = ref<DictionaryEntry[]>(
    Array.isArray(props.modelValue.entries) && props.modelValue.entries.length > 0
        ? props.modelValue.entries.map((entry: any) => createEntry(entry))
        : [createEntry()]
)

watch(() => props.modelValue, (newValue) => {
    localTitle.value = newValue?.title || '字典'
    localEntries.value = Array.isArray(newValue?.entries) && newValue.entries.length > 0
        ? newValue.entries.map((entry: any) => createEntry(entry))
        : [createEntry()]
}, { deep: true })

const validEntries = computed(() => localEntries.value.map(entry => ({
    key: entry.key,
    value: entry.value
})))

const emitUpdate = () => {
    emit('update:model-value', {
        ...props.modelValue,
        title: localTitle.value || '字典',
        entries: validEntries.value
    })
}

const updateTitle = (value: string) => {
    localTitle.value = value
    emitUpdate()
}

const updateEntry = (index: number, field: 'key' | 'value', value: string) => {
    localEntries.value[index][field] = value
    emitUpdate()
}

const addEntry = () => {
    localEntries.value.push(createEntry())
    emitUpdate()
}

const removeEntry = (index: number) => {
    if (localEntries.value.length === 1) {
        localEntries.value[0] = createEntry({ id: localEntries.value[0].id })
    } else {
        localEntries.value.splice(index, 1)
    }
    emitUpdate()
}
</script>

<template>
    <div class="dictionary-settings">
        <div class="form-group">
            <label>节点标题</label>
            <input
                :value="localTitle"
                type="text"
                placeholder="字典"
                @input="updateTitle(($event.target as HTMLInputElement).value)">
        </div>

        <div class="panel-tip">
            <div>值支持模板变量，例如 `{'{trigger.rawMessage}'}` 或 `{nodeId.field}`。</div>
            <div>输出会同时包含原始输入 `input` 和生成后的 `dictionary`。</div>
        </div>

        <div class="entries-header">
            <label>键值对</label>
            <button class="add-btn" @click="addEntry">
                <font-awesome-icon :icon="['fas', 'plus']" />
                添加
            </button>
        </div>

        <div class="entry-list">
            <div v-for="(entry, index) in localEntries" :key="entry.id" class="entry-card">
                <div class="entry-row">
                    <div class="field">
                        <label>键</label>
                        <input
                            :value="entry.key"
                            type="text"
                            placeholder="例如 userName"
                            @input="updateEntry(index, 'key', ($event.target as HTMLInputElement).value)">
                    </div>
                    <button class="remove-btn" title="删除键值对" @click="removeEntry(index)">
                        <font-awesome-icon :icon="['fas', 'trash']" />
                    </button>
                </div>
                <div class="field">
                    <label>值</label>
                    <input
                        :value="entry.value"
                        type="text"
                        placeholder="例如 {trigger.userName}"
                        @input="updateEntry(index, 'value', ($event.target as HTMLInputElement).value)">
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.dictionary-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.form-group,
.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.form-group label,
.field label,
.entries-header label {
    color: var(--color-font);
    font-size: 0.78rem;
    font-weight: 600;
}

.form-group input,
.field input {
    width: 100%;
    background: rgba(var(--color-card-2-rgb), 0.55);
    border: 1px solid rgba(var(--color-font-rgb), 0.1);
    border-radius: 6px;
    color: var(--color-font);
    font-size: 0.78rem;
    outline: none;
    padding: 8px 10px;
    transition: border-color 0.2s, background 0.2s;
}

.form-group input:focus,
.field input:focus {
    border-color: var(--color-main);
    background: rgba(var(--color-card-2-rgb), 0.8);
}

.panel-tip {
    background: rgba(var(--color-main-rgb), 0.08);
    border: 1px solid rgba(var(--color-main-rgb), 0.18);
    border-radius: 8px;
    color: var(--color-font-1);
    font-size: 0.72rem;
    line-height: 1.65;
    padding: 10px 12px;
}

.entries-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.entry-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 41vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 2px;
}

.entry-card {
    background: rgba(var(--color-card-2-rgb), 0.28);
    border: 1px solid rgba(var(--color-font-rgb), 0.08);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
}

.entry-card input {
    width: unset;
}

.entry-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
}

.entry-row .field {
    flex: 1;
}

.add-btn,
.remove-btn {
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s, opacity 0.2s;
}

.add-btn {
    align-items: center;
    background: rgba(var(--color-main-rgb), 0.14);
    color: var(--color-font);
    display: inline-flex;
    font-size: 0.75rem;
    gap: 6px;
    padding: 7px 10px;
}

.add-btn:hover {
    background: rgba(var(--color-main-rgb), 0.22);
}

.remove-btn {
    background: rgba(255, 99, 99, 0.12);
    color: #d55;
    flex-shrink: 0;
    height: 36px;
    opacity: 0.85;
    padding: 0 10px;
}

.remove-btn:hover {
    background: rgba(255, 99, 99, 0.2);
    opacity: 1;
}

.remove-btn:active,
.add-btn:active {
    transform: scale(0.98);
}
</style>
