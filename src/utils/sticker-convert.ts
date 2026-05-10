import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

export type StickerConversionTarget = 'png' | 'gif'

type ConvertJob = {
  input: string
  output: string
  settings?: {
    quality?: number
    transparent?: string
  }
}

type WebpConvInstance = {
  convertJobs: (jobs: ConvertJob | ConvertJob[]) => Promise<string | string[]>
}

type WebpConvConstructor = new (options?: {
  quality?: number
  transparent?: string
}) => WebpConvInstance

const require = createRequire(import.meta.url)
const WebpConv = require('@caed0/webp-conv') as WebpConvConstructor

export async function convertStickerWebp(buffer: Buffer, target: StickerConversionTarget): Promise<Buffer> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zyra-sticker-convert-'))
  const inputPath = path.join(tempDir, 'input.webp')
  const outputPath = path.join(tempDir, `output.${target}`)

  try {
    await fs.writeFile(inputPath, buffer)
    const converter = new WebpConv({ quality: 90, transparent: '0x000000' })
    await converter.convertJobs({
      input: inputPath,
      output: outputPath,
    })
    return await fs.readFile(outputPath)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

