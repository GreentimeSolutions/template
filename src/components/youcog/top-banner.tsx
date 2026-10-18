import { useGhostPfp } from "@/lib/youcog/ghost-pfp";

/** Small animated spy ghost (same shapes as public/favicon.svg). */
function BannerGhost() {
  const pfp = useGhostPfp();
  return (
    <span className="banner-ghost" aria-hidden="true">
      {pfp ? (
        <img src={pfp} alt="" className="size-full rounded-[10px] object-cover" />
      ) : (
        <svg viewBox="0 0 32 32" className="size-full">
          <path
            fill="#D7DDE6"
            d="M6.2 29.5V21.6c0-2.4 2.2-3.6 4.6-3.1l3.3 3.3c.6.7 1.2 1 1.9 1s1.3-.3 1.9-1l3.3-3.3c2.4-.5 4.6.7 4.6 3.1v7.9H6.2z"
          />
          <path
            fill="#ECEAE6"
            d="M10.5 13.4h11c1.4 0 2.3 1 2.3 2.5v2.8c0 2.1-1.7 3.4-3.7 3.4h-8.2c-2 0-3.7-1.3-3.7-3.4v-2.8c0-1.5.9-2.5 2.3-2.5z"
          />
          <g className="banner-ghost-hat">
            <path fill="#ECEAE6" d="M12.1 11.5C12.3 7.8 13.6 5.6 16 5.6s3.7 2.2 3.9 5.9h-7.8z" />
            <path
              fill="#ECEAE6"
              d="M6.3 12.5C8 10.9 10.8 10.2 16 10.2s8 .7 9.7 2.3c.5.5.2 1.2-.6 1.2H6.9c-.8 0-1.1-.7-.6-1.2z"
            />
            <rect x="12.3" y="10.15" width="7.4" height="1.15" rx="0.3" fill="#1a0b2e" />
          </g>
          <rect x="10.6" y="15.2" width="4.2" height="2.5" rx="0.7" fill="#1a0b2e" />
          <rect className="banner-ghost-wink" x="17.2" y="15.2" width="4.2" height="2.5" rx="0.7" fill="#1a0b2e" />
          <rect x="14.65" y="16" width="2.7" height="0.9" rx="0.3" fill="#1a0b2e" />
        </svg>
      )}
    </span>
  );
}

export function TopBanner() {
  return (
    <div className="top-banner flex h-14 shrink-0 items-center gap-3 px-4">
      <BannerGhost />
      <div className="min-w-0 leading-none">
        <p className="font-spooky text-2xl leading-none tracking-wide text-violet-100">YOUCOGNITO</p>
        <p className="mt-1 truncate text-xs text-mist">Private AI research on Base</p>
      </div>
    </div>
  );
}
