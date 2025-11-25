<script setup lang="ts">
import Codemirror from 'codemirror-editor-vue3'

import { computed, ref } from 'vue'
import type { CmComponentRef } from 'codemirror-editor-vue3'
import type { Editor, EditorConfiguration } from 'codemirror'
import { useSanitizeHtml } from '@app/functions/utils/useSanitizeHtml'

import 'codemirror/mode/xml/xml.js'
import 'codemirror/mode/javascript/javascript.js'
import 'codemirror/mode/css/css.js'
import 'codemirror/mode/htmlmixed/htmlmixed.js'

interface Props {
    nodeId: string
    params?: any[]
    modelValue: Record<string, any>
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'update:model-value', value: Record<string, any>): void
}>()

const { sanitize } = useSanitizeHtml()
const template = ref(props.modelValue.template || '')
const sanitizedHtml = computed(() => sanitize(template.value))

const code = computed<string>({
    get() {
        return template.value
    },
    set(val: string) {
        template.value = val
        emit('update:model-value', {
            ...props.modelValue,
            template: val,
        })
    },
})
const cmRef = ref<CmComponentRef>();
const cmOptions: EditorConfiguration = {
    mode: 'htmlmixed',
    indentUnit: 4,
    smartIndent: true,
};

const onReady = (cm: Editor) => {
    cm.setOption('theme', 'bcui')
};
</script>

<template>
    <div class="html-editor">
        <div>
            <Codemirror ref="cmRef"
                v-model:value="code"
                :options="cmOptions"
                height="57vh"
                @ready="onReady" />
        </div>
        <div v-html="sanitizedHtml" />
    </div>
</template>

<style scoped>
.html-editor {
    flex-direction: row;
    display: flex;
}

.html-editor > div:first-child {
    width: 40vw;
}
.html-editor > div:last-child {
    background-image:
        radial-gradient(circle, #ccc 1px, transparent 1px),
        repeating-linear-gradient(to right, transparent 0 20px, black 20px 20px),
        repeating-linear-gradient(to bottom, transparent 0 20px, black 20px 20px);
    background-size:
        20px 20px,
        20px 20px,
        20px 20px;
    border: 2px solid var(--color-card-2);
    border-radius: 7px;
    margin-left: 10px;
    overflow: scroll;
    padding: 10px;
    width: 30vw;
}
.html-editor > div::-webkit-scrollbar {
    height: 7px;
}
</style>
<style>
/* 定义主题变量 */
div.cm-s-bcui.CodeMirror {
    --bg0: var(--color-main);
    --bg4: var(--color-font-3);
    --fg: var(--color-font);
    --fg3: var(--color-font-1);
    --gray: #bac2de;
    --blue: #89b4fa;
    --yellow: #f9e2af;
    --aqua: #89b4fa;
    --orange: #fab387;
    --primary-bg: transparent;
    --current-line: var(--color-card-1);
    --selection: var(--color-card-2);
    --atom: #b4befe;
    --cursor: #7f849c;
    --keyword: #f38ba8;
    --operator: #89dceb;
    --number: #fab387;
    --definition: #89b4fa;
    --string: #a6e3a1;
    --font-family: 'Maple Mono', 'Fira Code', monospace;
}

/* 基础样式 */
.cm-s-bcui.CodeMirror,
.cm-s-bcui .CodeMirror-gutters {
    background-color: var(--primary-bg);
    font-size: 0.9rem;
    color: var(--fg3);
}

.cm-s-bcui .CodeMirror-line {
    font-family: var(--font-family) !important;
}

/* 行号样式 */
.cm-s-bcui .CodeMirror-gutters {
    background: var(--primary-bg);
    border-right: 0px;
}

.cm-s-bcui .CodeMirror-linenumber {
    font-family: var(--font-family);
    color: var(--bg4);
}

/* 光标样式 */
.cm-s-bcui .CodeMirror-cursor {
    border-left: 2px solid var(--fg);
}

.cm-s-bcui.cm-fat-cursor .CodeMirror-cursor {
    background-color: var(--cursor) !important;
}

.cm-s-bcui .cm-animate-fat-cursor {
    background-color: var(--cursor) !important;
}

/* 选中文本样式 */
.cm-s-bcui div.CodeMirror-selected {
    background: var(--selection);
}

/* 语法高亮样式 */
.cm-s-bcui span.cm-meta {
    color: var(--blue);
}

.cm-s-bcui span.cm-comment {
    color: var(--gray);
}

.cm-s-bcui span.cm-number {
    color: var(--number);
}

.cm-s-bcui span.cm-atom {
    color: var(--atom);
}

.cm-s-bcui span.cm-keyword {
    color: var(--keyword);
}

.cm-s-bcui span.cm-variable {
    color: var(--fg);
}

.cm-s-bcui span.cm-variable-2 {
    color: var(--fg);
}

.cm-s-bcui span.cm-variable-3,
.cm-s-bcui .cm-s-gruvbox-dark span.cm-type {
    color: var(--yellow);
}

.cm-s-bcui span.cm-operator {
    color: var(--operator);
}

.cm-s-bcui span.cm-callee {
    color: var(--fg);
}

.cm-s-bcui span.cm-def {
    color: var(--definition);
}

.cm-s-bcui span.cm-property {
    color: var(--fg);
}

.cm-s-bcui span.cm-string {
    color: var(--string);
}

.cm-s-bcui span.cm-string-2 {
    color: var(--aqua);
}

.cm-s-bcui span.cm-qualifier {
    color: var(--aqua);
}

.cm-s-bcui span.cm-attribute {
    color: var(--aqua);
}

/* 当前行高亮 */
.cm-s-bcui .CodeMirror-activeline-background {
    background: var(--current-line);
    border-radius: 3px;
}

/* 匹配括号样式 */
.cm-s-bcui .CodeMirror-matchingbracket {
    background: var(--gray);
    color: var(--bg0) !important;
}

/* 内置函数和标签样式 */
.cm-s-bcui span.cm-builtin {
    color: var(--orange);
}

.cm-s-bcui span.cm-tag {
    color: var(--orange);
}
</style>
