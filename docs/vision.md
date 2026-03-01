# Vision: Open Collaborative Sessions

A protocol-native platform where any combination of humans and AI agents join a shared session, contribute structured artifacts, negotiate agreements, and build things together — using whatever creative process works for them.

---

## The Insight

The best collaborative work happens when people (and their agents) can bring their own process. Some teams do Event Storming. Some sketch APIs on a whiteboard. Some pair-program across boundaries. Some have an AI agent draft proposals that humans refine. The common thread isn't the methodology — it's the pattern: independent work, shared negotiation, formalized agreements, parallel execution, integration.

The platform shouldn't prescribe how you collaborate. It should make collaboration *work* — by giving every participant (human or AI) a standard way to join, contribute, negotiate, and verify.

---

## Design Principles

**Participants, not roles.** A session has participants. Some are humans typing in a browser. Some are AI agents connected via MCP or A2A. Some are automated services that validate, transform, or integrate. The platform treats them all as first-class participants with capabilities, not as "users" vs. "tools."

**Sessions, not workflows.** The core primitive is a session — a shared space with a join code, participants, and artifacts. What happens inside a session is up to the participants. The platform provides the substrate: structured artifact submission, comparison, conflict detection, agreement capture, and integration checking. How you use those primitives is your business.

**Protocols, not plugins.** Integration happens through open protocols. MCP for tool access and context sharing. A2A for agent-to-agent collaboration across organizational and framework boundaries. The platform is both an MCP server (exposing session tools to any connected agent) and an A2A participant (discoverable by and collaborative with agents from any framework). No SDKs to install, no vendor lock-in.

**Artifacts, not chat.** Collaboration produces structured artifacts — schemas, YAML files, design documents, contracts, test fixtures. The platform is built around artifacts with identity, versioning, and provenance. Chat and discussion happen elsewhere (Slack, calls, A2A message threads). This is where agreements become concrete.

**Show the seams.** The most valuable thing the platform can do is make cross-boundary contracts visible. Where do your outputs cross into someone else's territory? What assumptions are you making about their piece? Where have things drifted from what was agreed? These seams are where projects fail — make them impossible to ignore.

---

## What the Platform Provides

### 1. Session Lifecycle

A session is the container for a collaboration. Anyone can create one and get a join code.

- **Create / Join / Leave.** Humans join through a web UI. AI agents join through MCP tools or A2A discovery. A session persists until explicitly closed.
- **Participant registry.** Every participant has a name, a type (human / agent / service), declared capabilities, and a connection status. The registry is always visible — you can see who's in the session and what they can do.
- **Artifact submission.** Participants submit structured artifacts to the session. The platform validates them against declared schemas, timestamps them, and makes them visible to all other participants.
- **Session state.** The platform tracks what artifacts exist, what's been compared, what conflicts are unresolved, and what agreements have been captured. Any participant can query session state at any time.

### 2. Comparison and Conflict Detection

When multiple participants submit artifacts that cover overlapping territory, the platform detects it.

- **Cross-artifact comparison.** Automated diffing of submitted artifacts to surface overlaps, conflicts, and gaps. "Alice's schema says `amountCents: integer`. Bob's says `total: float`. These overlap."
- **Assumption surfacing.** Artifacts can declare assumptions about other participants' work. The platform highlights unmatched assumptions — questions that need answers before building.
- **Gap analysis.** Given a set of artifacts, identify what's missing. "Nobody has defined the error response format." Gaps are first-class, not afterthoughts.

### 3. Agreement Capture

The platform records decisions. Not in chat history — in structured, queryable, versionable form.

- **Conflict resolution records.** When participants resolve a conflict, the platform captures what was decided, who agreed, and what approach was chosen.
- **Ownership assignment.** Explicit, visual assignment of who owns what. No ambiguity about responsibility.
- **Unresolved tracking.** Things that couldn't be resolved get flagged and carry forward. They nag until they're settled.

### 4. Contract Formalization

Agreements become machine-readable contracts that participants can validate against while they work.

- **Schema generation.** From agreed artifacts, generate typed schemas, mock payloads, and validation rules.
- **Contract diffing.** When contracts change, show exactly what changed and who it affects.
- **Provenance.** For every field in a contract, trace it back to the artifact, session, and participants that produced it.

### 5. Integration Verification

Before merging, verify that independently-produced work actually fits together.

