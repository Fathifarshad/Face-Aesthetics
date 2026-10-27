import { ShieldCheck, Smartphone, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LangToggle } from '../components/ui';
import { useT } from '../i18n';

export function HomePage() {
  const t = useT();
  const cards = [
    { to: '/doctor', icon: Stethoscope, title: t.home.doctor, desc: t.home.doctorDesc },
    { to: '/client', icon: Smartphone, title: t.home.client, desc: t.home.clientDesc },
  ];
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-8 pt-6">
      <div className="flex justify-end">
        <LangToggle />
      </div>
      <div className="mt-10 flex flex-col items-center text-center">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-20 w-20 rounded-2xl shadow-[0_0_60px_-10px_rgba(212,175,55,.6)]" />
        <h1 className="gold-text mt-5 text-[34px] font-bold leading-tight">{t.app.name}</h1>
        <p className="mt-2 text-ink-secondary">{t.app.tagline}</p>
      </div>
      <div className="mt-10 flex flex-col gap-3">
        {cards.map(({ to, icon: Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-4 rounded-xl border border-border bg-gradient-to-br from-surface to-bg p-5 transition hover:border-gold/70"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gold-tint text-gold">
              <Icon size={26} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[17px] font-bold group-hover:text-gold-ink">{title}</span>
              <span className="block text-[13px] text-ink-secondary">{desc}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-auto flex items-center justify-center gap-2 pt-10 text-center text-[12px] text-ink-tertiary">
        <ShieldCheck size={16} aria-hidden /> {t.home.privacy}
      </p>
    </main>
  );
}
