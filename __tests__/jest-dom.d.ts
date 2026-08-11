/// <reference types="@testing-library/jest-dom" />

/**
 * Bridge @testing-library/jest-dom matchers for Jest 30.
 *
 * jest-dom v6 augments `jest.Matchers`, but Jest 30's `@types/jest` v30
 * uses `JestMatchers`. This declaration merges the custom matchers into
 * the interface that Jest 30 actually uses.
 */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/types/matchers'

declare module 'expect' {
  interface Matchers<R extends void | Promise<void>>
    extends TestingLibraryMatchers<typeof expect.stringContaining, R> {}
}
