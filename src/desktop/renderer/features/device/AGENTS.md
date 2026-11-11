Parent instructions: [features AGENTS.md](../AGENTS.md).

- Persist only contract-approved device settings. API host changes occur through the sign-in sequence, never Settings. Switching between a remote server and this device goes only through `settings.setConnectionMode`, from Settings or the top-bar toggle. The toggle is enabled only when `authenticated` and `runtimeInstalled` are both true; when disabled it rests on the usable side and its tooltip says what to configure.
- Never render, prefill or log a saved inference API key. Key fields are write-only: empty keeps the saved key and an explicit control removes it.
- Nothing downloads on mount. Only the explicit Set up action calls `localServer.setup()` and only Download model calls `inference.downloadModel()`.
- Name on-device models by their exact catalog id from `ON_DEVICE_SPEECH_MODELS`. Do not invent model families, sizes or compatibility claims.
- Browser media access is limited to user-initiated onboarding input selection; stop every acquired track immediately after enumeration.
- Data sync starts only from Sync now or the opt-in `syncAtStartup` preference. Say what it moves and that recordings stay where they were made; never call it a backup.
- Settings controls must map to a contract-approved operation or remain visibly unavailable; do not imply server-owned data controls exist locally.
- Shortcut capture must suspend native actions through `useShortcutSuspension` and never type into a focused field. Keep recorder styling in `shortcut-recorder.css`.
- Show validation and operation errors inline, next to the control that caused them.
- Build sign-in and onboarding on `DeviceSetupLayout` and `device-setup.css`. Use the root `--setup-*` and hub tokens rather than a separate palette, and keep both themes working.
- Onboarding keeps only the permissions, microphone, language, shortcut and tutorial steps, plus the Inference step in device mode. An unsupported capability resolves with its reason and never blocks setup.
- Shortcut capture and key testing come from `ShortcutRecorder` and `shortcut-keys`. Do not add keyboard parsing in a setup screen.
