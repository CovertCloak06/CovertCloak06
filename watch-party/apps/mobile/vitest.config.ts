import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Only pure logic is unit-tested here; anything importing react-native is
// covered by typechecking and by the server's browser e2e harness, which runs
// the same injected controller and room client.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'] },
});
