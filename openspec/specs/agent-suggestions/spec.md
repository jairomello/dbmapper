# agent-suggestions Specification

## Purpose
The embedded agent's batch description-suggestion lifecycle: an LLM provider configured from env, generation jobs that collect model context and produce pending suggestions, a workspace queue where a human previews, edits, applies or rejects them, and an append-only audit trail. The agent writes descriptions but never decides approval.

## Requirements

### Requirement: LLM provider configuration

The API MUST resolve LLM credentials and model ids exclusively from environment variables (`OPENAI_API_KEY`/`OPENAI_MODEL`, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`). With no provider configured, a generation request MUST fail with the error envelope and code `LLM_NOT_CONFIGURED`; key material MUST NOT be stored in the database or returned in any response.

#### Scenario: No provider configured

- **WHEN** a generation request arrives while both provider env vars are empty
- **THEN** the response MUST be the error envelope with code `LLM_NOT_CONFIGURED`
- **AND** no `agent_jobs` row MUST be created

#### Scenario: Provider configured

- **WHEN** a generation request arrives with at least one provider env var set
- **THEN** an `agent_jobs` row MUST be created with status `queued`
- **AND** the response MUST NOT contain any key material

### Requirement: Suggestion generation request

Authenticated `MEMBER` and `ADMIN` users MUST be able to request a description-suggestion batch scoped to a project or to a single table; the request MUST create a queued job targeting only tables and columns whose `description` is empty. `VIEWER` users MUST receive 403.

#### Scenario: Project scope

- **WHEN** a `MEMBER` POSTs a generation request with scope `project`
- **THEN** a queued `agent_jobs` row MUST exist with scope `project` for that project
- **AND** the job MUST target every table and column of the project with an empty description

#### Scenario: Table scope

- **WHEN** a `MEMBER` POSTs a generation request with scope `table` and a `tableId`
- **THEN** the job MUST target only that table (if undescribed) and its columns with empty descriptions

#### Scenario: Viewer is read-only

- **WHEN** a `VIEWER` POSTs a generation request
- **THEN** the response MUST be the error envelope with status 403

#### Scenario: Nothing to suggest

- **WHEN** a generation request is accepted but every target item already has a description
- **THEN** the job MUST complete with status `succeeded` and zero suggestions created

### Requirement: Job claiming with lease

The worker MUST claim queued jobs through a conditional update that sets status `running` and a `lease_expires_at`; a job whose lease has expired MUST be reclaimable with an incremented attempt count.

#### Scenario: Expired lease is reclaimed

- **WHEN** a job is `running` with `lease_expires_at` in the past
- **THEN** a subsequent worker claim MUST transition it back to running with an incremented attempt count

### Requirement: Batch processing and suggestion persistence

Processing MUST collect context per table, call the provider in batches, and insert exactly one `pending` suggestion per target item — a new batch MUST replace any still-pending suggestion for the same item. If the provider fails mid-run, suggestions already written MUST remain `pending` and the job MUST end `failed` with a human-readable error.

#### Scenario: Successful run

- **WHEN** the worker finishes a job without errors
- **THEN** the job MUST have status `succeeded`
- **AND** one `pending` suggestion MUST exist per target item, each storing the context snapshot sent to the model

#### Scenario: Provider fails mid-run

- **WHEN** the provider errors after suggestions for k items were already written
- **THEN** those k rows MUST remain `pending`
- **AND** the job MUST have status `failed` with the error message in the payload

#### Scenario: Regeneration replaces pending suggestions

- **WHEN** a new batch targets an item that already has a `pending` suggestion
- **THEN** the old pending row MUST be replaced by the new one
- **AND** at most one `pending` suggestion MAY exist per item at any time

### Requirement: Suggestion queue in the UI

The workspace MUST expose a "Sugestões IA" panel listing the project's pending suggestions with a side-by-side preview — item path and context on one side, suggested text on the other — an empty state, and job progress refreshed by polling while a job is queued or running.

#### Scenario: Pending list with preview

- **WHEN** the project has pending suggestions
- **THEN** each row MUST show the table/column path and its context alongside the suggested description

#### Scenario: Live job progress

- **WHEN** a job for the project is `queued` or `running`
- **THEN** the panel MUST show its progress and refresh without a full page reload

#### Scenario: Empty state

- **WHEN** the project has no pending suggestions and no active job
- **THEN** the panel MUST show an empty-state message and the action to request a batch

### Requirement: Applying suggestions

`MEMBER` and `ADMIN` users MUST be able to apply one or many pending suggestions. Apply is a CAS transition from `pending` — any other status returns 409 — that writes the suggestion text as the item's `description`, sets `description_source='agent'` and `reviewed=false`, and MUST NEVER set `reviewed=true`. Applying over an approved item MUST reopen its review.

#### Scenario: Apply one suggestion

- **WHEN** a `MEMBER` applies a `pending` suggestion
- **THEN** the item's `description` MUST equal the suggestion text
- **AND** `description_source` MUST be `agent` and `reviewed` MUST be `false`
- **AND** the suggestion status MUST become `applied`

#### Scenario: Apply in bulk

- **WHEN** a `MEMBER` applies a selection of `pending` suggestions
- **THEN** every selected suggestion MUST transition to `applied` with its item updated the same way

#### Scenario: Applying over an approved item reopens review

- **WHEN** the target item has `reviewed: true`
- **THEN** after apply its `reviewed` flag MUST be `false`

#### Scenario: Stale apply is rejected

- **WHEN** apply targets a suggestion that is no longer `pending`
- **THEN** the response MUST be the error envelope with status 409
- **AND** the item's description MUST be unchanged

#### Scenario: Viewer cannot apply

- **WHEN** a `VIEWER` attempts to apply a suggestion
- **THEN** the response MUST be the error envelope with status 403

### Requirement: Editing suggestions

`MEMBER` and `ADMIN` users MUST be able to edit the text of a `pending` suggestion; the edit persists to the suggestion row (status stays `pending`) and the edited text is what apply writes. Editing a suggestion that is not `pending` MUST return 409.

#### Scenario: Edit then apply

- **WHEN** a user edits a pending suggestion's text and later applies it
- **THEN** the item's `description` MUST equal the edited text

#### Scenario: Editing a decided suggestion

- **WHEN** a user attempts to edit a suggestion with status `applied` or `rejected`
- **THEN** the response MUST be the error envelope with status 409

### Requirement: Rejecting suggestions

`MEMBER` and `ADMIN` users MUST be able to reject one or many pending suggestions through a CAS transition from `pending` to `rejected` (any other status returns 409), without changing the dictionary.

#### Scenario: Reject one suggestion

- **WHEN** a `MEMBER` rejects a `pending` suggestion
- **THEN** the suggestion status MUST become `rejected`
- **AND** the target item's description MUST be unchanged

#### Scenario: Reject in bulk

- **WHEN** a `MEMBER` rejects a selection of `pending` suggestions
- **THEN** every selected suggestion MUST transition to `rejected`

#### Scenario: Stale reject is rejected

- **WHEN** reject targets a suggestion that is no longer `pending`
- **THEN** the response MUST be the error envelope with status 409

### Requirement: Audit trail

Every generation request, apply, edit and reject MUST append a row to `events` with the acting user id, the action name, the subject ids, a payload and a timestamp. Events are append-only: no update or delete path MAY exist.

#### Scenario: Generation is recorded

- **WHEN** a generation request is accepted
- **THEN** an `events` row MUST exist with action `agent.generate_requested`, the actor id and the scope in the payload

#### Scenario: Decisions are recorded

- **WHEN** suggestions are applied or rejected
- **THEN** an `events` row MUST exist with action `agent.suggestions_applied` or `agent.suggestions_rejected`, the actor id and the affected suggestion ids

#### Scenario: Events are append-only

- **WHEN** the persistence layer is inspected
- **THEN** no repository method MAY update or delete rows in `events`
