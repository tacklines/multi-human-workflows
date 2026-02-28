# Vision: Multi-Human Workflows Collaborator

A companion app for teams using the tackline multi-human workflow. Not just a visualizer — a workspace that supports every phase of the collaboration lifecycle, from independent exploration through integration.

---

## The Opportunity

The tackline multi-human workflow has five phases: Prep, Jam, Formalize, Execute, Integrate. Today the app handles one: viewing storm-prep YAML output. The other four phases — where the actual collaboration happens — have no tooling support at all. Teams are left to coordinate via Slack messages, shared docs, and hoping everyone remembers what was agreed.

This vision describes what it looks like when the app supports the full lifecycle.

---

## Guiding Principles

**The workflow is the product.** Every feature should map to a phase in the workflow or to a transition between phases. If it doesn't help someone prep, jam, formalize, execute, or integrate — it doesn't belong.

**Humans coordinate, agents validate.** The app doesn't replace human judgment about what to build or how boundaries should work. It makes the human conversations more productive and ensures the agreements from those conversations are actually enforced.

**Show the seams.** The most valuable thing the app can do is make cross-boundary contracts visible. Where do my events cross into your territory? What assumptions am I making about your piece? Where have we drifted from what we agreed? These seams are where projects fail — make them impossible to ignore.

**Progressive engagement.** A team should be able to drag in one YAML file and get value in 30 seconds. Deeper features reveal themselves as the team moves through the workflow. Don't front-load complexity.

---

## Feature Areas

### 1. Prep Workspace

*Support the independent exploration phase before the Jam.*

Today people run `/storm-prep` and get a YAML file. The app can make this phase richer:

- **Live preview as you prep.** Load your storm-prep output and see your events, aggregates, and assumptions laid out visually — before you've shared anything with anyone else.
- **Assumption spotlight.** Surface your boundary assumptions prominently. These are the questions you need to bring to the Jam. "I'm assuming checkout sends me an orderId — is that right?" The app should make these impossible to forget.
- **Confidence heatmap.** Events tagged POSSIBLE or LIKELY should feel visually different from CONFIRMED ones. You should be able to glance at your prep and immediately see where you're guessing vs. where you're sure.
- **Prep completeness check.** Before heading into a Jam, a quick diagnostic: "You have 6 events, 3 assumptions, and 2 unresolved questions. Ready to jam?"

### 2. Jam Session Support

*Make the synchronous human conversation more productive.*

The Jam is the only phase where everyone needs to be in the same room (or call). The app should be the shared screen during that conversation:

- **Side-by-side prep comparison.** Load everyone's prep files simultaneously and see where they overlap, where they conflict, and where assumptions don't match. This is the conversation starter — "Your file says you emit CheckoutCompleted with orderRef, but my file assumes I'll receive orderId. Let's resolve that."
- **Live conflict resolution.** When you spot a mismatch in the Jam, resolve it right there. Click on a conflicting assumption, agree on a resolution, and the app records it. No more "write it in a Google Doc and hope someone transfers it."
- **Ownership assignment.** Drag events to owners. "Alice owns PaymentSucceeded. Bob owns CheckoutCompleted." Visual, unambiguous, and recorded.
- **Agreement capture.** As you resolve conflicts and assign ownership, the app builds the shared event catalog — the artifact that feeds the Formalize phase. Instead of writing a markdown file by hand after the meeting, you walk out of the Jam with a structured, machine-readable artifact already built.
- **Unresolved tracker.** Things you couldn't resolve in the Jam get explicitly marked "unresolved." They carry forward through the workflow, nagging you until they're settled. No silent unknowns.

### 3. Contract Dashboard

*Visualize and manage the formalized agreements.*

After `/formalize` produces schemas, mocks, and validation config, the app becomes the place where you see and manage contracts:

- **Contract browser.** Browse all formalized event schemas. See the fields, types, constraints, and confidence tags. "PaymentSucceeded: 5 fields, all CONFIRMED." vs. "RefundRequested: 3 fields, 1 POSSIBLE."
- **Cross-boundary map.** A visual map showing which events flow between which contexts. Alice's backend produces PaymentSucceeded, Bob's frontend consumes it. Draw that line. Make it obvious who depends on whom.
- **Contract diff.** When someone updates a schema, show exactly what changed. "amountCents changed from optional to required." This is the early warning system for contract drift.
- **Mock inspector.** View the mock payloads generated for each consumed event. "Here's what your tests will see when Bob's CheckoutCompleted arrives." Developers should be able to eyeball the mock and say "yeah, that looks right" before sprinting.
- **Field-level provenance.** For each field in a schema, trace it back: "This field was proposed in Alice's storm-prep, confirmed in the Feb 27 Jam, formalized in v1 of the schema." The full lineage of every decision.

