# DBMapper v1 — versão estática (legado congelado)

Esta pasta contém a **versão 1 do DBMapper**: app web estático em HTML/CSS/JS puro,
sem build e sem backend — o editor (`dbmapper.html`) e o visualizador somente
leitura (`dbviewer.html`).

**Status: congelada.** Em 14/11/2026 o repositório foi reorganizado para virar uma
codebase profissional com a evolução v2 (servidor Bun + React + SQLite, multi-usuário,
autenticação e agente de IA) — a análise e a proposta estão em
[`../docs/analysis/`](../docs/analysis/). Regra para esta pasta: **não adicionar
novas funcionalidades aqui**; apenas correção de bug crítico se necessário. Código
novo só no v2.

## Como rodar (v1)

```bash
cd legacy
python3 -m http.server 8000
# Abra http://localhost:8000/dbmapper.html   (editor)
# Abra http://localhost:8000/dbviewer.html   (visualizador)
```

Também funciona abrindo `dbmapper.html` direto no navegador (`file://`).

Fluxo mínimo: **Importar SQL** (ex.: `example.sql`) → navegar na árvore → escrever
descrições → **Salvar** (exporta JSON) → abrir `dbviewer.html` com esse JSON.

## Testes (v1)

Os 5 contratos executáveis rodam a partir desta pasta:

```bash
cd legacy
node tests/sql-import.test.js           # parser de CREATE TABLE / FKs
node tests/update-model.test.js         # wizard de atualização de modelo
node tests/coverage-stats.test.js       # métricas de cobertura
node tests/dbviewer.test.js             # contrato do DBViewer
node tests/project-persistence.test.js  # ciclo de save/open do JSON
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `dbmapper.html` + `app.js` + `style.css` | editor de camada semântica (parser, wizard, árvore, editor) |
| `dbviewer.html` + `dbviewer.js` + `dbviewer.css` | visualizador somente leitura do JSON exportado |
| `example.sql` | fixture para testar o parser |
| `tests/` | contratos executáveis por capacidade |

O formato JSON exportado é o **contrato** entre editor e visualizador (e continua
sendo o formato de export do v2) — documentado no [`../README.md`](../README.md).
As specs comportamentais continuam em [`../openspec/specs/`](../openspec/specs/).
