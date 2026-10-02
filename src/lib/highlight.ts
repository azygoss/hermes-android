import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { Element, Root, RootContent } from 'hast'
import { createLowlight } from 'lowlight'

const lowlight = createLowlight({
  bash,
  c,
  cpp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
})
lowlight.registerAlias({
  bash: ['sh', 'zsh', 'console', 'terminal'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  typescript: ['ts', 'tsx'],
  python: ['py'],
  yaml: ['yml'],
  ini: ['toml', 'conf', 'env'],
  xml: ['html', 'svg'],
  markdown: ['md'],
  dockerfile: ['docker'],
})

/** Highlighting a very long block on every streamed chunk would stall the JS thread. */
const MAX_CHARS = 12_000

export interface Token {
  text: string
  /** Innermost highlight.js scope without the `hljs-` prefix, e.g. "keyword", "string". */
  scope?: string
}

function walk(nodes: RootContent[], scope: string | undefined, out: Token[]) {
  for (const node of nodes) {
    if (node.type === 'text') out.push({ text: node.value, scope })
    else if (node.type === 'element') {
      const cls = (node as Element).properties?.className
      const name = Array.isArray(cls) ? String(cls[0] ?? '').replace(/^hljs-/, '') : undefined
      walk(node.children, name || scope, out)
    }
  }
}

/** Tokens for a fenced code block, or null when the language is unknown or the block too big. */
export function highlight(code: string, language?: string): Token[] | null {
  const lang = language?.trim().toLowerCase().split(/\s+/)[0]
  if (!lang || code.length > MAX_CHARS || !lowlight.registered(lang)) return null
  try {
    const tree: Root = lowlight.highlight(lang, code)
    const out: Token[] = []
    walk(tree.children, undefined, out)
    return out
  } catch {
    return null
  }
}
