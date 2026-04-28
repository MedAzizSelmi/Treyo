'use client';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'accent';

const VARIANTS: Record<Variant, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  info: 'bg-info/15 text-info border-info/30',
  muted: 'bg-muted/15 text-muted border-muted/30',
  accent: 'bg-accent/15 text-accent border-accent/30',
};

export default function Badge({
  children,
  variant = 'muted',
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}
