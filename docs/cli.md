# CLI

onlyApi includes a command-line interface for scaffolding new projects and upgrading existing ones.

---

## Installation

The CLI is available via `bunx` (no installation required) or as a global install:

```bash
# Use directly (no install)
bunx onlyapi <command>

# Or install globally
bun install -g @tasvet/onlyapi
onlyapi <command>
```

---

## Commands

### `init`

Scaffold a new project with the full onlyApi structure.

```bash
bunx onlyapi init <project-name>
```

**Example**:

```bash
bunx onlyapi init my-api
```

This creates:

```
my-api/
├── package.json
├── tsconfig.json
├── biome.json
├── .env.example
├── .gitignore
├── src/
│   ├── main.ts
│   ├── cluster.ts
│   ├── core/
│   ├── application/
│   ├── infrastructure/
│   ├── presentation/
│   └── shared/
├── tests/
└── ...
```

**Next steps after init**:

```bash
cd my-api
bun install
cp .env.example .env
# Edit .env — set JWT_SECRET (min 32 chars)
bun run dev
```

### `upgrade`

Update the onlyApi framework internals while preserving your custom code.

```bash
bunx onlyapi upgrade
```

Run from inside your project directory. This updates:

- Core framework files
- Infrastructure adapters
- Middleware
- CLI tools
- TypeScript and Biome configurations

Your custom handlers, services, and entities are **not** overwritten.

### `help`

Show usage information.

```bash
bunx onlyapi help
```

```
onlyApi CLI

Usage:
  onlyapi init <name>    Create a new project
  onlyapi upgrade        Update framework files
  onlyapi help           Show this message
```

---

## Development CLI

When working inside the onlyApi source repository, use:

```bash
# Run CLI directly
bun src/cli/index.ts init my-project
bun src/cli/index.ts upgrade
bun src/cli/index.ts help

# Or via npm script
bun run cli init my-project
```
