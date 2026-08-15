// Types for `virtual:pwa-register`, which the layout imports to turn the service
// worker on.
//
// Its own file rather than a line in app.d.ts: that one has a top-level `export`,
// which makes it a module, and `declare module` inside a module is read as
// *augmenting* an existing one. A virtual module has no file to augment, so the
// declaration was ignored and svelte-check reported the import as unresolvable.
//
// Referenced rather than hand-written. The plugin ships these types, and a copy
// here would be a second source that drifts on the next upgrade.

/// <reference types="vite-plugin-pwa/client" />
