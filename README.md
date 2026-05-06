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
