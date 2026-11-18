# Avaliação — transcrições dos 2 vídeos vs. nossas conclusões (docs 04/05)

> Fonte: `/mnt/shared/modelo/modelo-de-dados.txt` (vídeo 1, 40 falas) e
> `modelo-de-dados-2.txt` (vídeo 2, 167 falas), transcrições fornecidas pelo
> Jairo em 18/11/2026. Antes só tínhamos frames (ffmpeg, sem ASR) — esta é a
> primeira vez com o áudio completo.

## Resposta direta

**Nenhuma das 6 decisões muda.** O que muda é escopo: **1 delta de Fase 8
significativo**, 2 correções de interpretação e 4 itens novos de backlog.

## 1. Correção de interpretação — o que as abas realmente são

**Transcrição 1, falas 24–39:** *"cada um desses quadrados é uma base de dados
separada"* — e o modelo de template de permissionamento vem **somente leitura**;
você **"incorpora"** o diagrama no seu diagrama principal, e aí sim ele fica
editável (*"adicionar novas colunas"* e *"fazer relacionamento com o nosso
diagrama principal"*).

- No produto deles, **aba/diagrama = banco de dados separado** (com fronteira de
  schema), não apenas agrupamento visual. Por isso `dbForeignKey` tem
  `ref_diagramId`: **"Chaves entre diagramas" = FK que cruza fronteira de
  banco**.
- **Para nós não muda o plano, mas muda o registro:** nosso zone = agrupamento
  **lógico dentro de um único modelo** (o DBMapper importa um SQL por projeto).
  A derivação do doc 05 (§3.7: cross-zone = checar se origem/destino estão em
  zonas diferentes, **sem schema novo**) continua correta — e fica explicado o
  porquê: no deles é explícito porque é fronteira de banco; no nosso é
  derivado porque é fronteira de agrupamento.
- **"Incorporar diagrama"** (merge de um modelo template no principal, promovendo
  de somente-leitura para editável) é uma feature que **não temos e não está
  planejada** → backlog (ver §4).

## 2. Delta de escopo — Fase 8: auto-criar a coluna FK ao criar o relacionamento

**Transcrição 2, falas 27–30:** ao conectar `cidade → estado` pelo botão
**`1:n`**: *"a gente adiciona, e **automaticamente a ferramenta já adiciona
aqui estado ID** para a gente"*.

- Hoje nosso doc 04 (§3.4 / tabela de fases) diz só *"criar/editar/excluir
  relacionamento por handle + diálogo de cardinalidade"* — **faltava isto**:
  nosso modelo exige uma coluna no lado "N" para a relationship existir, então
  sem auto-criação o usuário teria que criar a coluna antes (dois passos).
- **Comportamento a especificar na Fase 8:** ao criar o relacionamento, o
  diálogo pré-marcado **"criar coluna `<tabela_destino>_id`"** (nome editável,
  tipo alinhado ao PK destino); confirmar manda coluna + relationship no
  mesmo `PUT /api/projects/:id` (é um PUT do modelo inteiro — cabe junto,
  sem endpoint novo).
- **Fluxo de criação é só 1:N:** o botão deles é literalmente `1:n`
  (`newConnection('one-to-many')` no HTML); 1:1/N:M/várias cardinalidades
  vivem nas propriedades do relacionamento, não na criação. Para nós:
  criação = 1:N com coluna auto-criada; popover de propriedades ajusta
  cardinalidade depois. (N:M com geração de tabela de junção é ideia futura,
  não entra.)

## 3. Confirmações fortes (com evidência de áudio agora)

- **Decisão 4 (flags `NN/UQ/AI/UUID` e "Coluna visualizável" fora do v1)** —
  a transcrição explica **porque** eles existem, e o motivo não é nosso:
  - *rótulo* (label): *"vai nos poupar tempo na hora de criar um formulário ou
    uma listagem de forma automática"* (fala 46) → geração de UI;
  - *coluna visualizável*: *"o Builder vai montar o formulário... automaticamente
    ele vai colocar uma combo... trazer o campo de visualização"* (falas 47–48)
    → geração de UI.
  - Nós não geramos formulário/listagem → **mantemos fora do modelo v1**. Era
    uma intuição do doc 04; agora é fato documentado.
- **Duas formas de criar tabela** (fala 5–8): botão *adicionar tabela* +
  clique no canvas, e **botão direito → "adicionar entidade"**. Confirma o
  delta 5 do doc 05 (menu de contexto nas coordenadas do cursor) como caminho
  principal, não opcional.
- **Arrastar tabela da árvore para o canvas** (fala 78: *"vou pegar aqui a
  tabela de System Users, eu vou arrastar ela aqui"*) — confirma o delta 9 do
  doc 05.
- **Card é redimensionável** (falas 87–88: *"vamos aumentar aqui o tamanho da
  nossa tabela"*) e o arranjo é **manual** (fala 16: *"vamos já ajeitando"*) —
  confirma: sem auto-layout (não temos também), resize = backlog.
- **Modelo template vem somente leitura** (fala 19) — mesmo padrão do nosso
  VIEWER; confirma o delta 3 do doc 05 (UI travada em read-only).

## 4. Backlog novo (não entra em 7/8/9)

1. **Propriedades de tabela de auditoria** (fala 109–112): marcar na tabela
   qual coluna é *criação / atualização / deleção* (`created_at` /
   `updated_at` / `deleted_at`) e a aplicação preenche sozinha; deleção
   **lógica**, não física. É metadado de modelo → mexe no contrato (mesma
   régua da decisão 4: fora do v1). Dá para o agente **inferir** por nome de
   coluna sem mudar o schema — anotar como sugestão, não como campo.
2. **Dialeto do banco na proposta** (falas 7–9): o *tipo* do banco escolhido
   no modelo guia a geração do `CREATE TABLE`. Se formos exportar DDL
   (backlog do doc 05), precisamos de uma propriedade de dialeto — sem ela,
   o export fica genérico demais.
3. **Modelos/template de tabelas pré-prontos** (fala 13–19 + `addTableTemplate`
   do HTML): preset de tabelas (ex.: permission) que entra somente-leitura e
   é incorporável. Junta com o backlog "templates de tabelas" do doc 05.
4. **Convenções de modelagem do curso** (não é feature, é guia): usam
   `varchar` em tudo porque *text* é problema em Oracle (fala 45) e booleano
   como `varchar(1)` com padrão `'T'/'F'` (falas 122–126). Se um dia
   publicarmos um "guia de modelagem" no viewer, são bons exemplos.

## 5. O que não aparece nas transcrições (sem mudança)

Save/autosave, undo/redo, minimapa, export, zonas de layout — os vídeos são
tutorial de modelagem (criar tabelas/colunas/FKs), não do chrome do canvas.
As conclusões do doc 05 sobre persistência/undo continuam valendo como estão.

## 6. Balanço das 6 decisões

| # | Decisão | Efeito das transcrições |
|---|---|---|
| 1 | React Flow | nenhum |
| 2 | Fase 7 primeiro | nenhum |
| 3 | Abas/zonas na Fase 9 | nenhuma mudança — mas zona = agrupamento lógico nosso, **não** banco separado (§1) |
| 4 | Flags fora do v1 | **fortalecida** (motivo deles = geração de UI, fala 46–48) |
| 5 | Auto-save com indicador | nenhum (assunto ausente dos vídeos) |
| 6 | Undo/redo na Fase 8 | nenhum |

**Ações:** Fase 8 ganha auto-criação da coluna FK (§2); docs 04/05 recebem
os ajustes de interpretação; §4 vai para o backlog da proposta v2 §10.1.
