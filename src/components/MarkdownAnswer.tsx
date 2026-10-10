import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Renders LLM answers as markdown (headings, lists, bold, tables, links). Raw HTML in the answer is
// not rendered: react-markdown escapes it by default, which keeps model output from injecting markup.

const components: Components = {
  h1: ({ children }) => <h3 className="text-base font-black text-slate-900 dark:text-white mt-4 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="text-sm font-black text-slate-900 dark:text-white mt-4 first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-3 first:mt-0">{children}</h5>,
  h4: ({ children }) => <h5 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-3 first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-slate-900 dark:text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-slate-200 dark:border-slate-700 pl-3 my-2 text-slate-500 dark:text-slate-400">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[12px] font-mono text-slate-800 dark:text-slate-200">{children}</code>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-[12px] font-mono">{children}</pre>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline underline-offset-2 break-words">{children}</a>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-xs text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-400">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-black">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">{children}</td>,
};

export default function MarkdownAnswer({ children }: { children: string | ReactNode }) {
  if (typeof children !== 'string') return <div>{children}</div>;
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>
    </div>
  );
}
