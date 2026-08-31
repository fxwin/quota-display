# pi-quota-display

[Pi](https://pi.dev) extension that shows your OpenAI Codex or GitHub Copilot quota in the footer.

## Features

- shows available Codex quota windows (for example 5h and/or weekly)
- shows GitHub Copilot monthly quota as used vs. goal
- uses your existing pi `/login`

## Compatibility

Tags named `pi-vX.Y.Z` identify commits compatible with pi version `X.Y.Z`. To install a specific version, replace `X.Y.Z` with the desired pi version:

```bash
pi install git:github.com/fxwin/quota-display@pi-vX.Y.Z
```

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
