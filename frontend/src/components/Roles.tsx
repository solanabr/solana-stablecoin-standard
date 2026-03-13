export default function Roles() {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Roles Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {["Minter", "Burner", "Pauser", "Blacklister", "Seizer", "Freezer"].map(
            (role) => (
              <div
                key={role}
                className="p-4 rounded-lg bg-zinc-800/40 border border-zinc-700/50"
              >
                <span className="text-amber-400/90 font-medium">{role}</span>
                <p className="text-xs text-zinc-500 mt-1">Manage holders</p>
              </div>
            )
          )}
        </div>
      </section>
      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">Assign / Revoke Roles</h3>
        <p className="text-sm text-zinc-500">
          Connect your wallet and select a stablecoin to manage roles. (UI stub — blockchain integration pending.)
        </p>
      </section>
    </div>
  );
}