### 4. Sprint Companion

*Keep contracts visible while people build.*

During the Execute phase, each person is head-down in their own code. The app serves as a persistent reference and early warning system:

- **Contract reference panel.** "What did we agree PaymentSucceeded looks like?" One click to see the schema while you're building. No hunting through Git for a YAML file.
- **Drift alerts.** If someone re-runs formalize or updates a schema mid-sprint, the app flags it: "PaymentSucceeded schema updated 2 hours ago — amountCents is now required." You learn about contract changes immediately, not at merge time.
- **Sprint progress by context.** Each team member can report their progress ("Payment aggregate done, Refund aggregate in progress"). The team gets a shared view of where everyone is without a standup.
- **Assumption resolution tracker.** Those "unresolved" items from the Jam? They show up here as a persistent nudge. "You still haven't resolved whether RefundRequested carries the Stripe webhook payload or a processed version."

### 5. Integration Hub

*Visualize the integration check results and guide resolution.*

When `/integrate` runs and produces its report, the app is where you understand the findings and act on them:

- **Integration report viewer.** FATAL, SERIOUS, ADVISORY findings displayed clearly. Not a wall of text — a navigable, filterable report.
- **Side-by-side resolution.** For each conflict: "Alice's code sends amountCents as number, Bob's code expects integer." See both sides, the proposed fix, and who needs to act.
- **Integration timeline.** Track integration runs over time. "First run: 3 FATAL, 2 SERIOUS. Second run: 0 FATAL, 1 SERIOUS." See the trajectory toward clean integration.
- **Go/no-go checklist.** A single view that says "you're clear to merge" or "these 2 things need resolution first." The final gate before code hits main.

### 6. Workflow Navigator

*Guide teams through the full lifecycle.*

The five phases are sequential with clear handoff points. The app should make the workflow itself navigable:

- **Phase indicator.** Where are we? Prep → Jam → Formalize → Execute → Integrate. A simple progress bar that reflects the current state based on what artifacts exist.
- **Phase transition guidance.** "You've loaded 2 prep files. Ready to start a Jam session?" or "Formalize output detected. You can start sprinting." The app coaches teams through the workflow without being prescriptive.
- **Artifact inventory.** At any point, see what exists: 2 prep files, 1 jam artifact, 3 schemas, 0 integration reports. Gaps are obvious.
- **Re-entry support.** Not everything is linear. Sometimes you need to go back — re-jam because contracts changed, re-formalize because the Jam surfaced something new. The app should make re-entry natural, not penalizing.

### 7. Multi-Session History

*Build institutional memory across collaboration cycles.*

Teams don't collaborate once. They build together over weeks and months:

- **Session timeline.** See past Jam sessions, what was decided, and how agreements evolved. "In the Jan session we agreed on amountCents. In the Feb session we added currency."
- **Decision log.** A searchable record of every decision made in Jam sessions. "Why is this field called amountCents and not totalAmount?" The answer is in the decision log from three weeks ago.
- **Pattern recognition.** Over time, the app notices patterns: "You and Bob always have conflicts about naming conventions. Consider establishing a naming guide." Light-touch insights, not prescriptive rules.

### 8. Team Awareness

*Know who's involved and what they own.*

- **Team roster.** Who's participating in this workflow? What contexts do they own? When were they last active?
- **Ownership map.** A clear, visual answer to "who owns this event?" at any point in the workflow. No ambiguity.
- **Notification preferences.** Let people choose how they want to learn about contract changes, integration results, and unresolved items. Not everyone wants the same level of detail.

---

## What This Is Not

- **Not an IDE.** People write code in their editors. This app is for the coordination layer above code.
- **Not a project manager.** No Gantt charts, no story points, no velocity tracking. The workflow is the process.
- **Not a real-time collaboration editor.** The Jam happens synchronously, but the app isn't Google Docs. It's a structured workspace for the specific artifacts this workflow produces.
- **Not a Git client.** People push and pull with their tools. The app reads artifacts from the filesystem (or eventually from a shared location), not from Git directly.

---

## Success Criteria

The app is successful when:

1. A team of 2-3 people can go from "we need to build X together" to "we've merged and shipped" without discovering integration mismatches at merge time.
2. Every boundary assumption surfaces before code is written, not after.
3. The Jam session produces a usable artifact directly — no post-meeting transcription needed.
4. Contract changes propagate visibly to everyone affected, immediately.
5. The workflow feels lightweight, not ceremonial. Adding structure shouldn't feel like adding bureaucracy.
