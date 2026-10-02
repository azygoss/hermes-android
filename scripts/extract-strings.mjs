// Lists every t('…') source string so translations can be checked for gaps.
//   node scripts/extract-strings.mjs [--missing tr]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = []
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.tsx?$/.test(f) && files.push(join(d, f))))
walk('src')
const strings = new Set()
const re = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*?)\1/gs
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(re)) strings.add(m[2].replace(/\\'/g, "'").replace(/\\n/g, '\n'))
let out = [...strings].sort()
if (process.argv[2] === '--missing') {
  const src = readFileSync(`src/i18n/${process.argv[3]}.ts`, 'utf8')
  const catalog = new Function(`return ${src.slice(src.indexOf('{'))}`)()
  out = out.filter((s) => !(s in catalog))
}
console.log(JSON.stringify(out, null, 1))
console.error(`${out.length} strings`)
