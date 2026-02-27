export default function Footer() {
  return (
    <footer id="deploy" className="bg-ink text-paper py-32 px-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
      <div className="font-mono text-sm uppercase tracking-widest mb-12 text-accent">
        Initialize Your Protocol
      </div>
      <h2 className="text-huge font-display font-bold uppercase leading-none hover-target mix-blend-difference mb-12">
        Deploy
        <br />
        Now.
      </h2>
      <a
        href="https://github.com/amanhij/solana-stablecoin-standard-pre/tree/feat/sss-full-implementation/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="brutal-btn bg-paper text-ink px-12 py-6 font-display font-bold uppercase tracking-widest text-2xl hover-target mb-24"
      >
        Read The Docs
      </a>
      <div className="w-full max-w-7xl flex flex-col md:flex-row justify-between items-center border-t-2 border-paper/20 pt-8 font-mono text-xs uppercase">
        <div>Solana Stablecoin Standard</div>
        <div className="flex gap-8 mt-4 md:mt-0">
          <a href="https://github.com/amanhij/solana-stablecoin-standard-pre" target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">
            Github
          </a>
          <a href="https://superteam.fun" target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">
            Superteam
          </a>
        </div>
      </div>
    </footer>
  );
}
