export default function Problem() {
  const messages = [
    { sender: "tester", name: "Sarah (QA)", avatar: "S", time: "2:14 PM", text: "Hey, the vendor page is broken again 😤" },
    { sender: "dev", name: "Alex (Dev)", avatar: "A", time: "2:15 PM", text: "What do you mean? Works for me. What exactly happened?" },
    { sender: "tester", name: "Sarah (QA)", avatar: "S", time: "2:16 PM", text: "I clicked something and it showed an error. It stopped working." },
    { sender: "dev", name: "Alex (Dev)", avatar: "A", time: "2:17 PM", text: "What did you click? What browser are you using? Can you reproduce it?" },
    { sender: "tester", name: "Sarah (QA)", avatar: "S", time: "2:18 PM", text: "I don't remember exactly what I clicked... I think it was the edit button? Or maybe save?" },
    { sender: "dev", name: "Alex (Dev)", avatar: "A", time: "2:31 PM", text: "I've been trying to reproduce this for 15 min. I need the exact steps. Did you see any error message?" },
    { sender: "tester", name: "Sarah (QA)", avatar: "S", time: "2:45 PM", text: "I didn't copy it down, sorry. Let me try again and see if it happens..." },
    { sender: "system", text: "3 days later..." },
    { sender: "dev", name: "Alex (Dev)", avatar: "A", time: "5 days later", text: "Still can't reproduce this. Closing as 'cannot reproduce'. Please reopen if you see it again." },
  ];

  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            The Problem
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            Traditional Bug Reporting is{" "}
            <span className="text-red-400">Broken</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            Testers find bugs but developers can&apos;t reproduce them. The result?
            Days of back-and-forth that kills productivity.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Chat mockup */}
          <div>
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-xl">
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/50">
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                <span className="text-text-primary text-sm font-semibold">#bugs-and-issues</span>
                <span className="ml-auto text-text-muted text-xs">Slack workspace</span>
              </div>

              {/* Messages */}
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {messages.map((msg, i) => {
                  if (msg.sender === "system") {
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-border"></div>
                        <span className="text-text-muted text-xs px-2">{msg.text}</span>
                        <div className="flex-1 h-px bg-border"></div>
                      </div>
                    );
                  }

                  const isdev = msg.sender === "dev";
                  return (
                    <div key={i} className={`flex items-start gap-3 ${isdev ? "flex-row-reverse" : ""}`}>
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isdev
                            ? "bg-primary/20 text-primary"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {msg.avatar}
                      </div>
                      <div className={`flex-1 ${isdev ? "items-end" : "items-start"} flex flex-col`}>
                        <div className={`flex items-baseline gap-2 mb-1 ${isdev ? "flex-row-reverse" : ""}`}>
                          <span className="text-text-primary text-xs font-semibold">{msg.name}</span>
                          <span className="text-text-muted text-[10px]">{msg.time}</span>
                        </div>
                        <div
                          className={`px-3 py-2 rounded-xl text-xs leading-relaxed max-w-xs ${
                            isdev
                              ? "bg-primary/15 border border-primary/20 text-text-primary ml-auto"
                              : "bg-surface border border-border text-text-muted"
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stats and pain points */}
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  stat: "3+ days",
                  label: "Average time to reproduce a bug",
                  color: "text-red-400",
                  bg: "bg-red-500/10",
                  border: "border-red-500/20",
                },
                {
                  stat: "40%",
                  label: "of dev time spent on debugging",
                  color: "text-orange-400",
                  bg: "bg-orange-500/10",
                  border: "border-orange-500/20",
                },
                {
                  stat: "60%",
                  label: "of bug reports are \"cannot reproduce\"",
                  color: "text-yellow-400",
                  bg: "bg-yellow-500/10",
                  border: "border-yellow-500/20",
                },
                {
                  stat: "$10k+",
                  label: "monthly cost of wasted dev hours per team",
                  color: "text-red-300",
                  bg: "bg-red-500/10",
                  border: "border-red-500/20",
                },
              ].map((item) => (
                <div
                  key={item.stat}
                  className={`p-4 ${item.bg} border ${item.border} rounded-xl`}
                >
                  <div className={`text-2xl font-extrabold ${item.color} mb-1`}>
                    {item.stat}
                  </div>
                  <div className="text-text-muted text-xs leading-relaxed">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Pain points */}
            <div className="space-y-3">
              <h3 className="text-text-primary font-semibold text-sm uppercase tracking-wider text-text-muted">
                The Real Pain Points
              </h3>
              {[
                {
                  icon: "✗",
                  color: "text-red-400",
                  title: "Vague bug reports",
                  desc: "\"The page is broken\" — no steps, no context, no error details",
                },
                {
                  icon: "✗",
                  color: "text-red-400",
                  title: "Missing reproduction steps",
                  desc: "Testers forget exactly what they clicked by the time they file the ticket",
                },
                {
                  icon: "✗",
                  color: "text-red-400",
                  title: "No console errors captured",
                  desc: "The stack trace that would solve the mystery is never included",
                },
                {
                  icon: "✗",
                  color: "text-red-400",
                  title: "No network log",
                  desc: "Failed API calls go unrecorded — developers have no idea which request broke",
                },
                {
                  icon: "✗",
                  color: "text-red-400",
                  title: "Environment info missing",
                  desc: "Which browser? Which OS? What viewport? Nobody knows.",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 p-3 bg-surface border border-border rounded-lg">
                  <span className={`${item.color} font-bold text-lg flex-shrink-0 leading-5`}>{item.icon}</span>
                  <div>
                    <span className="text-text-primary text-sm font-medium">{item.title} — </span>
                    <span className="text-text-muted text-sm">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
