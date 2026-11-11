import { describe, expect, test } from 'vitest'

import { inferenceBaseUrlSchema } from './protocol'

describe('inferenceBaseUrlSchema', () => {
  test('allows HTTPS anywhere and plain HTTP only on loopback', () => {
    for (const value of ['https://api.example.test/v1', 'http://127.0.0.1:11434/v1', 'http://localhost:8000', 'http://[::1]:9000/v1']) {
      expect(inferenceBaseUrlSchema.safeParse(value).success).toBe(true)
    }
    for (const value of ['http://api.example.test/v1', 'http://192.168.1.4:11434', 'https://user:pass@api.example.test', 'https://api.example.test/v1?key=x', 'ftp://api.example.test']) {
      expect(inferenceBaseUrlSchema.safeParse(value).success).toBe(false)
    }
  })
})
