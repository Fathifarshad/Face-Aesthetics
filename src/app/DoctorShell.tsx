import { Camera, ClipboardList, FolderOpen, Images, ScanFace, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { db } from '../db/db';
import { useT } from '../i18n';
import { useLive } from '../lib/hooks';
import { useApp } from '../store/app';
import { caseRoute, sectionHref, sectionOfPath, SECTIONS, type SectionId } from './sections';

const ICONS: Record<SectionId, LucideIcon> = {
  cases: FolderOpen,
  capture: Camera,
  simulate: ScanFace,
  plan: ClipboardList,
  gallery: Images,
};

/** Frame of the doctor app: the routed page plus the five-section tab bar. */
export function DoctorShell() {
  const { pathname } = useLocation();
  const routeCaseId = caseRoute(pathname)?.caseId ?? null;
  const setActiveCase = useApp((s) => s.setActiveCase);
  useEffect(() => {
    if (routeCaseId) setActiveCase(routeCaseId);
  }, [routeCaseId, setActiveCase]);

  return (
    <div className="has-tabbar">
      <Outlet />
      <TabBar pathname={pathname} />
    </div>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  const t = useT();
  const remembered = useApp((s) => s.activeCaseId);
  // A remembered case may have been deleted with its patient; only link to one that still exists.
  const exists = useLive(async () => (remembered ? (await db.cases.get(remembered)) !== undefined : false), [remembered]);
  const activeCaseId = remembered && exists ? remembered : null;
  const current = sectionOfPath(pathname);

  return (
    <nav
      aria-label={t.nav.sections}
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-3xl">
        {SECTIONS.map(({ id }) => {
          const Icon = ICONS[id];
          const active = id === current;
          return (
            <li key={id} className="min-w-0 flex-1">
              <Link
                to={sectionHref(id, activeCaseId)}
                aria-current={active ? 'page' : undefined}
                className={`flex h-[60px] flex-col items-center justify-center gap-1 text-label transition-colors duration-150 ${
                  active ? 'font-semibold text-primary' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Icon size={22} strokeWidth={2} aria-hidden />
                <span className="max-w-full truncate px-1">{t.nav[id]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
