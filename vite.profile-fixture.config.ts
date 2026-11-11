// ============ Development build: the Profile fixture ============
// A separate Vite config, used ONLY for the isolated Profile fixture. It differs
// from the app config in exactly one way: three modules are aliased to the dev
// mocks, so the real ProfilePage can draw its native, AI and install states
// without a Capacitor shell, a feed or a Chromium install prompt.
//
// WHY A SEPARATE CONFIG, NOT A FLAG IN THE APP. A URL flag read by `src/` would
// be a build-time switch inside the product, and a switch that can fake the
// platform is a switch that can lie in production. Here nothing under `src/`
// changes: the alias exists only in this file, which `npm run build` never reads.
// The production bundle is byte-identical in behaviour as a result, and the
// fixture is not in its import graph.
//
// WHAT IT STILL PROVES: layout, wrapping, touch targets and the rail's row set
// for a given state. WHAT IT DOES NOT PROVE: that the native runtime, the update
// feed or the install prompt behave this way on a device.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import packageJson from './package.json' with { type: 'json' }

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// The app config inlines the shipped version (the feedback mailto reads it).
// Without it `feedbackHref()` throws on the first render, so the fixture needs
// the same substitution to reach a painted page.
const APP_VERSION = packageJson.version

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    // The AI companion is a build-time flag, so it cannot be turned on per
    // request. The fixture compiles it on so the AI card can be laid out; the
    // SHIPPED build is untouched because this define exists only in the fixture
    // config, which the app's own build never loads.
    'import.meta.env.VITE_AI_COMPANION': JSON.stringify('on'),
  },
  resolve: {
    alias: [
      // Devices resolve aliases before the normal resolver, so each pattern is
      // anchored: an unanchored `/lib\/native$/` also swallows that specifier in
      // the mock itself and loops.
      { find: /^\.\.\/lib\/native\.ts$/, replacement: dir('./dev/mocks/native.ts') },
      { find: /^\.\.\/lib\/native$/, replacement: dir('./dev/mocks/native.ts') },
      { find: /^\.\.\/lib\/apkUpdateRuntime$/, replacement: dir('./dev/mocks/apkUpdateRuntime.ts') },
      { find: /^\.\.\/lib\/apkUpdateRuntime\.ts$/, replacement: dir('./dev/mocks/apkUpdateRuntime.ts') },
      { find: /^\.\.\/lib\/pwaInstall$/, replacement: dir('./dev/mocks/pwaInstall.ts') },
      { find: /^\.\.\/lib\/pwaInstall\.ts$/, replacement: dir('./dev/mocks/pwaInstall.ts') },
      // `src/lib/*` reaches its siblings as `./native`, so the sibling form needs
      // its own entry or the mock is bypassed from inside `src/lib`.
      { find: /^\.\/native$/, replacement: dir('./dev/mocks/native.ts') },
      { find: /^\.\/apkUpdateRuntime$/, replacement: dir('./dev/mocks/apkUpdateRuntime.ts') },
    ],
  },
  // The fixture is one page; no need for the app's build tuning.
  server: { port: 5199, strictPort: true },
  build: { sourcemap: true },
})
