import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		// The obsidian package ships type definitions only; tests use a minimal stub.
		alias: { obsidian: fileURLToPath(new URL('./tests/support/obsidian-stub.ts', import.meta.url)) },
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
	},
});
