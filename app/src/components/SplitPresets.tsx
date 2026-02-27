export default function SplitPresets() {
  return (
    <section id="presets" className="border-y-4 border-ink flex flex-col md:flex-row min-h-screen">
      {/* SSS-01 */}
      <div className="w-full md:w-1/2 p-8 md:p-16 border-b-4 md:border-b-0 md:border-r-4 border-ink hover:bg-ink hover:text-paper transition-colors duration-500 group relative overflow-hidden">
        <div className="relative z-10">
          <div className="font-mono text-2xl mb-12">SSS&mdash;01</div>
          <h2 className="font-display text-6xl md:text-8xl font-bold uppercase mb-6">
            Minimal
            <br />
            Stable
          </h2>
          <p className="font-sans text-xl mb-12 max-w-md">
            For internal tokens, DAO treasuries, and fast ecosystem settlement.
            What&apos;s needed on every stable, nothing more.
          </p>
          <ul className="font-mono space-y-4 text-sm uppercase tracking-wide border-l-2 border-current pl-4">
            <li>+ Mint Authority</li>
            <li>+ Freeze Authority</li>
            <li>+ Metadata Core</li>
            <li className="opacity-50 line-through">- Transfer Hooks</li>
          </ul>
        </div>
        <div className="absolute -bottom-20 -right-20 font-display font-bold text-[30rem] leading-none opacity-5 group-hover:opacity-10 transition-opacity">
          1
        </div>
      </div>

      {/* SSS-02 */}
      <div className="w-full md:w-1/2 p-8 md:p-16 hover:bg-accent hover:text-paper transition-colors duration-500 group relative overflow-hidden">
        <div className="relative z-10">
          <div className="font-mono text-2xl mb-12">SSS&mdash;02</div>
          <h2 className="font-display text-6xl md:text-8xl font-bold uppercase mb-6">
            Compliant
            <br />
            Stable
          </h2>
          <p className="font-sans text-xl mb-12 max-w-md">
            For regulated USDC/USDT-class tokens. On-chain blacklist enforcement
            and token seizure capabilities are mandatory.
          </p>
          <ul className="font-mono space-y-4 text-sm uppercase tracking-wide border-l-2 border-current pl-4">
            <li>+ All SSS-01 Features</li>
            <li>+ Permanent Delegate</li>
            <li>+ Transfer Hooks (Blacklist)</li>
            <li>+ Default Frozen State</li>
          </ul>
        </div>
        <div className="absolute -bottom-20 -right-20 font-display font-bold text-[30rem] leading-none opacity-5 group-hover:opacity-20 transition-opacity">
          2
        </div>
      </div>
    </section>
  );
}
