<script setup lang="ts">
import Codemirror from 'codemirror-editor-vue3'

import type { Editor, EditorConfiguration } from 'codemirror'
import { computed } from 'vue'
import '@app/assets/css/codemirror-bcui.css'

import 'codemirror/mode/javascript/javascript.js'

interface Props {
    nodeId: string
    params?: any[]
    modelValue: Record<string, any>
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'update:model-value', value: Record<string, any>): void
}>()

const defaultCode = '// 编写你的代码\n// 可用变量:\n// - input: 输入数据\n// - context: 执行上下文\n// 返回处理后的数据\n\nreturn input'

const code = computed<string>({
    get() {
        return props.modelValue.code || defaultCode
    },
    set(val: string) {
        emit('update:model-value', {
            ...props.modelValue,
            code: val,
        })
    },
})

const cmOptions: EditorConfiguration = {
    mode: 'javascript',
    indentUnit: 4,
    smartIndent: true,
    lineNumbers: true,
}

const onReady = (cm: Editor) => {
    cm.setOption('theme', 'bcui')
}
</script>

<template>
    <div class="custom-js-editor">
        <div class="editor-help">
            <div>可用变量：`input`、`context`</div>
            <div>返回值会作为节点输出。</div>
        </div>
        <Codemirror
            v-model:value="code"
            :options="cmOptions"
            height="52vh"
            @ready="onReady" />
    </div>
</template>

<style scoped>
.custom-js-editor {
    display: flex;
    flex-direction: column;
    width: 70vw;
    gap: 10px;
}

.editor-help {
    background: rgba(var(--color-card-2-rgb), 0.35);
    border: 1px solid rgba(var(--color-font-rgb), 0.08);
    border-radius: 7px;
    color: var(--color-font-1);
    font-size: 0.75rem;
    line-height: 1.6;
    padding: 10px 12px;
}
</style>
