#!/usr/bin/env node
// Reads the documents a team says are right (a pricing PDF, a policy, a terms page saved as Markdown) into text, so the
// audit can compare the help center with them.
//   node ground.mjs <file.pdf|.md|.txt|.html> [more files] [--out help-center-audit-out]
// PDF text comes from `pdftotext` (poppler). Without it, read the PDF yourself and save a .txt beside it.
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { GROUND_PREFIX, htmlToPage, wordCount } from './lib.mjs'

const run = promisify(execFile)

export async function readGroundFile(file) {
  const ext = extname(file).toLowerCase()
  if (ext === '.pdf') {
    try {
      const { stdout } = await run('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { maxBuffer: 64 * 1024 * 1024 })
      const text = stdout.replace(/\f/g, '\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      if (!text) throw new Error(`${basename(file)} has no text layer (a scanned PDF?). Run OCR on it, then pass the text.`)
      return text
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error(`pdftotext is not installed, so ${basename(file)} cannot be read here. Install poppler (brew install poppler, apt install poppler-utils), or read the PDF and save its text as ${basename(file, ext)}.txt, then pass that.`)
      throw e
    }
  }
  const raw = await readFile(file, 'utf8')
  if (ext === '.html' || ext === '.htm') return htmlToPage(raw, 'https://local.invalid/').text
  if (['.md', '.markdown', '.txt', ''].includes(ext)) return raw.trim()
  throw new Error(`${basename(file)}: unsupported type "${ext}". Use .pdf, .md, .txt or .html.`)
}

export async function readGround(files, prefix = GROUND_PREFIX) {
  const used = new Set()
  const docs = []
  for (const f of files) {
    const text = await readGroundFile(f)
    let name = basename(f)
    for (let n = 2; used.has(name); n++) name = `${basename(f, extname(f))}-${n}${extname(f)}`
    used.add(name)
    docs.push({ url: prefix + name, name, words: wordCount(text), text })
  }
  return docs
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--out')
  const dir = i >= 0 ? argv[i + 1] : 'help-center-audit-out'
  const files = argv.filter((a, k) => !a.startsWith('--') && argv[k - 1] !== '--out')
  if (!files.length) { console.error('usage: ground.mjs <file.pdf|.md|.txt|.html> [more files] [--out dir]'); process.exit(2) }
  const docs = await readGround(files)
  await mkdir(join(dir, 'ground'), { recursive: true })
  await writeFile(join(dir, 'ground.json'), JSON.stringify({ documents: docs }, null, 2))
  await Promise.all(docs.map((d, k) => writeFile(join(dir, 'ground', `${String(k + 1).padStart(2, '0')}.txt`), `SOURCE: ${d.url}\n\n${d.text}\n`)))
  for (const d of docs) console.log(`${d.url}: ${d.words} words`)
  console.log(`Written to ${dir}/ (ground.json, ground/*.txt). Cite these in findings with the url shown, e.g. "${docs[0].url}".`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1) })
