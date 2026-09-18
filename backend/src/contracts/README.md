# API contracts

Response shapes shared by the backend and the frontend. Declared once so the
two sides cannot drift apart in authorship
([ADR 0037](../../../docs/decisions/0037-one-definition-of-an-api-shape.md)).

## Rules

1. **No imports.** Not from Drizzle, not from another contract, not from
   anywhere. The backend resolves `NodeNext` (relative imports need `.js`) and
   the frontend resolves `bundler`; a file with no specifiers has nothing to
   disagree about.

2. **No runtime code.** No constants, no helpers, no functions, no enums that
   emit JavaScript, no zod. If it compiles to JS it does not belong here.

3. **No Drizzle types, ever.** A shape that needs one is describing a table,
   not a response.

The service annotates its return type with the contract. That annotation is the
whole mechanism — a function that happens to return the right shape proves
nothing.
