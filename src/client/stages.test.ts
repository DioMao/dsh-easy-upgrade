import { describe, expect, it } from 'vitest'
import { UPGRADE_STAGES } from '../progress.js'
import { en, zh } from './locales.js'
import { STAGE_LABEL_KEYS } from './stages.js'

describe('upgrade stage labels', () => {
  it('maps every runner stage to a label present in both dictionaries', () => {
    for (const stage of UPGRADE_STAGES) {
      const key = STAGE_LABEL_KEYS[stage]
      expect(key, stage).toBeTruthy()
      expect(zh[key], `${stage} (zh)`).toBeTruthy()
      expect(en[key], `${stage} (en)`).toBeTruthy()
    }
  })

  it('maps each stage to a distinct key', () => {
    const keys = Object.values(STAGE_LABEL_KEYS)
    expect(new Set(keys).size).toBe(keys.length)
  })
})