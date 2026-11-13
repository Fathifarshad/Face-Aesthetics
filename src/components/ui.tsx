import { ChevronLeft, ChevronRight, Languages } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { useApp } from '../store/app';

type BtnVariant = 'primary' | 'ghost' | 'soft' | 'danger';
const variants: Record<BtnVariant, string> = {
  primary: 'bg-gradient-to-br from-primary-on-tint via-primary to-primary-deep text-on-primary font-semibold shadow-[0_6px_24px_-10px_rgb(var(--primary)/.7)] hover:brightness-110',
  ghost: 'border border-border bg-surface text-ink hover:border-primary/60',
  soft: 'bg-primary-tint text-primary-on-tint hover:bg-primary-tint/70',
  danger: 'border border-danger/50 bg-transparent text-danger hover:bg-danger/10',
};

export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-touch items-center justify-center gap-2 rounded-sm px-4 text-[14px] transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ to, variant = 'primary', className = '', children }: { to: string; variant?: BtnVariant; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-touch items-center justify-center gap-2 rounded-sm px-4 text-[14px] transition ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function LangToggle() {
  const t = useT();
  const toggle = useApp((s) => s.toggleLang);
  return (
    <Button variant="ghost" onClick={toggle} className="px-3" aria-label={t.app.language}>
      <Languages size={18} aria-hidden />
      <span className="text-[13px]">{t.app.language}</span>
    </Button>
  );
}

export function Header({ title, back, right }: { title: string; back?: string | true; right?: ReactNode }) {
  const t = useT();
  const nav = useNavigate();
  const lang = useApp((s) => s.lang);
  const BackIcon = lang === 'fa' ? ChevronRight : ChevronLeft;
  return (
    <header className="no-print sticky top-0 z-20 flex items-center gap-2 border-b border-border/60 bg-bg/90 px-4 py-3 backdrop-blur">
      {back && (
        <button
          type="button"
          aria-label={t.app.back}
          onClick={() => (back === true ? nav(-1) : nav(back))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface hover:border-primary/60"
        >
          <BackIcon size={20} aria-hidden />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-[18px] font-bold">{title}</h1>
      {right}
    </header>
  );
}

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto w-full max-w-3xl px-4 pb-[calc(7rem+var(--tabbar-h))] pt-4 ${className}`}>{children}</main>;
}

/** Sticky bottom action bar (primary next step). */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="no-print fixed inset-x-0 bottom-[var(--tabbar-h)] z-20 border-t border-border/60 bg-bg/95 px-4 pb-[var(--bar-pb)] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl gap-2">{children}</div>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className = '',
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-touch rounded-full border px-4 text-[13px] transition ${
        active ? 'border-primary bg-primary-tint font-semibold text-primary-on-tint' : 'border-border bg-surface text-ink hover:border-primary/50'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Tag({ tone = 'neutral', children }: { tone?: 'neutral' | 'primary' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2',
    primary: 'bg-primary-tint text-primary-on-tint',
    warn: 'bg-risk-bg text-risk-fg',
    danger: 'bg-danger/15 text-danger',
    ok: 'bg-ok/10 text-ok',
  };
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] ${tones[tone]}`}>{children}</span>;
}

export function SeverityDots({ value, label }: { value: number | null; label?: string }) {
  return (
    <div className="flex gap-1" role="img" aria-label={label}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`h-2 w-6 rounded ${value !== null && i <= value ? (value >= 3 ? 'bg-priority' : 'bg-primary') : 'bg-surface-2'}`}
        />
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-touch cursor-pointer items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-primary' : 'bg-surface-2'}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-ink transition-all ${checked ? 'start-6' : 'start-1'}`} />
      </button>
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-primary-on-tint">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Notice({ tone = 'neutral', children }: { tone?: 'neutral' | 'warn' | 'danger' | 'primary'; children: ReactNode }) {
  const tones = {
    neutral: 'border-border bg-surface text-ink-2',
    warn: 'border-risk-fg/30 bg-risk-bg text-risk-fg',
    danger: 'border-danger/40 bg-danger/10 text-danger',
    primary: 'border-primary/40 bg-primary-tint text-primary-on-tint',
  };
  return <div className={`rounded-md border px-3 py-2 text-[13px] ${tones[tone]}`}>{children}</div>;
}
