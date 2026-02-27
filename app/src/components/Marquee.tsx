export default function Marquee() {
  const text =
    "MODULAR ARCHITECTURE \u2022 TOKEN-2022 \u2022 PERMANENT DELEGATE \u2022 TRANSFER HOOKS \u2022 COMPLIANCE PRESETS \u2022 OPEN SOURCE \u2022 ";

  return (
    <div className="marquee-container bg-accent hover-target">
      <div className="marquee-content">
        {text}
        {text}
      </div>
    </div>
  );
}
