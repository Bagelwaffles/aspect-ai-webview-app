# Browser Worker runtime compiler hotfix

The Browser Worker must run from JavaScript emitted by the TypeScript compiler (`tsc`), not directly through `tsx`/esbuild.

Reason: transpiler helpers such as `__name` can be injected into callback functions that Playwright serializes into `page.evaluate()`. Those helpers do not exist in the webpage JavaScript context and can cause read-only `describe` jobs to fail with `ReferenceError: __name is not defined`.

`npm start` and `npm run pair` therefore build `dist/index.js` with `tsc` before invoking Node. Browser Worker CI also compiles the worker and rejects `__name(` in the emitted JavaScript.
