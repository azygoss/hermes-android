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
import hljs from 'highlight.js/lib/core'

// Only these grammars ship; `lowlight`'s entry point imported all ~190 of them.
for (const [name, grammar] of Object.entries({
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
}))
  hljs.registerLanguage(name, grammar)
const ALIASES: Record<string, string[]> = {
  bash: ['sh', 'zsh', 'console', 'terminal'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  typescript: ['ts', 'tsx'],
  python: ['py'],
  yaml: ['yml'],
  ini: ['toml', 'conf', 'env'],
  xml: ['html', 'svg'],
  markdown: ['md'],
  dockerfile: ['docker'],
}
for (const [languageName, aliases] of Object.entries(ALIASES)) hljs.registerAliases(aliases, { languageName })

/** Highlighting a very long block on every streamed chunk would stall the JS thread. */
const MAX_CHARS = 12_000

export interface Token {
  text: string
  /** Innermost highlight.js scope without the `hljs-` prefix, e.g. "keyword", "string". */
  scope?: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" }

function decode(text: string) {
  return text.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, e: string) => ENTITIES[e])
}

/** Flattens highlight.js HTML (only nested `<span class>` and entities) into styled runs. */
function tokensOf(html: string): Token[] {
  const out: Token[] = []
  const scopes: (string | undefined)[] = []
  for (const m of html.matchAll(/<span class="([^"]+)">|<\/span>|[^<]+/g)) {
    if (m[1] !== undefined) scopes.push(m[1].split(' ')[0].replace(/^hljs-/, '') || scopes[scopes.length - 1])
    else if (m[0] === '</span>') scopes.pop()
    else out.push({ text: decode(m[0]), scope: scopes[scopes.length - 1] })
  }
  return out
}

/** Tokens for a fenced code block, or null when the language is unknown or the block too big. */
export function highlight(code: string, language?: string): Token[] | null {
  const lang = language?.trim().toLowerCase().split(/\s+/)[0]
  if (!lang || code.length > MAX_CHARS || !hljs.getLanguage(lang)) return null
  try {
    return tokensOf(hljs.highlight(code, { language: lang, ignoreIllegals: true }).value)
  } catch {
    return null
  }
}
