# Spec Delta

## MODIFIED Requirements

### Requirement: Login and session UI

The app MUST show a login form when unauthenticated, establish the session via `POST /api/auth/login`, redirect to the project gallery on success, and surface login errors without revealing whether the email exists. A logout control MUST end the session and return to the login form.

#### Scenario: Unauthenticated lands on login
- **WHEN** the app loads without a valid session
- **THEN** the login form is the only visible surface and API calls are not made with a broken session

#### Scenario: Successful login lands on the gallery
- **WHEN** the user submits valid credentials
- **THEN** the app establishes the session and shows the project gallery (not a workspace)

#### Scenario: Failed login is generic
- **WHEN** the user submits a wrong password
- **THEN** the same generic error message is shown as for an unknown email
