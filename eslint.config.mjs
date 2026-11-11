import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/** Configures linting for the TypeScript desktop application. */
export default tseslint.config(
  {
    ignores: [
      '.grove/**',
      'dist/**',
      'node_modules/**',
      'out/**',
      'src/desktop/**/*.cjs',
      'src/desktop/**/*.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/desktop/**/*.ts', 'src/desktop/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // The classic hook rules; compiler-only rules assume React Compiler, which this build does not use.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true, allowExportNames: ['useRecorder', 'useMeetingCapture'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  prettier,
)
