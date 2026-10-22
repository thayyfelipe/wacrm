import type { ReactNode } from 'react';

// The paths are from the ElooFlow brand kit. currentColor keeps them legible
// in both modes and makes the selected navigation state visible.
function BrandIcon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function ReportsIcon({ className }: { className?: string }) {
  return (
    <BrandIcon className={className}>
      <path d="M4 20V11h4v9M10 20V5h4v15M16 20v-7h4v7" />
    </BrandIcon>
  );
}

export function ConversationsIcon({ className }: { className?: string }) {
  return (
    <BrandIcon className={className}>
      <path d="M4 5h16v12H9l-5 4z" />
      <path d="M8 9h8M8 13h5" />
    </BrandIcon>
  );
}

export function ContactsIcon({ className }: { className?: string }) {
  return (
    <BrandIcon className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2a6 6 0 0 1 12 0v2M17 8h4M19 6v4" />
    </BrandIcon>
  );
}

export function CampaignsIcon({ className }: { className?: string }) {
  return (
    <BrandIcon className={className}>
      <path d="M3 10v4h4l11 5V5L7 10zM7 14l2 6h3" />
    </BrandIcon>
  );
}

export function AutomationsIcon({ className }: { className?: string }) {
  return (
    <BrandIcon className={className}>
      <path d="M12 2 5 13h6l-1 9 9-12h-6l1-8z" />
    </BrandIcon>
  );
}

export function FlowsIcon({ className }: { className?: string }) {
  return (
    <BrandIcon className={className}>
      <rect x="2" y="9" width="7" height="6" rx="1" />
      <rect x="15" y="2" width="7" height="6" rx="1" />
      <rect x="15" y="16" width="7" height="6" rx="1" />
      <path d="M9 12h3V5h3M12 12v7h3" />
    </BrandIcon>
  );
}

export function SettingsIcon({ className }: { className?: string }) {
  return (
    <BrandIcon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </BrandIcon>
  );
}
