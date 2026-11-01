# Wallet chooser surface correction

1 November 2026.

The CCC web component used `var(--background)` without Streak providing that
token, leaving its wallet panel transparent. Define an opaque dark background
and the component's button, icon, divider and helper-text colours on
`ccc-connector`. The theme also inherits into its secondary dialogs and when
the chooser is hosted above the prediction slip.

Local screenshots use the real chooser and production stylesheet, with synthetic
background content, in mobile WebKit and desktop Chromium. No wallet transactions
or production data are involved. Screenshots stay in the ignored
`.quality-artifacts/wallet-chooser-nov1/` directory.

The owner explicitly requested skipping checks and tests and pushing immediately.
No build, automated checks or test suites were run for this change. Local visual
capture is not a claim of hosted deployment or device acceptance.
