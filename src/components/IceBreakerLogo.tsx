type LogoTag = 'h1' | 'div';

export default function IceBreakerLogo({ as, className = '' }: { as?: LogoTag; className?: string }) {
  const Tag = as || 'h1';
  return (
    <Tag className={`icebreaker-logo font-black leading-none ${className}`}>
      <span className="icebreaker-logo-ice">ICE</span>
      <span className="icebreaker-logo-breaker">BREAKER</span>
    </Tag>
  );
}
