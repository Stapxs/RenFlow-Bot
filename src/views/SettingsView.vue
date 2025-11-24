<template>
    <div class="settings-view">
        <BcTab title=" ">
            <div name="账号" class="bot-settings">
                <div class="ss-card">
                    <header>连接管理</header>
                    <div class="opt-item">
                        <div />
                        <font-awesome-icon :icon="['fas', 'add']" />
                        <div>
                            <span>新增连接</span>
                            <span>又要连接些什么呢 &gt;-&lt;</span>
                        </div>
                        <button class="ss-button" @click="openAddDialog">新增</button>
                    </div>
                    <table v-if="bots && bots.length > 0" class="bot-table ss-card">
                        <thead>
                            <tr>
                                <th style="width:35%">名称</th>
                                <th style="width:25%">类型</th>
                                <th style="width:20%">连接状态</th>
                                <th style="width:20%">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(b, idx) in bots" :key="b.id" class="bot-row">
                                <td>
                                    <span>{{ b.name }}</span>
                                </td>
                                <td>
                                    <span>{{ b.type }}</span>
                                </td>
                                <td>
                                    <span class="status" :class="{'connected': b.status === '已连接', 'connecting': b.status === '连接中'}">{{ b.status || '未连接' }}</span>
                                </td>
                                <td class="actions">
                                    <button @click="removeBot(idx)">删除</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Bot 添加弹窗 -->
                    <BotDialog v-model="showAddDialog" @save="onAddFromDialog" />
                </div>
                <div class="ss-card">
                    <header>连接设置</header>
                    <div class="opt-item">
                        <div />
                        <font-awesome-icon :icon="['fas', 'link']" />
                        <div>
                            <span>自动连接 </span>
                            <span>启动后自动连接启用的 Bot</span>
                        </div>
                        <label class="ss-switch">
                            <input
                                type="checkbox" name="opt_always_top">
                            <div>
                                <div />
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            <SsCard name="界面">这是界面设置</SsCard>
            <SsCard name="功能">这是功能设置</SsCard>
            <SsCard name="高级">这是高级设置</SsCard>
        </BcTab>
    </div>
</template>

<script setup lang="ts">
import BcTab from 'vue3-bcui/packages/bc-tab'
import SsCard from 'vue3-bcui/packages/ss-card'

import Option from '@app/functions/option'
import BotDialog from '@app/components/BotDialog.vue'
import { toast } from '@app/functions/toast'

import { ref, onMounted } from 'vue'

interface BotItem {
    id: string
    name: string
    type: string
    address: string
    token?: string
    status?: string
}

const bots = ref<BotItem[]>([])
const showAddDialog = ref(false)

function saveBots() {
    try {
    Option.save('bots', bots.value)
    toast.success('保存成功')
    } catch (e) {
    toast.error('保存失败')
    }
}

function openAddDialog() {
    showAddDialog.value = true
}

function onAddFromDialog(payload: { name: string; type: string; address: string; token?: string }) {
    if (!payload || !payload.name) return
    const id = 'bot-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    bots.value.push({ id, name: payload.name, type: payload.type || '', address: payload.address || '', token: payload.token || '', status: '未连接' })
    saveBots()
}

function removeBot(idx: number) {
    bots.value.splice(idx, 1)
    saveBots()
}

onMounted(async () => {
    await Option.load()

    const saved = Option.get('bots')
    if (saved && Array.isArray(saved)) {
        bots.value = saved
    }
    // 从 URL query 中读取传递的 bots 状态（id: status），优先用于显示
    try {
        const params = new URLSearchParams(window.location.search)
        const s = params.get('bots')
        if (s) {
            const map = JSON.parse(decodeURIComponent(s)) as { [id: string]: boolean }
            bots.value = (bots.value || []).map(b => ({ ...b, status: map[b.id] ? '已连接' : '未连接' }))
        }
    } catch (e) {
        // ignore parse errors
    }
})
</script>

<style scoped>
.ss-card {
    background: rgba(var(--color-card-rgb), 0.8);
    padding: 15px;
}
.ss-card header {
    font-size: 0.9rem;
    font-weight: bold;
}

.settings-view {
    background-color: rgba(var(--color-bg-rgb), 0.5);
    padding: 30px 10px 10px 10px;
    width: calc(100% - 20px);
    height: 100vh;
}

.bot-settings > div {
    margin-bottom: 10px;
}
.bot-table {
    background: var(--color-card-1);
    margin-top: 10px;
    width: 100%;
}
.bot-table th {
    font-size: 0.8rem;
    padding-left: 5px;
    text-align: left;
}
.bot-table button {
    background: var(--color-card-2);
    border-radius: 7px;
    border: 0;
}
.bot-row input,
.bot-row textarea,
.bot-row select {
    border: 1px solid rgba(var(--color-font-rgb), 0.1);
    background: rgba(var(--color-card-2-rgb), 0.5);
    transition: border-color 0.2s, background 0.2s;
    color: var(--color-font);
    border-radius: 5px;
    padding: 0 8px;
    font-size: 0.8rem;
    outline: none;
}
.bot-row input:focus,
.bot-row textarea:focus,
.bot-row select:focus {
    border-color: var(--color-main);
    background: rgba(var(--color-card-2-rgb), 0.8);
}
.bot-row input,
.bot-row select {
    height: 35px;
}
.bot-row textarea {
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
}
.bot-row select {
    cursor: pointer;
}
.bot-row span {
    font-size: 0.8rem;
}
</style>
<style>
.settings-view > div.tab-main > div:first-child {
    box-shadow: 0 0 5px var(--color-shader);
    background: rgba(var(--color-card-rgb), 0.5);
    padding: 0;
    margin: 0;
}
.settings-view > div.tab-main ul.tab-bar {
    margin: -20px -20px 10px -40px
}
.settings-view > div.tab-main ul.tab-bar > span {
    margin-left: 75px;
}
.settings-view > div.tab-main ul.tab-bar > li span,
.settings-view > div.tab-main ul.tab-bar > li svg {
    font-size: 0.85rem;
}
</style>
