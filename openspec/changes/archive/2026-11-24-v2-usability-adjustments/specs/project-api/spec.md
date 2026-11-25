## ADDED Requirements

### Requirement: Rename a project

`PATCH /api/projects/:id` with body `{ name }` MUST rename an existing project
for role `MEMBER` or `ADMIN`, trimming the name and rejecting empty or longer
than 200 characters values with the standard error envelope. Unknown projects
MUST return `404` without changes. The response MUST be the updated project
summary (`id`, `name`, `description`, `createdAt`, `updatedAt`).

#### Scenario: Member renames a project

- **WHEN** a `MEMBER` sends `PATCH /api/projects/{id}` with a valid new name
- **THEN** the response contains the new name and the stored project uses it
- **AND** an `events` row records `project.renamed` with the previous and new names

#### Scenario: Invalid or unknown rename is rejected

- **WHEN** the body has an empty name, or the project id does not exist
- **THEN** the response is `400` or `404` respectively with the error envelope
- **AND** no project name changes

#### Scenario: Viewer cannot rename

- **WHEN** a `VIEWER` sends `PATCH /api/projects/{id}`
- **THEN** the response is `403` with the error envelope
