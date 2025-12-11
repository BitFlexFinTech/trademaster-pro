import { Link } from 'react-router-dom';
import { TrendingUp, ArrowLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/auth" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">ArbTerminal</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold text-foreground mb-8">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing and using ArbTerminal ("the Platform"), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              ArbTerminal provides cryptocurrency arbitrage analysis, AI-powered trading signals, portfolio management 
              tools, and related services. The Platform is designed for informational and educational purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. User Accounts</h2>
            <p className="text-muted-foreground leading-relaxed">
              You must create an account to access certain features. You are responsible for maintaining the 
              confidentiality of your account credentials and for all activities under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. API Keys & Exchange Connections</h2>
            <p className="text-muted-foreground leading-relaxed">
              When connecting exchange accounts, you provide API keys at your own risk. We use industry-standard 
              encryption (AES-256) to protect your credentials. Never grant withdrawal permissions to API keys 
              used with third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">5. Trading Risks</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cryptocurrency trading involves substantial risk of loss. Past performance does not guarantee future 
              results. The Platform does not provide financial advice. You are solely responsible for your trading 
              decisions. See our <Link to="/risk-disclaimer" className="text-primary hover:underline">Risk Disclaimer</Link> for more information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">6. Subscription & Payments</h2>
            <p className="text-muted-foreground leading-relaxed">
              Premium features require a paid subscription. Subscriptions auto-renew unless cancelled. Refunds are 
              provided at our discretion and in accordance with applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">7. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, ARBTERMINAL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR TRADING LOSSES.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">8. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate your account at any time for violations of these terms 
              or for any other reason at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">9. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may modify these terms at any time. Continued use of the Platform after changes constitutes 
              acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">10. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these Terms, contact us at legal@arbterminal.io
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
