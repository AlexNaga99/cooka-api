import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { getDoc, Lang, LegalDoc } from './legal.content';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(doc: LegalDoc, lang: Lang): string {
  const pt = lang === 'pt';
  const email = (process.env.LEGAL_CONTACT_EMAIL ?? '').trim();
  const contact = email
    ? `<h2>${pt ? 'Contato' : 'Contact'}</h2><p><a href="mailto:${esc(email)}">${esc(email)}</a></p>`
    : '';
  const other = pt ? 'en' : 'pt';
  const sections = doc.sections
    .map((s) => `<h2>${esc(s.title)}</h2><p>${esc(s.body)}</p>`)
    .join('');
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} | Cooka</title>
<style>
:root{color-scheme:light dark}
body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:24px 16px 64px;background:#fff;color:#201b17}
main{max-width:720px;margin:0 auto}
.brand{color:#e85d04;font-weight:800;font-size:28px;letter-spacing:-1px}
h1{font-size:28px;margin:8px 0 4px;letter-spacing:-.5px}
h2{font-size:18px;margin:28px 0 6px}
p{margin:0}
.muted{color:#766d65;font-size:14px}
a{color:#e85d04}
@media (prefers-color-scheme:dark){body{background:#141210;color:#f4eee8}.muted{color:#a39a91}a,.brand{color:#ff7a2e}}
</style></head><body><main>
<div class="brand">cooka</div>
<h1>${esc(doc.title)}</h1>
<p class="muted">${esc(doc.updated)} · <a href="?lang=${other}">${pt ? 'English' : 'Português'}</a></p>
${sections}${contact}
</main></body></html>`;
}

/** Páginas públicas (URLs exigidas pelas lojas): /legal/terms e /legal/privacy. */
@ApiExcludeController()
@Controller('legal')
export class LegalController {
  private lang(l?: string): Lang {
    return l === 'en' ? 'en' : 'pt';
  }

  @Get('terms')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  terms(@Query('lang') lang?: string): string {
    const l = this.lang(lang);
    return render(getDoc('terms', l), l);
  }

  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  privacy(@Query('lang') lang?: string): string {
    const l = this.lang(lang);
    return render(getDoc('privacy', l), l);
  }
}
