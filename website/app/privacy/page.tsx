import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — TraceBug",
  description:
    "TraceBug privacy policy. Nothing goes to TraceBug. You choose what's sent to GitHub, Linear, Slack or your AI provider.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <Link
          href="/"
          className="text-sm text-text-muted hover:text-primary transition-colors mb-8 inline-block"
        >
          &larr; Back to home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-text-muted mb-10">
          Last updated: October 31, 2026
        </p>

        <div className="space-y-8 text-text-muted leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Overview
            </h2>
            <p>
              TraceBug is a QA bug reporting tool that records user interactions
              during testing sessions and generates developer-ready bug reports.
              TraceBug is designed with privacy as a core principle:{" "}
              <strong className="text-text-primary">
                nothing goes to TraceBug
              </strong>
              . There is no TraceBug server that receives your reports. A
              capture&apos;s content stays on your device until you choose to
              send it somewhere, and the only destinations are services you
              configure yourself: GitHub, Linear, Slack, or an AI provider.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Data Collection
            </h2>
            <p className="mb-3">
              TraceBug records nothing until you start a capture on a tab. While
              a capture you started is running, the following is recorded on
              your device:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong className="text-text-primary">User interactions</strong>{" "}
                — clicks (element tag, text, id, class), form inputs, select
                changes, form submissions, and page navigation. When you click
                a button, the values in the fields of that same form or section
                are recorded too, so the report shows what the button acted on;
                password, email, phone, card and one-time-code fields are left
                out entirely
              </li>
              <li>
                <strong className="text-text-primary">Console errors</strong> —
                console.error() messages, unhandled exceptions, and promise
                rejections with stack traces
              </li>
              <li>
                <strong className="text-text-primary">Network requests</strong>{" "}
                — fetch and XMLHttpRequest URLs, methods, status codes, and
                response times
              </li>
              <li>
                <strong className="text-text-primary">Screenshots</strong> —
                captured only when you take one, and kept with the bug report
              </li>
              <li>
                <strong className="text-text-primary">Screen recording</strong>{" "}
                — only if you turn on &ldquo;Events + Video&rdquo;: a video of
                the tab, window or screen you choose to share, including that
                tab&apos;s audio
              </li>
              <li>
                <strong className="text-text-primary">Microphone audio</strong>{" "}
                — only if you turn the microphone on for a recording; your voice
                is recorded into that video and nowhere else
              </li>
              <li>
                <strong className="text-text-primary">Environment info</strong>{" "}
                — browser name/version, operating system, viewport size, device
                type, and connection type
              </li>
              <li>
                <strong className="text-text-primary">Voice transcripts</strong>{" "}
                — speech-to-text transcriptions when the user explicitly uses
                the Voice Note feature, processed by the browser&apos;s built-in
                Web Speech API
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Data Storage
            </h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                A capture&apos;s events and the bug tickets you save are stored
                in the{" "}
                <strong className="text-text-primary">localStorage</strong> of
                the website you captured. That storage belongs to the website,
                so the website&apos;s own scripts can read it. Saved tickets stay
                until you delete them.
              </li>
              <li>
                Screen recordings, your settings and the recording options are
                stored in the extension&apos;s own storage (
                <code className="text-accent">chrome.storage.local</code>), which
                websites cannot read.
              </li>
              <li>
                Voice-note transcripts are produced by your browser&apos;s
                built-in speech recognition; TraceBug keeps only the text.
              </li>
              <li>
                <strong className="text-text-primary">
                  No capture is sent anywhere unless you send it
                </strong>{" "}
                — and never to TraceBug. See &ldquo;What leaves your device, and
                when&rdquo; below.
              </li>
              <li>
                API tokens and keys you enter (GitHub, Linear, Slack, OpenAI,
                Anthropic, Ollama) are stored in{" "}
                <code className="text-accent">chrome.storage.local</code> on
                your own device, and are sent only to the service they belong
                to. They are never stored on the websites you test, and never
                reach TraceBug.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Sensitive Data Protection
            </h2>
            <p className="mb-3">
              TraceBug automatically redacts sensitive information before it is
              stored:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Password fields — values replaced with <code className="text-accent">[REDACTED]</code></li>
              <li>Credit card numbers — detected and redacted</li>
              <li>Social Security Numbers — detected and redacted</li>
              <li>API tokens and authorization headers — detected and redacted</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Data Sharing
            </h2>
            <p>
              TraceBug does <strong className="text-text-primary">not</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Run a server that receives your reports — there isn&apos;t one</li>
              <li>Use analytics, telemetry, or tracking of any kind</li>
              <li>Share, sell, or transfer your data to anyone of its own accord</li>
              <li>Use data for advertising, profiling, or creditworthiness</li>
              <li>Send anything you have not chosen to send</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              What leaves your device, and when
            </h2>
            <p className="mb-3">
              Four things can leave your device. All four are started by you,
              and none of them goes to TraceBug.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-text-primary">
                  A report you send to an issue tracker or an AI provider
                </strong>{" "}
                — when you click Send for GitHub, Linear, Slack, or ask for AI
                analysis, the report content is sent directly from your browser
                to that service, using the token you supplied. In the extension
                you see the full report and the destination in a confirmation
                window first, and nothing is sent until you approve it. Those
                services then handle that data under their own privacy policies.
              </li>
              <li>
                <strong className="text-text-primary">
                  &ldquo;Open in Claude&rdquo; or &ldquo;Open in ChatGPT&rdquo;
                </strong>{" "}
                — opens that chat site with the report text already filled in.
                For a short report the text is placed in the page address, so it
                is kept in your browser history like any address you visit.
              </li>
              <li>
                <strong className="text-text-primary">
                  The uninstall survey
                </strong>{" "}
                — removing the extension opens a page that receives the version
                number you had installed, plus whatever you choose to type in
                the optional form. Nothing else, and answering is optional:
                Skip sends nothing at all.
              </li>
              <li>
                <strong className="text-text-primary">
                  Anything you export and share yourself
                </strong>{" "}
                — an exported <code className="text-accent">.html</code> report
                is a file on your machine. Where it goes afterwards is entirely
                up to you.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              User Control
            </h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>TraceBug only records a tab after you start a capture on it, and stops when you click Stop</li>
              <li>Screen recording and the microphone are off unless you turn them on</li>
              <li>Saved tickets can be deleted one by one from the Saved Tickets list</li>
              <li>The extension can be disabled or uninstalled at any time</li>
              <li>
                Clearing a website&apos;s data removes the TraceBug tickets saved
                on it; uninstalling the extension removes its own storage
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Chrome Extension Permissions
            </h2>
            <div className="space-y-3">
              <div>
                <strong className="text-text-primary">activeTab</strong> — To
                inject the recording UI and capture screenshots on the current
                tab
              </div>
              <div>
                <strong className="text-text-primary">storage</strong> — To
                keep your settings, integration tokens and screen recordings on
                your device
              </div>
              <div>
                <strong className="text-text-primary">scripting</strong> — To
                inject the TraceBug SDK into the page context for session
                recording
              </div>
              <div>
                <strong className="text-text-primary">unlimitedStorage</strong>{" "}
                — A report with a replay or a video can exceed the default
                storage limit. It is stored only on your device.
              </div>
              <div>
                <strong className="text-text-primary">alarms</strong> — To
                cancel an unanswered send-confirmation window after two minutes.
              </div>
              <div>
                <strong className="text-text-primary">offscreen</strong> — To
                keep an optional screen recording running while you move
                between pages.
              </div>
              <div>
                <strong className="text-text-primary">
                  tabCapture (optional)
                </strong>{" "}
                — <strong className="text-text-primary">Not requested at
                install.</strong> Asked for only if you turn on screen recording
                and pick "Tab" instead of "Desktop", so the current tab can be
                recorded without a share-picker dialog. Declining falls back to
                the normal picker.
              </div>
              <div>
                <strong className="text-text-primary">
                  Optional host permissions
                </strong>{" "}
                — <strong className="text-text-primary">Not requested at
                install.</strong> TraceBug captures the tab you are on from your
                own click. It asks for access to one specific address only when
                you save a GitHub, Linear, Slack, OpenAI, Anthropic or Ollama
                integration. Older versions could also ask for access to all
                sites; if you granted that, you can remove it in TraceBug
                settings.
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Open Source
            </h2>
            <p>
              TraceBug is fully open source. You can review the complete source
              code at{" "}
              <a
                href="https://github.com/prashantsinghmangat/TraceBug-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-accent transition-colors underline"
              >
                github.com/prashantsinghmangat/TraceBug-ai
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">
              Contact
            </h2>
            <p>
              For privacy questions or concerns, please open an issue at{" "}
              <a
                href="https://github.com/prashantsinghmangat/TraceBug-ai/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-accent transition-colors underline"
              >
                github.com/prashantsinghmangat/TraceBug-ai/issues
              </a>
              .
            </p>
          </section>

          <section className="border-t border-border pt-6 mt-10">
            <p className="text-sm text-text-muted">
              This privacy policy applies to the TraceBug browser extension
              (Chrome and Firefox) and the TraceBug SDK (npm package:
              tracebug-sdk).
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
