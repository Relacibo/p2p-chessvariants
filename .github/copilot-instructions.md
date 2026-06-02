# Copilot Instructions for p2p-chessvariants

## Layout

Every **page component** (a component rendered directly by a route) must call
`useConfigureLayout` as its first hook:

```tsx
import useConfigureLayout from "../layout/hooks";

export default function MyPageView() {
  useConfigureLayout(() => ({ navPinned: true })); // or false
  // ...
}
```

- `navPinned: true` — sidebar is always open on desktop and cannot be collapsed
  (use for content pages where the nav is always useful: lobby, community, settings, home)
- `navPinned: false` — sidebar collapses on navigation (use for focused full-screen views
  like playground or login)

## Language

All UI text must be in English. No German strings in the interface.

## API / Bebop Schemas

Bebop schemas live in `src/api/bebop/schemas/protocols/schemas/`.
After editing `.bop` files, regenerate with `bebopc build` from `src/api/bebop/`.

## Temporary scripts

Always create and run temporary scripts inside `/tmp/` (e.g. `cat << 'EOF' > /tmp/update.py`).
Never litter the workspace root with utility scripts.

## Error Handling

**Never silence errors.** Do not write empty `catch` blocks, `.catch(() => {})`, or `catch { /* ignore */ }`.
Every `catch` must at minimum `console.error(context, e)` with a descriptive context prefix.
In Rust, never use `.unwrap()` or `.expect()` in library/engine code — propagate via `?`.
Silencing errors hides bugs and makes debugging impossible.
