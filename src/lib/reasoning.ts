/**
 * Which reasoning-effort levels a model actually takes.
 *
 * The gateway only says whether a model reasons and whether that can be switched off; the level
 * sets themselves live in the backend's transports and provider profiles. This mirrors them
 * (hermes-agent: agent/reasoning_effort.py, agent/anthropic_adapter.py,
 * agent/transports/chat_completions.py, plugins/model-providers/*), so the picker offers what the
 * route sends instead of levels the backend would quietly clamp to something else.
 */

export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ReasoningCaps {
  reasoning?: boolean | null
  can_disable_reasoning?: boolean | null
}

const ALL: Effort[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const LOW_TO_HIGH: Effort[] = ['low', 'medium', 'high']

/** Level sets keyed by provider slug, for providers whose wire is the same for every model. */
const BY_PROVIDER: Record<string, Effort[]> = {
  'ollama-cloud': ['low', 'medium', 'high', 'max'],
  actual: ['low', 'medium', 'high', 'max'],
  'nebius-token-factory': LOW_TO_HIGH,
  upstage: LOW_TO_HIGH,
}
/** Wires with no "off" switch at all, whatever the catalog says. */
const NEVER_OFF = new Set(['meta-ai', 'xai', 'nebius-token-factory', 'upstage'])

const CLAUDE_MANUAL_THINKING = [
  'claude-3',
  'claude-opus-4-0',
  'claude-opus-4.0',
  'claude-opus-4-1',
  'claude-opus-4.1',
  'claude-sonnet-4-0',
  'claude-sonnet-4.0',
  'claude-opus-4-2025',
  'claude-sonnet-4-2025',
  'claude-opus-4-5',
  'claude-opus-4.5',
  'claude-sonnet-4-5',
  'claude-sonnet-4.5',
  'claude-haiku-4-5',
  'claude-haiku-4.5',
]
const CLAUDE_NO_XHIGH = ['claude-opus-4-6', 'claude-opus-4.6', 'claude-sonnet-4-6', 'claude-sonnet-4.6']

const has = (name: string, tokens: string[]) => tokens.some((token) => name.includes(token))

/** The graded levels (without "off") for a model, plus whether the wire can switch thinking off. */
function levels(provider: string, name: string): { efforts: Effort[]; off: boolean } {
  // OpenAI / Codex Responses, per model generation.
  if (provider === 'openai-codex' || /^(gpt-|o\d|codex)/.test(name)) {
    if (name.startsWith('gpt-6-astra') || name.startsWith('gpt-6.1-sol')) return { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], off: false }
    const top = name.includes('gpt-5.6') || name.startsWith('gpt-6-sol') || name.startsWith('gpt-6-luna') || name.startsWith('gpt-daybreak')
    return { efforts: top ? ['low', 'medium', 'high', 'xhigh', 'max'] : ['low', 'medium', 'high', 'xhigh'], off: true }
  }
  if (name.includes('claude')) {
    if (has(name, CLAUDE_MANUAL_THINKING)) return { efforts: ['low', 'medium', 'high', 'xhigh'], off: true }
    if (has(name, CLAUDE_NO_XHIGH)) return { efforts: ['low', 'medium', 'high', 'max'], off: true }
    return { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], off: !name.includes('claude-fable') }
  }
  if (name.includes('grok')) {
    const grok46 = name === 'grok-4.6' || name.startsWith('grok-4.6-')
    return { efforts: grok46 ? ['low', 'medium', 'high', 'xhigh'] : LOW_TO_HIGH, off: false }
  }
  if (name.startsWith('gemini-3')) {
    if (name.includes('flash')) return { efforts: LOW_TO_HIGH, off: true }
    if (name.includes('pro')) return { efforts: ['low', 'high'], off: true }
  }
  if (/(?:^|[^a-z0-9])k3(?:[^a-z0-9]|$)/.test(name)) return { efforts: ['low', 'high', 'max'], off: true }
  if (name.includes('kimi') || provider === 'kimi-coding') return { efforts: LOW_TO_HIGH, off: true }
  if (has(name, ['glm-5.3', 'glm-5-3', 'glm-5p3'])) return { efforts: ['low', 'medium', 'high', 'max'], off: true }
  if (has(name, ['glm-5.2', 'glm-5-2', 'glm-5p2'])) return { efforts: ['high', 'max'], off: true }
  if (name.includes('deepseek') || provider === 'deepseek') return { efforts: ['low', 'medium', 'high', 'max'], off: true }
  if (provider === 'meta-ai') return { efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'], off: false }
  if (BY_PROVIDER[provider]) return { efforts: BY_PROVIDER[provider], off: true }
  return { efforts: ALL, off: true }
}

/**
 * Levels to offer for `model` on `provider`, weakest first; "none" (thinking off) leads when the
 * model allows it. Empty when the model has no reasoning control at all.
 */
export function effortsFor(provider: string | null | undefined, model: string | null | undefined, caps?: ReasoningCaps | null): Effort[] {
  if (caps?.reasoning === false) return []
  const slug = (provider ?? '').trim().toLowerCase()
  // "vendor/model" on an aggregator: the model's own family decides the vocabulary.
  const name = (model ?? '').trim().toLowerCase().replace(/_/g, '-').split('/').pop() ?? ''
  const { efforts, off } = levels(slug, name)
  const canDisable = off && !NEVER_OFF.has(slug) && caps?.can_disable_reasoning !== false
  return canDisable ? ['none', ...efforts] : efforts
}
