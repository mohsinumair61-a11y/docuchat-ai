import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The model returns markdown — headings, bold, numbered lists, tables.
 * Rendering it as plain text leaves literal ** and ### on screen, so it goes
 * through a renderer with element styling defined here rather than inherited,
 * because Tailwind's preflight strips list and heading defaults.
 */
export default function Answer({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}) {
  return (
    <div className="mt-3 text-[0.9375rem] leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => (
            <h3 className="mb-2 mt-5 text-[1.0625rem] font-semibold first:mt-0">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="mb-2 mt-5 text-[1rem] font-semibold first:mt-0">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mb-2 mt-4 text-[0.9375rem] font-semibold first:mt-0">{children}</h4>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          code: ({ children }) => (
            <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.8125rem]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-lg bg-raised p-4 font-mono text-[0.8125rem] last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-line pl-4 text-body last:mb-0">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-cite underline underline-offset-2">
              {children}
            </a>
          ),
          hr: () => <hr className="my-4 border-line-soft" />,
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-[0.875rem]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-line bg-raised px-3 py-2 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-line px-3 py-2">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
      {streaming ? <span className="caret" aria-hidden="true">&nbsp;</span> : null}
    </div>
  );
}
