# Imit8r

**Imit8r** is a lightweight GraphQL server that **mocks your schema on demand**.  
Swap mock variants at request-time, forward individual fields to a live API, and prototype complex client flows without touching application code.

---

## ✨ Key Features

| Capability                    | Details                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------|
| **Zero-config auto-mocking**  | Uses **[@graphql-tools/mock]** to generate realistic fake data for **every field** when no custom mock exists. |
| **Multiple mock variants**    | Provide any number of per-field or per-type variants (`0.ts`, `1.ts`, …).                         |
| **Per-request switching**     | Select variants via a `mock_config` cookie—no server restart required.                             |
| **Passthroughs** (Experimental)              | Use `-1` to delegate specific fields to a real GraphQL endpoint.                                   |
| **File-based setup**          | Plain `.graphql`, `.ts`, and `.yml` files—no databases or custom tooling.                          |

---

## 🚀 Quick Start

By default Imit8r boots with the **bundled samples** in `./example/` (schema **and** mocks).  
This lets you try the server immediately without creating any project files.

```bash
# 1. Install
npm install

# 2. Copy the default config
cp config/config.example.yml config/config.yml

# 3. Launch
npm start
```

Open **http://localhost:4001/graphql** to explore the API in Apollo Playground.  
Cookies are sent automatically, so the `mock_config` cookie works out of the box.

> Use a watcher such as `nodemon` for live-reload if desired.

---

## 🐳 Running with Docker

A `Dockerfile` and `docker-compose.yml` are included for local development.

### Build & run

```bash
docker build -t imit8r .
docker run -p 4001:4001 imit8r
```

### docker compose (live editing)

```bash
docker compose up -d
```

The compose file **mounts** `schema/`, `mocks/`, `config/`, and `example/`, so you can edit files without rebuilding the image.

> **Important:** Imit8r loads schema and mocks **at startup**.  
> After adding or changing variants, schema, or configuration you **still need to restart** the container (`docker compose restart`) to see the changes. The mounts merely skip the rebuild step.

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

## 🔧 Customization

The default configuration uses the bundled examples:

```yaml
use_example: true
```

To plug in **your own schema and mocks**:

1. **Toggle the flag**

   ```yaml
   use_example: false
   ```

2. **Create folders** (both are in `.gitignore`):

   ```bash
   mkdir schema mocks
   ```

   – or –

   **Symlink** to an existing project:

   ```bash
   export APP_MOCK_ROOT=/path/to/your/app   # contains mocks/ and schema/
   npm run link
   ```

3. **Add/merge GraphQL files**

    * All `*.graphql` files inside `schema/` (or the symlink) are merged at startup.
    * Place mock files inside `mocks/` following the structure described below.

4. **Restart the server** (or container) to load the new assets.

---

## 🧪 Writing & Overriding Mocks

> **No mocks? No problem!**  
> Imit8r auto-mocks every field using **[@graphql-tools/mock]**, so you get realistic data out of the box.  
> Add mock files **only** when you need deterministic values or error cases.

* **Field mock:** `mocks/<Type>/<field>/<variant>.ts`
* **Type  mock:** `mocks/<Type>/<variant>.ts`

```ts
// mocks/Query/user/0.ts   – success (default)
export default () => ({ id: "1", name: "Alice" });

// mocks/Query/user/1.ts   – not-found (throws)
import { GraphQLError } from "graphql";
export default () => { throw new GraphQLError("User not found"); };
```

* Variant numbers start at **0**; `0` is used when no variant is specified.
* Missing mocks fall back to the **auto-mocked** data generated from the schema.

---

## ⚙️ Configuration (`config/config.yml`)

```yaml
use_example: false                 # load project files
downstream_url: "http://localhost:4000/graphql"

mocks:
  Mutation:
    login: 0                       # default variant
```

| Key               | Description                                                      |
|-------------------|------------------------------------------------------------------|
| `downstream_url`  | Real GraphQL endpoint for passthroughs (`-1`).                   |
| `mocks`           | Default variant per type/field (omit to use `0`).                |
| `use_example`     | `true` = sample schema/mocks, `false` = project files/symlinks.  |

Restart the server after editing the file.

---

## 🍪 Per-Request Variant Selection

Send a **`mock_config` cookie** whose JSON mirrors the `mocks` section:

```
mock_config={"Mutation":{"login":1},"Query":{"posts":-1}}
```

* Positive numbers pick a variant file.
* `-1` forwards the field to `downstream_url`.

---

## 🧩 Chrome Extension

A helper extension lives in **chrome-extension/**.

### Installation

1. Open **`chrome://extensions`** in Chrome.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and select the `chrome-extension/` folder.

### Usage

1. Upload your schema (for auto-completion).
2. Pick variant numbers in the form.
3. Click **Apply** – the extension sets the `mock_config` cookie for the active tab.

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

---

## 📄 License

MIT © 2025 Imit8r Contributors

[@graphql-tools/mock]: https://www.graphql-tools.com/docs/mocking/
