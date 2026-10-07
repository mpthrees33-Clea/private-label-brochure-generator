import type { ReactElement } from "react";

// Next's RSC compiler rejects any module that can see both a shared
// brochure component and a static `react-dom/server` import. The PDF
// route needs renderToStaticMarkup, so the specifier is built at runtime
// and webpack is told not to trace it.
export async function renderMarkup(element: ReactElement): Promise<string> {
  const spec = "react-dom/" + "server";
  const mod = (await import(/* webpackIgnore: true */ spec)) as {
    renderToStaticMarkup: (node: ReactElement) => string;
  };
  return mod.renderToStaticMarkup(element);
}
