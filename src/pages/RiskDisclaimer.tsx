import { Link } from 'react-router-dom';
import { TrendingUp, ArrowLeft, AlertTriangle } from 'lucide-react';

export default function RiskDisclaimer() {
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
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-foreground">Risk Disclaimer</h1>
            <p className="text-destructive font-semibold">Please read carefully before trading</p>
          </div>
        </div>

        <div className="card-terminal p-6 mb-8 border-destructive/50">
          <p className="text-foreground font-semibold text-lg">
            ⚠️ CRYPTOCURRENCY TRADING INVOLVES SUBSTANTIAL RISK OF LOSS AND IS NOT SUITABLE FOR ALL INVESTORS.
          </p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Market Risks</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong className="text-foreground">Volatility:</strong> Cryptocurrency prices can fluctuate dramatically in minutes, potentially resulting in significant losses.</li>
              <li><strong className="text-foreground">Liquidity:</strong> Some markets may have low liquidity, making it difficult to execute trades at desired prices.</li>
              <li><strong className="text-foreground">Market Manipulation:</strong> Crypto markets are susceptible to manipulation, pump-and-dump schemes, and flash crashes.</li>
              <li><strong className="text-foreground">24/7 Markets:</strong> Cryptocurrency markets never close, meaning prices can change dramatically while you sleep.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Arbitrage-Specific Risks</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li><strong className="text-foreground">Execution Risk:</strong> Price differences may disappear before trades can be executed.</li>
              <li><strong className="text-foreground">Transfer Delays:</strong> Blockchain confirmation times can cause opportunities to vanish.</li>
              <li><strong className="text-foreground">Exchange Risk:</strong> Exchanges may experience downtime, hacks, or insolvency.</li>
              <li><strong className="text-foreground">Fee Erosion:</strong> Trading fees, withdrawal fees, and network fees can eliminate profits.</li>
              <li><strong className="text-foreground">Slippage:</strong> Large orders may move the market against you.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Leverage Risks</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Trading with leverage amplifies both potential gains AND losses. A 10x leveraged position can be 
              liquidated with just a 10% adverse price movement. <strong className="text-destructive">Never risk more than you can afford to lose.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">AI Signal Disclaimer</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our AI-powered trading signals are generated using machine learning algorithms based on historical data 
              and market patterns. These signals:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4 mt-4">
              <li>Are NOT financial advice</li>
              <li>Do NOT guarantee profits</li>
              <li>Have NO guaranteed accuracy rate</li>
              <li>Should be used as one of many inputs in your trading decisions</li>
              <li>Past signal performance does not indicate future results</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Regulatory Risks</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cryptocurrency regulations vary by jurisdiction and are rapidly evolving. Trading may be restricted 
              or banned in your region. Tax obligations apply to cryptocurrency gains in most jurisdictions. 
              Consult a qualified tax professional.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Technology Risks</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Software bugs or errors may affect trading execution</li>
              <li>API connections may fail at critical moments</li>
              <li>Internet connectivity issues can prevent order execution</li>
              <li>Smart contract vulnerabilities in DeFi protocols</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">Your Responsibilities</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
              <li>Only trade with funds you can afford to lose completely</li>
              <li>Conduct your own research (DYOR) before any trade</li>
              <li>Understand the risks of each trading strategy</li>
              <li>Use appropriate position sizing and risk management</li>
              <li>Never share your API keys or account credentials</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="card-terminal p-6 border-destructive/50">
            <h2 className="text-2xl font-semibold text-foreground mb-4">No Guarantees</h2>
            <p className="text-muted-foreground leading-relaxed">
              ArbTerminal makes NO GUARANTEES of profit. The platform is provided "as is" without warranties of 
              any kind. We are not responsible for any trading losses you may incur. By using this platform, 
              you acknowledge that you understand these risks and accept full responsibility for your trading decisions.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
