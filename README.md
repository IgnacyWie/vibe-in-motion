# 📱✉️ Omnichannel Vibecoding Agent

> An autonomous, event-driven DevOps pipeline that lets you write code and deploy to Kubernetes entirely via WhatsApp or Email forwarding.

## 📖 Project Overview

The **Omnichannel Vibecoding Agent** is designed to let developers fix bugs, tweak features, triage user reports, or push updates to a live application without ever opening a laptop or an IDE.

By texting a natural language command from your phone, or forwarding an error report email to a catchall address, this system autonomously handles the code generation, version control, and deployment on your behalf.

## ✨ What It Does

The pipeline operates in five fully automated stages:

### 1. Multi-Channel Message Reception

The agent listens on two secure channels:

- **WhatsApp:** You send a standard text message (e.g., _"Make the header text on the landing page slightly larger"_) to a dedicated Twilio number.
- **Catchall Email:** You forward a bug report or user email to your dedicated subdomain (e.g., `bugfix@agent.yourdomain.com`). An inbound parsing service (like Postmark or SendGrid) catches the email and routes the parsed body to the server.

### 2. Autonomous Code Generation

Once the system verifies your phone number or email address against a strict allowlist, it passes your prompt directly into the **OpenAI Codex CLI** running in headless "automation mode." The AI scans your local code repository, locates the relevant files, and intelligently edits the source code to fulfill your request.

### 3. Automated Version Control

After the AI successfully modifies the files, the server automatically stages the changes and generates a Git commit. This ensures your project's version history remains perfectly intact and clearly tracks exactly what the AI altered.

### 4. Zero-Touch Deployment

With the code safely committed, the server immediately triggers your deployment script (e.g., `pnpm run deploy`). The application is bundled and pushed live to your Kubernetes cluster without any manual intervention.

### 5. The Feedback Loop

Finally, the server monitors the terminal output from the deployment. It fires a WhatsApp message back to your phone containing a success confirmation and a snippet of the deployment logs—or alerts you if the AI wrote a syntax error that failed the build.

---

## 📋 Prerequisites

- **Node.js** (v18+) and **pnpm**
- **Git** installed and configured
- **OpenAI Codex CLI** installed globally: `npm install -g @openai/codex`
- **Kubernetes/kubectl** configured for your target cluster deployment
- **Twilio Account** for WhatsApp routing
- **Inbound Email Parser** (e.g., Postmark, SendGrid, or Mailgun) with custom domain MX records configured
- **OpenAI API Key**

---

## 🛠️ Installation & Setup

### 1. Clone & Install

```bash
git clone [https://github.com/yourusername/omnichannel-vibecoding-agent.git](https://github.com/yourusername/omnichannel-vibecoding-agent.git)
cd omnichannel-vibecoding-agent
pnpm install
```

## 🤖 Telegram Bot Commands

The current implementation is Telegram-first and stores workspace state in SQLite. All workspace paths are resolved under `DEVELOPER_ROOT`, so repo commands should use paths relative to your `Developer` directory, not full absolute paths.

Example:

```text
/repo add vibe vibe-in-motion
/repo use vibe
```

### General

- `/help` shows the available bot commands
- `/start` shows the same help output
- `/whoami` shows your Telegram chat ID and the currently selected workspace
- `/status` shows your Telegram chat ID and active workspace alias

Telegram command suggestions are registered automatically on bot startup. Because Telegram only suggests command names without spaces and does not allow hyphens in command names, the bot exposes suggestion-friendly aliases such as `/repo_list`, `/repo_use`, and `/codex_ship` in addition to the original forms.

### Workspace Management

- `/repo list` lists all saved workspace aliases and paths
- `/repo current` shows the currently active workspace for this chat
- `/repo pull <owner>/<repo> [alias]` clones a GitHub repo into `DEVELOPER_ROOT` over SSH, saves it as a workspace, and selects it
- `/repo use <alias>` switches this chat to a saved workspace
- `/repo add <alias> <path-under-Developer>` adds a new workspace alias
- `/repo set <alias> <path-under-Developer>` updates an existing workspace alias
- `/repo remove <alias>` removes a saved workspace alias
- Suggested aliases: `/repo_list`, `/repo_current`, `/repo_pull`, `/repo_use`, `/repo_add`, `/repo_set`, `/repo_remove`

Examples:

```text
/repo add vibe vibe-in-motion
/repo add api my-api
/repo pull IgnacyWie/vibe-in-motion
/repo pull IgnacyWie/vibe-in-motion vibe
/repo use vibe
/repo current
/repo list
```

### Codex Commands

- `/codex <prompt>` runs `codex exec` in the active workspace without committing or pushing
- `/c <prompt>` is a short alias for `/codex`
- `/codex-ship <prompt>` runs `codex exec`, stages the resulting git changes, creates a commit message, commits, pushes, and watches GitHub deploy workflows
- `/cs <prompt>` is a short alias for `/codex-ship`
- Suggested alias: `/codex_ship <prompt>`

Examples:

```text
/codex Add a /health route for the API server
/c Add a setup command
/codex-ship Add a README section describing setup commands
/cs Ship a fix for the deploy watcher
```

### Shell Commands

- `/run <allowlisted command>` runs a command inside the active workspace
- `/r <allowlisted command>` is a short alias for `/run`

This command is intentionally restricted to prefixes allowed by `RUN_COMMAND_ALLOWLIST`.

Examples:

```text
/run git status
/r pnpm test
/run pnpm test
/run pnpm build
```

### Relevant Environment Variables

- `TELEGRAM_BOT_TOKEN` Telegram bot token
- `ALLOWED_TELEGRAM_CHAT_IDS` comma-separated Telegram chat allowlist
- `DEVELOPER_ROOT` root directory that all workspace paths must stay within
- `BOT_DB_PATH` SQLite database path for workspace and chat state
- `RUN_COMMAND_ALLOWLIST` comma-separated allowlist of `/run` command prefixes
- `CODEX_TIMEOUT_MS` timeout for `codex exec`
- `SHELL_TIMEOUT_MS` timeout for `/run` commands
- `GIT_TIMEOUT_MS` timeout for commit and push steps

## macOS launchd deploy

For a native macOS background service without Docker, use the included launchd installer:

```bash
pnpm run deploy:mac
```

This script:

- installs dependencies with `pnpm install --frozen-lockfile`
- builds the app
- renders `deploy/com.ignacy.vibe-in-motion.plist` into `~/Library/LaunchAgents/`
- reloads the `com.ignacy.vibe-in-motion` launchd service

Useful follow-up commands:

```bash
bash scripts/deploy-mac.sh status
bash scripts/deploy-mac.sh restart
bash scripts/deploy-mac.sh stop
bash scripts/deploy-mac.sh logs
```
