# Repository Guidelines

## Project Structure & Module Organization
This repository is currently in an early scaffolding phase. The root contains [README.md](/Users/ignacywielogorski/Developer/vibe-in-motion/README.md) for product intent and [package.json](/Users/ignacywielogorski/Developer/vibe-in-motion/package.json) for Node metadata and scripts. There is no `src/` or `tests/` directory yet; add them as features are implemented.

Prefer this layout as the codebase grows:
- `src/` for application code
- `src/integrations/` for Twilio, email parser, OpenAI, and deployment adapters
- `tests/` for automated tests
- `docs/` for design notes and operational runbooks

## Build, Test, and Development Commands
Use `pnpm` for all package management.

- `pnpm install` installs dependencies
- `pnpm test` runs the current placeholder test script and should fail until real tests are added
- `pnpm run <script>` should be used for future local dev, lint, and deploy workflows

When adding scripts, keep names predictable: `dev`, `build`, `lint`, `test`, `deploy`.

## Coding Style & Naming Conventions
Use JavaScript or TypeScript with 2-space indentation and semicolon-free style unless the existing file shows otherwise. Name files by responsibility:

- `kebab-case` for modules: `email-router.ts`
- `camelCase` for variables and functions
- `PascalCase` for classes and React components
- `SCREAMING_SNAKE_CASE` for environment variables

If you add formatting or linting, prefer `eslint` and `prettier`, and wire them into `package.json` scripts.

## Testing Guidelines
There is no test framework configured yet. Add tests alongside new functionality instead of postponing coverage. Place unit and integration tests under `tests/` and mirror source names, for example `tests/email-router.test.ts`.

Until a framework is chosen, contributors should treat `pnpm test` as required to update before opening a PR.

## Commit & Pull Request Guidelines
Follow the commit style already used in history: Conventional Commit prefixes with a scope, such as `chore(docs): add contributor guide`. Keep commits focused and descriptive.

Pull requests should include a short summary, linked issue or task when applicable, setup notes for reviewers, and screenshots or log snippets for user-visible or deployment-related changes.

## Security & Configuration Tips
Do not commit API keys, webhook secrets, or cluster credentials. Store secrets in environment variables and document required keys in `README.md` or a future `.env.example`.
