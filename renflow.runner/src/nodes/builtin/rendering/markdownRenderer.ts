import MarkdownIt from 'markdown-it'

export interface MarkdownRenderDocumentOptions {
    markdown: string
    width?: number
    theme?: string
    transparentBackground?: boolean
}

const DEFAULT_WIDTH = 800
const DEFAULT_THEME = 'default'

function normalizeWidth(width?: number): number {
    if (typeof width !== 'number' || Number.isNaN(width) || width <= 0) {
        return DEFAULT_WIDTH
    }

    return Math.max(320, Math.floor(width))
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;')
}

const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
    typographer: false
})

markdown.enable(['table', 'strikethrough'])

markdown.renderer.rules.table_open = () => '<div class="rf-md-table-wrap"><table class="rf-md-table">'
markdown.renderer.rules.table_close = () => '</table></div>'
markdown.renderer.rules.blockquote_open = () => '<blockquote class="rf-md-blockquote">'
markdown.renderer.rules.code_block = (tokens, idx) => {
    const content = escapeHtml(tokens[idx]?.content ?? '')
    return `<pre class="rf-md-code-block"><code>${content}</code></pre>\n`
}
markdown.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const info = (token.info || '').trim().split(/\s+/)[0]
    const className = info ? ` language-${escapeHtml(info)}` : ''
    return `<pre class="rf-md-code-block"><code class="${className.trim()}">${escapeHtml(token.content)}</code></pre>\n`
}

markdown.renderer.rules.image = (tokens, idx, _options, _env, self) => {
    const token = tokens[idx]
    token.attrJoin('class', 'rf-md-image')
    return self.renderToken(tokens, idx, _options)
}

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    token.attrJoin('class', 'rf-md-link')
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noreferrer noopener')
    return self.renderToken(tokens, idx, options)
}

markdown.renderer.rules.bullet_list_open = () => '<ul class="rf-md-list">'
markdown.renderer.rules.ordered_list_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrJoin('class', 'rf-md-list rf-md-list-ordered')
    return self.renderToken(tokens, idx, options)
}

markdown.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const nextToken = tokens[idx + 1]
    if (nextToken?.type === 'paragraph_open') {
        nextToken.attrJoin('class', 'rf-md-paragraph')
    }

    return self.renderToken(tokens, idx, options)
}

markdown.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrJoin('class', 'rf-md-paragraph')
    return self.renderToken(tokens, idx, options)
}

markdown.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrJoin('class', `rf-md-heading ${tokens[idx].tag}`)
    return self.renderToken(tokens, idx, options)
}

markdown.renderer.rules.code_inline = (tokens, idx) => `<code class="rf-md-inline-code">${escapeHtml(tokens[idx]?.content ?? '')}</code>`

markdown.renderer.rules.hr = () => '<hr class="rf-md-divider">\n'

markdown.core.ruler.after('inline', 'rf_task_list', (state) => {
    for (let i = 2; i < state.tokens.length; i += 1) {
        const token = state.tokens[i]
        if (token.type !== 'inline' || !token.children?.length) {
            continue
        }

        const parent = state.tokens[i - 1]
        if (!parent || parent.type !== 'paragraph_open') {
            continue
        }

        const firstChild = token.children[0]
        if (firstChild?.type !== 'text') {
            continue
        }

        const match = firstChild.content.match(/^\[( |x|X)\]\s+/)
        if (!match) {
            continue
        }

        parent.attrJoin('class', 'rf-md-task-paragraph')
        const listItemOpen = state.tokens[i - 2]
        if (listItemOpen?.type === 'list_item_open') {
            listItemOpen.attrJoin('class', 'rf-md-task-item')
        }

        firstChild.content = firstChild.content.slice(match[0].length)
        token.children.unshift(new state.Token('html_inline', '', 0))
        token.children[0].content = `<label class="rf-md-task"><input type="checkbox" disabled ${match[1].toLowerCase() === 'x' ? 'checked' : ''}><span>`
        token.children.push(new state.Token('html_inline', '', 0))
        token.children[token.children.length - 1].content = '</span></label>'
    }
})

