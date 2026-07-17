# TraceBug example app

A small Next.js app with intentional bugs, used to test the TraceBug SDK
end-to-end during development. It depends on the SDK via `file:..`, so it
always runs against your local build — not the npm release.

## Run it

From the **repo root**:

```bash
npm install
npm run build:example   # builds the SDK and installs it into example-app
cd example-app
npm run dev             # http://localhost:3000
```

The TraceBug toolbar appears on the right edge (localhost counts as
development, so `enabled: "auto"` turns the SDK on). Trigger the bugs in the
UI, capture, and export — the same flow a real user gets.

After changing SDK source (`src/`), re-run `npm run build:example` from the
root so the example picks up the new build.

> Want to try TraceBug in your own app instead? `npm install tracebug-sdk`
> and see the [quickstart](../docs/quickstart.md).