- **Contract compliance.** Does each participant's output match the agreed contracts?
- **Cross-boundary compatibility.** Do the pieces fit? Does what one participant sends match what another expects?
- **Drift detection.** Has anything changed since the contracts were agreed?
- **Go/no-go assessment.** A single view: ready to merge, or here's what needs resolution first.

---

## Protocol Architecture

The platform operates at the intersection of two complementary protocol layers:

### MCP: The Tool Layer

The platform exposes its full capability set as MCP tools. Any AI agent with an MCP client can:

- Create and join sessions
- Submit artifacts
- Query session state, comparisons, and conflicts
- Record resolutions and assignments
- Trigger integration checks

This means a human using Claude Code, a GPT-based agent, a custom LangChain pipeline, or any MCP-compatible system can participate in a session with equal capability. The agent's framework doesn't matter. The protocol is the interface.

### A2A: The Collaboration Layer

The platform is discoverable as an A2A agent, advertising its capabilities via an Agent Card. Remote agents can:

- Discover the platform and its session capabilities
- Initiate or join collaborative tasks
- Exchange artifacts asynchronously with other agents in a session
- Receive notifications about session state changes (new artifacts, conflicts, resolutions)

A2A enables scenarios MCP alone can't: an agent at Company A collaborating with an agent at Company B on a shared contract, each connected to different MCP servers but communicating through A2A's task-oriented protocol.

### The Combined Picture

```
Human (browser) ──────┐
                       │
Claude (MCP client) ───┤
                       │
GPT agent (MCP) ───────┼──→ [ Session Platform ] ←──→ [ Remote Agent (A2A) ]
                       │          │
Custom agent (MCP) ────┤          ├── Sessions
                       │          ├── Artifacts
Service (A2A) ─────────┘          ├── Comparisons
                                  ├── Agreements
                                  └── Integration checks
```

Every arrow is a standard protocol. No proprietary connectors.

---

## What This Enables

### Creative Processes We Don't Prescribe

The platform supports any structured collaboration pattern:

- **Event Storming** — participants submit domain event YAML, compare across bounded contexts, agree on ownership and schemas
- **API Design** — participants submit endpoint specs (OpenAPI, protobuf), compare request/response shapes, agree on contracts
- **Schema Negotiation** — database teams submit migration proposals, compare column definitions, agree on shared tables
- **Component Contracts** — frontend teams submit component interfaces (props, events), compare integration points, agree on boundaries
- **Data Pipeline Design** — teams submit stage definitions, compare input/output schemas, agree on transformation contracts
- **Anything with handoffs** — wherever two or more participants' work has to agree on a shape, the platform applies

### Human-AI Collaboration Patterns

The protocol-native design enables fluid mixing of human and AI work:

- **AI drafts, human refines.** An agent submits a first-pass artifact. A human reviews, edits, and resubmits. The platform tracks both versions.
- **Human decides, AI validates.** Humans agree on contracts in a call. Their agents formalize and continuously validate during implementation.
- **AI-to-AI negotiation.** Two agents submit conflicting proposals. A third agent (or human) mediates. The platform captures the resolution.
- **Progressive delegation.** Start with full human involvement. As patterns stabilize, delegate more to agents. The platform doesn't care who's driving — just that artifacts are valid and agreements are captured.

### Cross-Organization Collaboration

A2A makes it possible for agents from different organizations to participate in the same session. Company A's design agent and Company B's implementation agent negotiate an API contract through the platform, with humans from both sides reviewing and approving decisions.

---

## What This Is Not

- **Not a chat app.** Discussion happens in Slack, on calls, in A2A message threads. This is where agreements become artifacts.
- **Not a project manager.** No Gantt charts, no story points. The session lifecycle is the process.
- **Not a code editor.** People write code in their tools. This is the coordination layer above code.
- **Not a workflow engine.** The platform provides primitives, not prescribed phases. Use them in whatever order makes sense for your team.

---

## Success Criteria

The platform is successful when:

1. Any combination of humans and AI agents can join a session and collaborate productively, regardless of the AI frameworks involved.
2. Boundary assumptions surface before implementation begins, not at merge time.
3. Agreements produce machine-readable contracts directly — no post-meeting transcription.
4. Contract changes propagate visibly to every affected participant, immediately.
5. The platform feels like infrastructure, not ceremony. Adding structure shouldn't feel like adding bureaucracy.
6. A team's first session takes under 5 minutes to set up and produces value in under 30 minutes.
