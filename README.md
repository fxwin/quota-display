# pi-quota-display

[Pi](https://pi.dev) extension that shows your OpenAI Codex or GitHub Copilot quota in the footer.

## Features

- shows Codex 5h and weekly quota
- shows GitHub Copilot monthly quota as used vs. goal
- uses your existing pi `/login`

## Setup

1. Install the extension:
   ```bash
   pi install git:github.com/fxwin/quota-display
   ```

2. Reload pi:
   ```bash
   /reload
   ```

3. Make sure you're logged in with `/login` for one or both of:
   - ChatGPT Plus/Pro (Codex Subscription)
   - GitHub Copilot
