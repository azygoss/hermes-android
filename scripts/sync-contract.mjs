// Copy the generated gateway contract from a hermes-agent checkout.
//   HERMES_SRC=~/hermes-agent npm run sync-contract
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const src = process.env.HERMES_SRC ?? join(homedir(), 'dev/research/hermes-agent')
const body = readFileSync(join(src, 'apps/shared/src/gateway-contract.generated.ts'), 'utf8')
const header =
  '// Copied from NousResearch/hermes-agent apps/shared/src/gateway-contract.generated.ts (MIT).\n' +
  '// Refresh with `npm run sync-contract`; do not edit by hand.\n'
writeFileSync('src/lib/gateway/contract.generated.ts', header + body)
console.log('contract synced from', src)