export function renderMarkdownDocument(options: MarkdownRenderDocumentOptions): { html: string; body: string } {
    const width = normalizeWidth(options.width)
    const body = markdown.render(String(options.markdown || ''))
    const transparentBackground = !!options.transparentBackground
    const theme = options.theme || DEFAULT_THEME

    const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${escapeHtml(theme)}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Render</title>
    <style>
        :root {
            color-scheme: light;
            --rf-page-bg: ${transparentBackground ? 'transparent' : '#eef2f7'};
            --rf-card-bg: ${transparentBackground ? 'transparent' : '#ffffff'};
            --rf-text: #18212f;
            --rf-muted: #5c6777;
            --rf-border: #d7deea;
            --rf-divider: #e7edf5;
            --rf-quote-bg: #f5f8fc;
            --rf-quote-border: #98b3d1;
            --rf-code-bg: #0f1720;
            --rf-code-text: #d9e2f1;
            --rf-inline-code-bg: #eef3f8;
            --rf-inline-code-text: #22405e;
            --rf-link: #1b67c9;
            --rf-shadow: 0 18px 48px rgba(24, 33, 47, 0.12);
            --rf-radius: 20px;
            --rf-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif;
            --rf-mono: "SFMono-Regular", "SF Mono", "Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace;
        }
        * {
            box-sizing: border-box;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: var(--rf-page-bg);
        }
        body {
            width: ${width}px;
            font-family: var(--rf-font);
            color: var(--rf-text);
            line-height: 1.7;
            padding: 24px;
            overflow-wrap: anywhere;
        }
        .rf-md-card {
            width: 100%;
            background: var(--rf-card-bg);
            border: 1px solid var(--rf-border);
            border-radius: var(--rf-radius);
            box-shadow: var(--rf-shadow);
            overflow: hidden;
        }
        .rf-md-content {
            padding: 28px;
            font-size: 16px;
        }
        .rf-md-content > :first-child {
            margin-top: 0;
        }
        .rf-md-content > :last-child {
            margin-bottom: 0;
        }
        .rf-md-heading {
            margin: 1.5em 0 0.6em;
            line-height: 1.28;
            letter-spacing: -0.02em;
        }
        .rf-md-content h1 { font-size: 2em; }
        .rf-md-content h2 { font-size: 1.55em; }
        .rf-md-content h3 { font-size: 1.25em; }
        .rf-md-content h4,
        .rf-md-content h5,
        .rf-md-content h6 { font-size: 1.05em; }
        .rf-md-paragraph,
        .rf-md-list,
        .rf-md-blockquote,
        .rf-md-table-wrap,
        .rf-md-code-block {
            margin: 0 0 1em;
        }
        .rf-md-list {
            padding-left: 1.5em;
        }
        .rf-md-list li + li {
            margin-top: 0.45em;
        }
        .rf-md-task-item {
            list-style: none;
            margin-left: -1.45em;
        }
        .rf-md-task {
            display: inline-flex;
            align-items: flex-start;
            gap: 0.65em;
        }
        .rf-md-task input {
            margin-top: 0.32em;
            width: 15px;
            height: 15px;
        }
        .rf-md-task-paragraph {
            margin-bottom: 0;
        }
        .rf-md-blockquote {
            padding: 14px 18px;
            border-left: 4px solid var(--rf-quote-border);
            background: var(--rf-quote-bg);
            color: var(--rf-muted);
            border-radius: 12px;
        }
        .rf-md-inline-code {
            font-family: var(--rf-mono);
            padding: 0.15em 0.4em;
            border-radius: 6px;
            background: var(--rf-inline-code-bg);
            color: var(--rf-inline-code-text);
            font-size: 0.92em;
            word-break: break-word;
        }
        .rf-md-code-block {
            padding: 18px 20px;
            background: var(--rf-code-bg);
            color: var(--rf-code-text);
            border-radius: 14px;
            overflow-x: auto;
        }
        .rf-md-code-block code {
            font-family: var(--rf-mono);
            font-size: 13px;
            line-height: 1.65;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .rf-md-table-wrap {
            width: 100%;
            overflow-x: auto;
            border: 1px solid var(--rf-border);
            border-radius: 14px;
        }
        .rf-md-table {
            width: 100%;
            border-collapse: collapse;
            min-width: 100%;
            background: var(--rf-card-bg);
        }
        .rf-md-table th,
        .rf-md-table td {
            padding: 12px 14px;
            border-bottom: 1px solid var(--rf-divider);
            text-align: left;
            vertical-align: top;
        }
        .rf-md-table tr:last-child td {
            border-bottom: none;
        }
        .rf-md-table th {
            background: #f8fafc;
            font-weight: 700;
        }
        .rf-md-link {
            color: var(--rf-link);
            text-decoration-thickness: 0.08em;
            text-underline-offset: 0.18em;
            word-break: break-all;
        }
        .rf-md-image {
            display: block;
            max-width: 100%;
            height: auto;
            border-radius: 12px;
            margin: 1em 0;
        }
        .rf-md-divider {
            border: none;
            border-top: 1px solid var(--rf-divider);
            margin: 1.5em 0;
        }
    </style>
</head>
<body>
    <article class="rf-md-card">
        <section class="rf-md-content">${body}</section>
    </article>
</body>
</html>`

    return {
        html,
        body
    }
}
