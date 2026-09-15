# Bilikha — frontend

React 19 + TypeScript SPA, built with Vite. Consumes the Express API at
`/api/v1`.

```bash
npm run dev        # :5173, proxies /api to :4000
npm run build      # tsc -b && vite build
npm run lint       # oxlint
npm run preview    # serve the production build
```

The backend must be running for anything beyond static rendering. See
[../docs/getting-started/local-setup.md](../docs/getting-started/local-setup.md).

## Read before writing UI

- **[DESIGN.md](./DESIGN.md)** — the design system: tokens, rules, motion
  budget. Not optional reading.
- **[../docs/guides/add-a-ui-component.md](../docs/guides/add-a-ui-component.md)**
  — mechanics and the traps, including why you must never interpolate a Tailwind
  class name.
- **`/styleguide`** — every token and primitive rendered, at
  <http://localhost:5173/styleguide>. Not linked from the product.

## Layout

```
src/
├── components/ui/   primitives with no domain knowledge
├── features/        types + query hooks, one folder per feature
├── lib/             api client, query client, cn
├── pages/           route composition only
└── styles/          theme tokens, base, motion
```

Full documentation index: [../docs/](../docs/README.md)
