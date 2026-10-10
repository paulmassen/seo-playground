# Project identity during server operations

The UI's `active_project_id` is global. It is not a safe database selector after an `await`: another request can change it while a paid request is in flight.

## Entry-point contract

- Export server pages through `withProjectScope(Page)`. The wrapper captures the current project ID synchronously, before the page runs, including before `await searchParams`.
- Keep each project-aware server action an **exported async function**. Its first statement should be `return runWithCurrentProject(async () => { ... })`.
- For work with an explicit project ID, use `runInProjectScope(projectId, operation)` or the existing `...ForProject` database APIs. Nested current-project wrappers reuse the existing scope.
- Inside an operation, use `getCurrentProject()`, not `getActiveProject()`. Project settings, histories, caches, writes and implicit database access use this scoped identity automatically.
- Use `getActiveProject()` / `setActiveProject()` only for the global UI selection (ProjectSync, selector, project management). Credentials and other app-level settings remain global.

The implementation uses Node `AsyncLocalStorage.run`, not `enterWith`, so independent concurrent operations and nested scopes are isolated and restored even on exceptions or Next redirects. It stores an ID, not a SQLite handle. Every data-store access checks the project still exists before consulting cached handles or opening a file. A deleted scoped project throws `Project not found.` instead of falling back to another project or recreating the deleted project's file.

## Boundaries

This is not multi-user isolation, authorization, or a per-tab selection protocol. A newly submitted request captures the selection at **server operation entry**, not the selection when a browser form was first rendered. Existing authentication must still run before business operations; a scope itself grants no permission. Paid GET/POST behavior and queue error handling are unchanged.

A layout wrapper cannot scope independently rendered child Server Components. The wrappers cover the page function's own async work and helpers it invokes, not deferred child rendering, a later request, another process, or a job persisted for later execution. New data-loading child Server Components need an explicit project ID/scope; persisted jobs must keep their explicit project ID. Existing worker APIs already use explicit IDs and also benefit from the existence check.

The existence check prevents reopening a project deleted before access. It is not a distributed transaction coordinating file deletion with a simultaneous operation in another process. In-flight paid remote work is not cancelled or refunded when a project is deleted; its local write is rejected.

## Regression checks

`project-scope.test.ts` exercises simultaneous page-like operations with deferred parameters, switching across awaits, settings/history isolation, nested scopes, global selection semantics, exceptions, deletion with/without an already-open database, and the real Google Reviews paid server action with deferred fetch/JSON responses. `project-scope-coverage.test.ts` checks every dashboard page and action module by default, with explicit exemptions for global-only project management, credential saving, and the static On-Page hub. Future entry points must establish a scope or justify an exemption.
