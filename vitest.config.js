import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The face matcher, the login lockout scheduler and slugify are the three
    // places where a silent regression is both easy and expensive, so they get
    // real tests. Everything else is exercised through the running app.
    include: ['server/tests/**/*.test.js'],
    environment: 'node',
    globals: false,
    reporters: 'default',
  },
});
