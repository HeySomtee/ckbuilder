import { useState } from 'react';

export function TeamBadge({
  logo,
  code,
  side,
}: {
  logo: string | null;
  code: string;
  side: 'home' | 'away';
}) {
  const [failed, setFailed] = useState(false);
  return logo && !failed ? (
    <img
      className="team-logo"
      src={logo}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={`crest ${side}`}>{code.slice(0, 4)}</span>
  );
}
