import { Link } from "@tanstack/react-router";
import { CONTACT_EMAIL, GITHUB_URL, LINKTREE_URL, X_HANDLE, X_URL } from "@/constants/site";

const linkCls = "underline decoration-line-strong underline-offset-4 hover:text-ink";

/** Site footer: about text plus trust and contact links. Shown on every page. */
export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer data-testid="site-footer" className={`rounded-panel border border-line bg-panel/60 p-4 text-sm text-mist ${className}`}>
      <p className="font-spooky text-lg tracking-wide text-violet-200">About Youcognito</p>
      <p className="mt-1 leading-relaxed">
        Private AI research on Base. Youcog reads the web for you in sealed tabs, so the sites never see your browser, and
        the session vanishes when you burn it. There's also a daily YOUCOG faucet for the community. An experimental
        project, not financial advice.
      </p>
      <nav aria-label="Footer" className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <Link to="/privacy" className={linkCls}>Privacy</Link>
        <Link to="/terms" className={linkCls}>Terms</Link>
        <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>Contact</a>
        <a href={X_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>X {X_HANDLE}</a>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>GitHub</a>
        <a href={LINKTREE_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>Linktree</a>
      </nav>
      <p className="mt-3 text-xs text-faint">© {new Date().getFullYear()} Youcognito · {CONTACT_EMAIL}</p>
    </footer>
  );
}
