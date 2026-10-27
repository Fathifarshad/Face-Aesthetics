import { Header, Notice, Page } from '../components/ui';
import { useT } from '../i18n';
import { useApp } from '../store/app';

/** Clinical-lead-authored content only (docs/SAFETY.md §4); code never authors this text. */
const CONTENT = import.meta.glob('/content/emergency.*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {text.split(/\n{2,}/).map((block, i) => {
        if (block.startsWith('# ')) return <h2 key={i} className="text-[18px] font-bold text-gold-ink">{block.slice(2)}</h2>;
        if (block.startsWith('## ')) return <h3 key={i} className="text-[15px] font-semibold">{block.slice(3)}</h3>;
        if (/^[-*] /m.test(block))
          return (
            <ul key={i} className="list-disc ps-5">
              {block.split('\n').map((l, j) => (
                <li key={j}>{l.replace(/^[-*] /, '')}</li>
              ))}
            </ul>
          );
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}

export function EmergencyPage() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const text = CONTENT[`/content/emergency.${lang}.md`];
  return (
    <>
      <Header title={t.emergency.title} back />
      <Page>{text ? <Markdown text={text} /> : <Notice tone="danger">{t.emergency.missing}</Notice>}</Page>
    </>
  );
}
