// Route-level template: re-mounts on every navigation, giving each page a
// soft fade-in. Cheap perceived-quality win; respects reduced motion via the
// global animation kill-list (animate-fade-in is a plain opacity fade).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
