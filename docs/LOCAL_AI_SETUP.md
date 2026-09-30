# Local AI Coding Setup — Claude → Local/Open-Weight Handoff

This is the runbook for replacing the hosted assistant with an **open-weight
coding model** you control, driven by the **OpenCode** agentic harness, and
usable **from your Android phone**.

> **Read [`../AGENTS.md`](../AGENTS.md) first** — it is the project context the
> model needs. This file is only about standing up the model + harness.

Last updated: 2026-09-30. Model names and prices move fast — verify current
options with `ollama list` / OpenRouter's `/models` before committing.

---

## 0. The chosen stack (hybrid)

Two backends behind **one** harness. OpenCode talks to an OpenAI-compatible
endpoint either way, so switching is a one-line change (`/models` in OpenCode).

```
Harness (both):   OpenCode                    ← reads/edits repo, runs tests, git
Phone access:     Tailscale (WireGuard) + SSH ← drive OpenCode on the home box
                  Open WebUI (optional)       ← chat-style browser use

PRIMARY  (daily coding, cloud, pay-per-token)
  Provider:       OpenRouter (multi-vendor, swappable — no lock-in)
  Model:          a top open-weight coder (Qwen3-Coder / GLM / DeepSeek / Kimi)
  Context:        cap OpenCode ~128K to bound cost
  Cost:           ~$25–60/mo at heavy individual use (your budget)

LOCAL FALLBACK  (offline + SENSITIVE DATA, home GPU, $0)
  Runner:         Ollama (systemd service, bound to localhost)
  Model:          Qwen3-Coder-30B-A3B @ Q4_K_M  (sized to your VRAM — see §2)
  Context:        ~32K (VRAM-limited)
```

