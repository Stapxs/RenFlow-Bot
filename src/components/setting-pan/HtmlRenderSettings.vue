<script setup lang="ts">
import Codemirror from 'codemirror-editor-vue3'

import { computed, ref } from 'vue'
import type { CmComponentRef } from 'codemirror-editor-vue3'
import type { Editor, EditorConfiguration } from 'codemirror'
import { useSanitizeHtml } from '@app/functions/utils/useSanitizeHtml'
import '@app/assets/css/codemirror-bcui.css'

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
