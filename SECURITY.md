# Security Policy

## Versões suportadas

| Versão | Suportada |
|--------|-----------|
| `main` (mais recente) | Sim |

DBMapper não tem ciclo de release versionado. A `main` é a versão publicável; correções de segurança são merged em PR e a `main` é a fonte de patches.

## Modelo de ameaça

DBMapper é uma aplicação **inteiramente client-side**. Não há backend, banco de dados ou telemetria. O estado do projeto vive em memória na aba do navegador e é persistido apenas quando o usuário exporta explicitamente para um arquivo `.json` local.

A app **faz** as seguintes requisições de rede, todas no carregamento inicial da página, todas via CDN público:

- Materialize 1.0.0 (CSS + JS) — `cdnjs.cloudflare.com`
- Google Fonts (Inter, JetBrains Mono) — `fonts.googleapis.com` / `fonts.gstatic.com`
- Material Icons — `fonts.googleapis.com`

Essas CDNs são uma **fronteira de confiança**: se qualquer uma delas for comprometida, o atacante pode injetar código arbitrário no app no momento do próximo carregamento. Mitigações e limitações estão listadas em "Escopo".

### O que o app faz e não faz

- ✅ Lê arquivos **apenas** via `input type="file"` acionado pelo usuário.
- ✅ Persiste o projeto **apenas** em JSON que o usuário baixa e reabre explicitamente.
- ❌ Não usa `localStorage`, `sessionStorage`, `IndexedDB` ou cookies.
- ❌ Não envia dados do projeto para nenhum servidor.
- ❌ Não usa `eval`, `new Function` ou `document.write`.
- ❌ Não executa o SQL importado — o parser (`parseSQLToTables` em `app.js`) é um analisador léxico/sintático de `CREATE TABLE` / `ALTER TABLE … ADD CONSTRAINT`. Nenhum `INSERT`/`UPDATE`/`DELETE` ou DDL destrutivo chega a ser interpretado.
- ❌ Não interpola dados do projeto em `innerHTML` sem escape: nomes de tabela/coluna, descrições, termos de negócio e constraint names passam por `textContent` ou pelo helper `escapeHtml` (`app.js:1029`) antes de chegar ao DOM.
- ✅ Links externos (`dbmapper.html:230`) usam `rel="noopener noreferrer"`.
- ✅ **CSP** declarada via `<meta http-equiv="Content-Security-Policy">` em `dbmapper.html` e `dbviewer.html` restringindo `script-src`, `style-src`, `font-src`, `img-src`, `connect-src`, `object-src`, `base-uri`, `form-action` e `frame-ancestors` a uma allowlist explícita.
- ✅ **SRI** em todos os recursos de CDN: Materialize CSS 1.0.0 e Materialize JS 1.0.0 carregam com `integrity="sha384-…"` + `crossorigin="anonymous"` em `dbmapper.html`. Google Fonts é servida com CORS próprio, então não exige SRI pinado.
- ✅ **JS do DBViewer extraído** para `dbviewer.js`, e o CSS extraído para `dbviewer.css`. Nenhum `<script>` ou `<style>` inline em `dbviewer.html` (verificado por `tests/dbviewer.test.js`).
- ✅ **Sem handlers inline** em `dbmapper.html`. O único `onclick` foi refatorado para `id="btn-import-sql-cta"` + `addEventListener` em `app.js`.

### Limitações conhecidas

- ⚠️ **CSP via `<meta>`, não via header HTTP.** Por ser um site estático servido por qualquer HTTP server simples, o `Content-Security-Policy` é entregue como `<meta>` no `<head>` e não como header HTTP. Isso cobre a maior parte da superfície (script-src, style-src, font-src, etc.) mas não suporta diretivas que só fazem sentido no contexto de transporte, como `frame-ancestors` em alguns navegadores legados e `report-uri`/`report-to`. Para hardening adicional, recomenda-se adicionar o header no servidor que servir o site.
- ⚠️ **`'unsafe-inline'` em `style-src` no DBMapper.** O `dbmapper.html` ainda usa o atributo `style="display: none;"` em alguns elementos (toggles de visibilidade no editor) e isso requer `'unsafe-inline'` em `style-src`. Refatorar para a classe `[hidden]` reduziria a permissão no futuro.
- ⚠️ **Hashes SRI fixos.** Os hashes SRI de Materialize estão pinados para a versão `1.0.0` no cdnjs. Se essa versão for descontinuada ou o arquivo for modificado upstream, o `<link>`/`<script>` deixará de carregar. Mitigação: monitorar releases de segurança da dependência e atualizar a versão + hash em PR único.

## Relatando uma vulnerabilidade

Se você descobriu uma vulnerabilidade de segurança, **por favor não abra uma issue pública no GitHub**.

Em vez disso, reporte de forma privada:

1. Vá na aba **Security** do repositório no GitHub.
2. Clique em **"Report a vulnerability"** (GitHub private advisories).
3. Forneça: descrição do problema, passos para reproduzir, impacto potencial, e (opcionalmente) uma sugestão de correção.

A meta é confirmar o recebimento em **72 horas** e publicar uma correção em até **14 dias** para issues confirmadas.

## Escopo

### Dentro do escopo

- XSS (Cross-Site Scripting) via JSON ou SQL malicioso carregado pelo usuário.
- Prototype pollution via JSON malicioso.
- Exfiltração não intencional de dados do projeto (qualquer caso em que um arquivo importado cause um request de rede para um destino não- CDN-nominal).
- Bypass da lógica de atualização do modelo que permita sobrescrever descrições/termos sem confirmação do usuário.
- Vulnerabilidades introduzidas pelas dependências CDN (Materialize, fontes).

### Fora do escopo

- Engenharia social que exija acesso físico à máquina do usuário.
- Vulnerabilidades no próprio navegador.
- Vulnerabilidades em CDNs fora do nosso controle (reporte direto para o mantenedor da CDN).
- Issues que dependem do usuário desabilitar `Same-Origin Policy` ou extensões do navegador.
- Denial-of-service local (abas/janelas que travam por arquivos excessivamente grandes) — o app é cliente e o usuário controla os arquivos que abre.
