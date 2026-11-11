import { defineConfig } from 'vitest/config'

/** Configures unit tests for process-neutral desktop foundation modules. */
export default defineConfig({
  test: {
    include: ['src/desktop/**/*.{test,spec}.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
})
