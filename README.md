# cxConfig

**Secure, cached configuration loading with 1Password and Nunjucks templating for Node.js**

## Overview

`cxConfig` lets you store [TOML](https://toml.io/en/) configuration files in a [1Password Service Account](https://developer.1password.com/docs/service-accounts/), template them using [Nunjucks](https://mozilla.github.io/nunjucks/) (Ansible-style syntax) with .env variables, and load the final config **synchronously** into your Node.js application.

It’s designed to preserve the flexibility of dynamic configuration files while ensuring secrets are centrally managed and never stored in plain text on production servers.

---

## ✨ Features

* 🔒 Integrates with 1Password Service Accounts
* 📄 Supports TOML configuration files
* 🔁 Nunjucks-style variable templating (similar to Ansible's Jinja2)
* 🧊 Encrypted local caching to avoid hitting 1Password rate limits in the event of failure.
* 🧵 Optional synchronous config loading (using deasync)

---

## 📦 Why Use This?

Previously, Ansible was used to render `config.toml` files via Jinja2 and deploy them per server. This method required secrets to be present on orchestration hosts or stored in plain text on production servers.

With `cxConfig`, you can:

* Keep TOML configs in 1Password, fully templated and encrypted
* Avoid exposing secrets in `.toml` or `.env` files
* Load your config securely and synchronously at runtime
* Retain the flexibility of templated per-environment configuration

---

## 🧠 How It Works

1. A raw TOML file is stored in the **notes** field of a 1Password item.
2. The file is fetched using your `OP_SERVICE_ACCOUNT_TOKEN`.
3. The TOML is pre-processed using [Nunjucks](https://mozilla.github.io/nunjucks/) templates.
4. The final result is parsed into a JS object.
5. An optional local cache prevents repeated API calls and avoids 1Password rate limiting.

---

## 🧊 Caching Strategy

1Password Service Accounts are **rate limited**. During crash loops or misconfigurations, repeated requests can exhaust your quota, delaying recovery.

To prevent this, enable encrypted local caching by setting:

```dotenv
OP_CONFIG_CACHE=300
```

This caches the config file for 300 seconds. It’s encrypted using the same key that grants access to the service account. You can also set an `OP_CACHE_IV` to use a fixed IV.

---

## 🚀 Getting Started

### 1. Prerequisites

* A 1Password account with a Service Account configured
* Your TOML config stored in the **notes** field of a 1Password item

### 2. Environment Setup

Create a `.env` file in your project root:

**.env**
```dotenv
OP_SERVICE_ACCOUNT_TOKEN="ops_...a4bd"
OP_CONFIG_PATH="op://my-vault/my-item.toml/notes"
OP_CONFIG_CACHE=300
OP_CACHE_IV="d090bf1bf66a39f6589fe25a377927f3"
```

> `OP_CONFIG_PATH` should point to the vault/item/field path of your config file.

### 3. Accessing the Configuration

```js
// Async only needs to happen in the initial script
const config = await require('cx-config').read();
console.log(config)

// all other files (loaded after the promise)
const config = require('cx-config').readLoaded();

// --

// Alternative (Not suitable for forked/clustered processes, e.g pm2 cluster mode)
const config = await require('cx-config').deaSyncRead();

```

---

## 🧪 Example TOML (Stored in 1Password or locally) 

```toml
[database]
host = "{{ DB_HOST }}"
port = {{ DB_PORT }}
user = "{{ DB_USER }}"

password = "{{ DB_PASSWORD }}"  # Will read from DB_HOST in .env
# OR
password = "{{ 'op://my-vault/my-app/password' | op }}" # Will read from 1password
```

You can then set the corresponding `.env` values:

```dotenv
DB_HOST=db.internal
DB_PORT=5432
DB_USER=admin
DB_PASSWORD=supersecret
```

---

## 🔐 Security Philosophy

We designed `cxConfig` to:

* Remove secrets from source control and deployed environments
* Centralize secret management using tools your team already trusts
* Preserve the flexibility of environment-specific configuration

---

## 🛠️ Migrating from Ansible Templates

Previously:

* `config.toml` was rendered with Jinja2 (via Ansible) and deployed with the app.

Now:

* `config.toml` is stored raw in 1Password with Nunjucks placeholders.
* `.env` files are used to inject values.
* The app uses `cxConfig` to load and resolve config at runtime.

> This approach minimizes the number of secrets in deployment pipelines.

---

## 🐞 Debugging

```
CX_CONFIG_DUMP=true node my-app.js
```

---

## 📄 License

MIT License

---

Let me know if you'd like to include advanced usage (e.g. custom filters, cache encryption details, Nunjucks sandboxing), or a section on contributing/publishing.
