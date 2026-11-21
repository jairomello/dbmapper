# Spec Delta

## Purpose

Fase 9 transforma o layout plano em documento `{ zones, layouts }`: o `GET`
devolve o registro de zonas junto com o posicionamento, e o `PUT` aceita o
documento novo ou o legado da Fase 7 (interpretado como zona `Principal`).
As demais requirements de `diagram-layout` (chave por nome de tabela, papéis,
auditoria e export intocado) permanecem sem mudança.

## MODIFIED Requirements

### Requirement: Layout endpoints

The API MUST expose `GET /api/projects/:id/diagram` returning the saved layout
document `{ projectId, zones, layouts }` — one `layouts` entry per zone with
its `positions`, `viewport` and `zoom` — and `PUT /api/projects/:id/diagram`
replacing it. The PUT accepts that zone document or the legacy flat layout
(`positions`, `viewport`, `zoom`), which is stored as zone `Principal`. An
unknown project MUST return `404` with the standard error envelope and change
nothing.

#### Scenario: Save and read back

- **WHEN** a `MEMBER` PUTs a layout and then GETs it
- **THEN** the response carries exactly the positions, viewport and zoom that were sent, inside the `layouts` entry of their zone

#### Scenario: Legacy flat layout is accepted

- **WHEN** a `MEMBER` PUTs the flat document without `zones` and then GETs it
- **THEN** the layout is stored for zone `Principal` and `zones` lists `Principal` holding every table of the model

#### Scenario: Unknown project is rejected

- **WHEN** either endpoint is called with a project id that does not exist
- **THEN** the response is `404` with the standard error envelope and no row is written
