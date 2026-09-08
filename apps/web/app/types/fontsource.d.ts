// Fontsource packages ship CSS only — their `exports` map resolves to `index.css`,
// so TypeScript has no declarations for the bare specifier and reports TS2882 on
// the side-effect imports in `app/root.tsx`. Subpath imports (`.../400.css`,
// `.../files/*.woff2?url`) are already covered by the `vite/client` wildcards.
declare module "@fontsource-variable/inter";
declare module "@fontsource/ibm-plex-mono";
declare module "@fontsource/material-symbols-rounded";