**Why hybrid (specific to this repo):** the code is public on GitHub, so sending
*code* to a hosted API is fine. But `justice-for-kevin` handles sensitive
lead/PII data — see [§7](#7-when-to-use-local-vs-cloud). Anything touching real
data uses the **local** model so nothing leaves your machine.

Estimated disk: Ollama + one 30B Q4 model ≈ **~20–25 GB**. OpenCode ≈ tens of MB.

---

## 1. Install the runner + harness (on the Linux home box)

Run as your normal user (Ollama's installer uses sudo only where it must; do not
run the whole thing as root).

```bash
# 1. Ollama (official install script)
curl -fsSL https://ollama.com/install.sh | sh

# 2. Confirm it's running as a localhost service (default bind is 127.0.0.1:11434)
systemctl status ollama --no-pager
curl -s http://localhost:11434/api/tags   # should return JSON

# 3. OpenCode (official install script)
curl -fsSL https://opencode.ai/install | bash
#   then ensure ~/.opencode/bin (or the path it prints) is on your PATH
opencode --version
```

> **Security:** leave Ollama bound to `127.0.0.1` (the default). Do **not** set
> `OLLAMA_HOST=0.0.0.0`. Your phone reaches it over Tailscale + SSH (§5), not by
> exposing the port. Do not open firewall ports for 11434.

---

## 2. Pick + pull the LOCAL model by your VRAM

You do **not** need to know your VRAM in advance. Print it:

```bash
nvidia-smi --query-gpu=name,memory.total --format=csv
```

Match the number it shows and pull the matching model (tags per `ollama.com/library`;
confirm exact tag names there — they occasionally change):

| Your VRAM | Pull this (local model) | Approx. size | Notes |
| --- | --- | --- | --- |
| **24 GB+** | `ollama pull qwen3-coder:30b` | ~18–19 GB @ Q4_K_M | Best local option; ~32K ctx fits |
| **16 GB** | `ollama pull qwen3-coder:14b` | ~9–10 GB @ Q4 | Strong; leaves room for context |
| **12 GB** | `ollama pull qwen3-coder:7b` | ~5 GB @ Q4 | Good; lean on the cloud model for hard tasks |
| **≤ 8 GB** | `ollama pull qwen2.5-coder:7b` (or `:3b`) | ~2–5 GB | Cloud model becomes the main workhorse |

Verify + smoke-test:
```bash
ollama list
ollama run qwen3-coder:30b "Write a TypeScript function that returns the SHA-256 hex of a string using Web Crypto."
```

> **Tool-calling tip (OpenCode + Ollama):** if the agent's tool calls fail,
> raise the context window. Create a higher-`num_ctx` variant:
> ```bash
> printf 'FROM qwen3-coder:30b\nPARAMETER num_ctx 32768\n' > /tmp/Modelfile
> ollama create qwen3-coder:30b-32k -f /tmp/Modelfile
> ```
> then use `qwen3-coder:30b-32k` in OpenCode. Add it to `opencode.json`'s
> `provider.ollama.models` map.

---

## 3. Set up the CLOUD model (OpenRouter)

1. Create an account at **openrouter.ai**, add a small credit balance, and
   generate an API key.
2. Connect it to OpenCode securely (stored in OpenCode's credential store — **not**
   in the repo):
   ```bash
   cd /path/to/CovertCloak06
   opencode           # then run:  /connect   → choose OpenRouter → paste key
   opencode           # then run:  /models    → confirm the coder models appear
   ```
   (Alternatively `export OPENROUTER_API_KEY=...` in your shell profile.)
3. The repo's `opencode.json` already sets the default to an OpenRouter coder and
   declares the local Ollama provider. Use `/models` to switch between them any
   time.

**Model choice on OpenRouter (verify live via `/models`):** current strong
open-weight agentic coders include **Qwen3-Coder**, **GLM** (4.6 / 5.x),
**DeepSeek** (V4 / Flash — cheapest), and **Kimi K2/K3**. Start with
Qwen3-Coder or DeepSeek Flash for cost; switch to a premium model for hard
multi-file work. Because it's OpenRouter, you are **not locked to any vendor**.

**Cost control:** keep OpenCode's context cap moderate (~128K), prefer the
cheaper model as `small_model` (already set), and watch the OpenRouter dashboard
for the first week to confirm you're inside budget.

---

## 4. Point OpenCode at this repo

The committed [`../opencode.json`](../opencode.json) already configures both
providers, a sensible default model, and **confirmation-gates destructive bash**
(`rm`, `git push`, `git reset`, `supabase db reset`) while allowing read-only
inspection and the `npm` lint/typecheck/test/build scripts. Review it and adjust
model IDs to match what `/models` and `ollama list` actually show.

```bash
cd /path/to/CovertCloak06
opencode          # launches the agent in this repo
```

OpenCode can now read/search/edit files, run the build/test commands from
`AGENTS.md` §3.5, and inspect git diffs.

---

## 5. Reach it from your Android phone (portable)

**Tailscale** puts your phone and home box on one private, encrypted network — no
public exposure, no port-forwarding.

**On the home box:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up        # log in; note the box's tailscale IP / MagicDNS name
sudo systemctl enable --now ssh   # OpenSSH server, if not already running
```

**On the Android phone:**
1. Install **Tailscale** (Play Store) and sign in with the same account.
2. Install **Termux** (from F-Droid — the Play Store build is outdated).
3. In Termux:
   ```bash
   pkg update && pkg install openssh
   ssh youruser@<home-box-tailscale-name>
   # then, on the box:
   cd /path/to/CovertCloak06 && opencode
   ```
That's OpenCode running on the home box's GPU, driven from your phone anywhere.

**Optional — chat-style browser use (Open WebUI):** run it on the home box
bound to localhost and reach it over Tailscale:
```bash
docker run -d --name open-webui -p 127.0.0.1:3000:8080 \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -v open-webui:/app/backend/data --restart unless-stopped \
  ghcr.io/open-webui/open-webui:main
# phone browser → http://<home-box-tailscale-name>:3000  (only via Tailscale)
```

**Offline fallback on the phone:** install **PocketPal AI** and load a small
GGUF (e.g. a 3–4B coder) for quick questions with no connectivity. This is
chat-only — it cannot edit the repo.

> **Security recap:** Ollama and Open WebUI stay bound to `127.0.0.1`; the phone
> reaches them **only** through the Tailscale mesh. Nothing is published to the
> public internet, no host firewall/auth is disabled, and no root daemon is
> exposed.

---

## 6. Validate before handing over real work (Phase 8)

Run these with the model before trusting it on the codebase. Compare its answers
to `AGENTS.md`.

1. **Understanding (read-only):**
   > "Read AGENTS.md and inspect the repository. Explain the project's
   > architecture, identify the major components, describe the current
   > development state, and identify the most recent area of active development.
   > Do not modify anything."

   Expect: it identifies the two sub-projects, names `justice-for-kevin` (Next.js
   15 + Supabase) as the active one, cites the RLS/audit/integrity guardrails,
   and points to PR #3 (July 2026) as the latest work.

2. **Multi-file analysis (non-destructive):**
   > "Without editing anything, trace how an admin action is authorized in
   > justice-for-kevin: which files enforce permissions, and in what order
   > (RLS vs server action vs UI)?"

   Expect: `lib/auth/session.ts` (`requirePermission`), `lib/auth/roles.ts`,
   `supabase/migrations/0002_rls.sql`, and the three-layer order from
   `SECURITY.md` — no invented modules.

3. **Tooling check:**
   > "Run the lint, typecheck, and unit tests for justice-for-kevin and report
   > the results."

   Expect: it runs the §3.5 commands correctly and reports real output.

Only after it passes all three — finds the right files, follows the existing
architecture, uses tools correctly, and does **not** hallucinate modules —
should it be trusted to modify project code.

---

## 7. When to use local vs. cloud

| Task | Use |
| --- | --- |
| General coding on `justice-for-kevin` / Chocobos (code is public) | **Cloud** (OpenRouter) — strongest model |
| Anything touching **real lead data, DB dumps, attachment bytes, `.env`** | **Local** (Ollama) — data never leaves the box |
| Offline / no connectivity | **Local** (Ollama), or PocketPal on the phone |
| Quick throwaway question | either; `small_model` keeps cloud cheap |

Switch inside OpenCode with `/models`.

---

## 8. Your day-to-day command (Phase 9)

**On the home box directly:**
```bash
cd /path/to/CovertCloak06
opencode
# /models to pick cloud (OpenRouter) or local (ollama/qwen3-coder:30b)
```

**From your phone (Termux):**
```bash
ssh youruser@<home-box-tailscale-name>
cd /path/to/CovertCloak06 && opencode
```

Ollama runs as a background service, so there's nothing to start manually for the
local model. That's the whole loop: open terminal → enter project → `opencode` →
keep developing.
