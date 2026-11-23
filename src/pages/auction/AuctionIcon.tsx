export type AuctionIconName =
  | 'arrow'
  | 'back'
  | 'gavel'
  | 'clock'
  | 'shield'
  | 'heart'
  | 'share'
  | 'pin'
  | 'walk'
  | 'check'
  | 'close'
  | 'plus'
  | 'minus'
  | 'user'
  | 'home'
  | 'info'
  | 'expand'
  | 'sliders'
  | 'refresh'
  | 'chevron'
  | 'spark'
  | 'search';

const paths: Record<AuctionIconName, import('react').ReactNode> = {
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  back: (
    <>
      <path d="M19 12H5m6-6-6 6 6 6" />
    </>
  ),
  gavel: (
    <>
      <g transform="translate(0 1) rotate(-40 10 8)">
        <rect x="4" y="4" width="12" height="7" rx="1.2" />
        <path d="M4 3v9M16 3v9M10 11v9" />
      </g>
      <path d="M3 20h7a1 1 0 0 1 1 1v1H2v-1a1 1 0 0 1 1-1Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  heart: <path d="m12 20-8-8a5 5 0 0 1 7-7l1 1 1-1a5 5 0 0 1 7 7l-8 8Z" />,
  share: (
    <>
      <path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2" />
    </>
  ),
  pin: (
    <>
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  walk: (
    <>
      <circle cx="14" cy="4" r="1.5" />
      <path d="m11 8 3 2 3 1m-10 1 4-4-1 7-3 6m3-6 5 2 1 4" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  plus: <path d="M5 12h14M12 5v14" />,
  minus: <path d="M5 12h14" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v11H3V10Z" />
      <path d="M9 21v-8h6v8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v.1" />
    </>
  ),
  expand: (
    <>
      <path d="M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h5m5 0h6M4 17h10m4 0h2" />
      <circle cx="11.5" cy="7" r="2.5" />
      <circle cx="15.5" cy="17" r="2.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 8a8 8 0 1 0 .5 7M20 3v5h-5" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  spark: (
    <>
      <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
};

export function AuctionIcon({ name, size = 20 }: { name: AuctionIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 16 ? 2.4 : 2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
