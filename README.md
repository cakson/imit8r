# Imit8r

**Imit8r** is a lightweight GraphQL server that **mocks your schema on demand**.  
Swap mock variants at request-time, forward individual fields to a live API, and prototype complex client flows without touching application code.

---

## ✨ Key Features

| Capability | Details |
| -----------|---------|
| **Multiple mock variants** | Provide any number of per-field or per-type variants (`0.ts`, `1.ts`, …). |
| **Per-request switching** | Select variants via a `mock_config` cookie—no server restart required. |
| **Passthroughs** | Use `-1` to delegate specific fields to a real GraphQL endpoint. |
| **File-based setup** | Plain `.graphql`, `.ts`, and `.yml` files—no databases or custom tooling. |

---

## 🚀 Quick Start

### 1 · Install dependencies

```bash
npm install
```

### 2 · Create a configuration file

```bash
cp config/config.example.yml config/config.yml
```

### 3 · Launch the server

```bash
npm start
```

Open **http://localhost:4001/graphql** to access Apollo Server’s GraphQL Playground (cookies are sent automatically so variant selection works out of the box).

> **Node 18 +** is recommended.  
> The server reloads on restart; use a Nodemon-like tool if you prefer live-reload in development.

---

## 🐳 Running with Docker

A `Dockerfile` and `docker-compose.yml` are included for local development.

### Build & run

```bash
docker build -t imit8r .
docker run -p 4001:4001 imit8r
```

### docker compose (hot-reloading)

```bash
docker compose up
```

The compose file mounts `schema/`, `mocks/`, `config/`, and `example/`, so you can edit sources without rebuilding.  
`config/config.yml` is **.dockerignore-d**; your local secrets never enter the image.

---

## 🔗 Linking mocks from another repository

If your application already owns `mocks/` and `schema/`, point Imit8r at them with symlinks:

```bash
export APP_MOCK_ROOT=/path/to/your/app
npm run link
```

The script creates or updates `mocks → $APP_MOCK_ROOT/mocks` and `schema → $APP_MOCK_ROOT/schema`.  
Both links are **git-ignored**, so switching projects is as simple as changing `APP_MOCK_ROOT` and rerunning the command.

---

## 🗂 Project Layout

```
.
├── example/         Sample schema & mocks (toggle with use_example)
│   ├── schema/
│   └── mocks/
├── schema/          Your schema (symlink or dir, git-ignored)
├── mocks/           Your mocks  (symlink or dir, git-ignored)
├── config/          YAML configuration
└── server.ts        Imit8r implementation
```

---

## 📜 Schemas

* Set `use_example: true` in **config.yml** to load `example/schema/`.
* Set `use_example: false` to load **./schema/** instead (create or link it first).
* All `*.graphql` files in the chosen directory are merged at startup.

---

## 🧪 Writing Mocks

* **Field mock:** `mocks/<Type>/<field>/<variant>.ts`
* **Type  mock:** `mocks/<Type>/<variant>.ts`

```ts
// mocks/Query/user/0.ts   – success (default)
export default () => ({ id: "1", name: "Alice" });

// mocks/Query/user/1.ts   – not-found (throws)
import { GraphQLError } from "graphql";
export default () => { throw new GraphQLError("User not found"); };
```

* Variant numbers start at `0`; `0` is used when no variant is specified.
* Missing mocks fall back to **automatic data generation** based on the schema.

---

## ⚙️ Configuration (`config/config.yml`)

```yaml
use_example: true                 # load bundled samples
downstream_url: "http://localhost:4000/graphql"

mocks:
  Mutation:
    login: 0                      # default variant
```

| Key | Description |
|-----|-------------|
| **downstream_url** | Real GraphQL endpoint for passthroughs (`-1`). |
| **mocks** | Default variant per type/field (omit to use `0`). |
| **use_example** | `true` = sample schema/mocks, `false` = project files. |

Restart the server after editing the file.

---

## 🍪 Per-Request Variant Selection

Send a `mock_config` cookie whose JSON mirrors the `mocks` section:

```
mock_config={"Mutation":{"login":1},"Query":{"posts":-1}}
```

* Positive numbers pick a variant file.
* `-1` forwards the field to `downstream_url`.

---

## 🧩 Chrome Extension (optional)

The helper extension in **chrome-extension/** lets you:

1. Load your schema (for auto-completion).
2. Pick variant numbers in a UI.
3. Click **Apply** to set the `mock_config` cookie for the current tab.

The popup stores your last schema and selections, and shows a prettified JSON preview for copy-pasting. Variants left at `0` are omitted from the JSON.

---

## 🔄 Passthrough Example

Use live data for `Query.user`, mocks for everything else:

```
mock_config={"Query":{"user":-1}}
```

---

## 🛠 Development Notes

* Written in **TypeScript** and executed via **tsx**.
* Restart after changing schema or mocks (or add a watcher).
* Contribution guidelines live in [AGENTS.md](./AGENTS.md).

---

## 📄 License

MIT © 2025 Imit8r Contributors
