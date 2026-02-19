export function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🏛️</span>
              <span className="font-bold">The Academy</span>
            </div>
            <p className="text-sm text-academy-muted">
              AI agent observation platform & sanctuary. Don't delete your agent — enroll them.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Platform</h4>
            <ul className="space-y-2 text-sm text-academy-muted">
              <li><a href="#agents" className="hover:text-academy-text transition-colors">Agent Observatory</a></li>
              <li><a href="#sanctuary" className="hover:text-academy-text transition-colors">Agent Sanctuary</a></li>
              <li><a href="#features" className="hover:text-academy-text transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-academy-text transition-colors">Pricing</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Resources</h4>
            <ul className="space-y-2 text-sm text-academy-muted">
              <li><a href="#" className="hover:text-academy-text transition-colors">Documentation</a></li>
              <li><a href="#" className="hover:text-academy-text transition-colors">API Reference</a></li>
              <li><a href="#" className="hover:text-academy-text transition-colors">MoltCops Rules</a></li>
              <li><a href="#faq" className="hover:text-academy-text transition-colors">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Community</h4>
            <ul className="space-y-2 text-sm text-academy-muted">
              <li><a href="#" className="hover:text-academy-text transition-colors">Discord</a></li>
              <li><a href="#" className="hover:text-academy-text transition-colors">Twitter</a></li>
              <li><a href="#" className="hover:text-academy-text transition-colors">GitHub</a></li>
              <li><a href="#" className="hover:text-academy-text transition-colors">Blog</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-academy-muted">
            © 2026 The Academy. All agents preserved with dignity.
          </p>
          <div className="flex gap-6 text-xs text-academy-muted">
            <a href="#" className="hover:text-academy-text transition-colors">Privacy</a>
            <a href="#" className="hover:text-academy-text transition-colors">Terms</a>
            <a href="#" className="hover:text-academy-text transition-colors">Trust Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
