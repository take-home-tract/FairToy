# State machine

FairToy read from the code as a set of state machines. Each diagram names the request or button that moves it. It describes what the code does today. See [spec.md](spec.md) for the rules and [api.md](api.md) for the requests.

There are only two things the app stores and changes: **findings** (one per supplier) and **resolutions** (one per part of a toy). Everything else either is seeded once, or is **derived** on every read: the exposure of a part and of a toy, the counts, toys reached, the flag preview. The session, and the confirmation with Undo that follows a change, are two small machines in the browser.

## The whole picture

```mermaid
flowchart LR
    subgraph Stored["Stored in the Finisher's database"]
        F["Finding<br/>per supplier"]
        R["Resolution<br/>per part of a toy"]
    end
    subgraph Seeded["Seeded once, read-only"]
        S["Toys, parts, part sources"]
    end
    S --> E["Effective sources of each part of each toy<br/>(all sources, or only the recorded one)"]
    R --> E
    E --> PE["Part exposure"]
    F --> PE
    PE --> TE["Toy exposure<br/>(worst part)"]
    TE --> V["Counts, filters, toys reached,<br/>flag preview, why sentence"]
    U((User)) -- "Flag / Withdraw finding / Undo" --> F
    U -- "Which supplier made it? / Withdraw / Undo" --> R
```

## 1. Session (browser)

```mermaid
stateDiagram-v2
    [*] --> SignedOut
    SignedOut --> SignedIn: POST /api/auth/login (right password)<br/>token in session storage, cache emptied
    SignedOut --> SignedOut: wrong username or password
    SignedIn --> SignedIn: refresh the page (token survives)
    SignedIn --> SignedOut: Sign out (token discarded, cache emptied)
    SignedIn --> SignedOut: any 401: token expired (8 h),<br/>or the API restarted with a new random secret
    SignedIn --> [*]: tab closed (session storage gone)
```

On every request the API maps the token to a user and the user to one Finisher database. There is no state in which a request can reach another Finisher's file.

Every sign-in and every sign-out starts a new **session** in the browser (a counter in `auth.tsx`). The query cache is emptied at each change, and the session decides whether a pending Undo may still be offered (below).

### Confirmation with Undo (browser)

After a flag or a resolution, a confirmation at the bottom of the screen offers Undo. Undo sends a `DELETE` for the record's id, and ids only mean something inside one Finisher's database: the same id names a different record for another Finisher. So a confirmation belongs to the session the change **started** in (`notice.tsx`, `findings.ts`):

```mermaid
stateDiagram-v2
    [*] --> Hidden
    Hidden --> Shown: change succeeds,<br/>same session it started in
    Hidden --> Hidden: change from an earlier<br/>session finishes (dropped)
    Shown --> Hidden: Undo (DELETE)
    Shown --> Hidden: × or 12 s
    Shown --> Hidden: sign-out or sign-in<br/>(discarded, Undo never offered)
    Shown --> Shown: move to another page
```

The check is made while rendering as well, so there is not even one frame in which a new user could see the previous user's Undo. The end-to-end tests cover it: Kestrel Play flags a supplier, signs out, and Moonpath Brands signs in on the same tab within the 12 seconds; no confirmation appears, and Kestrel Play's finding is untouched.

## 2. Finding (one per supplier, per Finisher)

```mermaid
stateDiagram-v2
    [*] --> NoFinding: seed
    NoFinding --> Recorded: PUT finding ("Flag supplier" + confirm)<br/>stores who and when
    Recorded --> Recorded: PUT again (no change, keeps who and when)
    Recorded --> NoFinding: DELETE finding<br/>("Withdraw finding", or Undo after flagging)<br/>who and when are lost
    NoFinding --> NoFinding: DELETE again (no change)
```

Any user of the Finisher can do any of these. There is no other state: no "cleared", no "under review", no history.

## 3. Resolution (one per part of one toy, per Finisher)

Only for a part with two or more possible suppliers. For a part with one, `PUT` answers `single_source` and there is no machine.

```mermaid
stateDiagram-v2
    [*] --> Unresolved: seed (or added at startup to older databases)
    Unresolved --> ResolvedTo_S: PUT resolution {S}<br/>("Which supplier made it?" → S)
    ResolvedTo_S --> ResolvedTo_S: PUT {S} again (no change, keeps who and when)
    ResolvedTo_S --> ResolvedTo_T: PUT {T} (API only)<br/>replaces S, new who and when
    ResolvedTo_S --> Unresolved: DELETE resolution<br/>("Withdraw", or Undo after recording)
    Unresolved --> Unresolved: DELETE again (no change)
```

The UI only offers "Which supplier made it?" on an **unresolved, possibly affected** part. The API accepts a resolution on any multi-source part, whatever its exposure.

## 4. Part exposure (derived, never stored)

The exposure of one part of one toy follows from its **effective sources** E (all possible suppliers, or only the recorded one once resolved) and the implicated suppliers I. The machine below shows how the two stored machines move it. A resolved part has a single effective source, so it can never be Possibly affected.

```mermaid
stateDiagram-v2
    state Open {
        direction LR
        O_None: No finding<br/>(no source in E flagged)
        O_Poss: Possibly affected<br/>(some, not all, of E flagged)
        O_Aff: Affected<br/>(all of E flagged)
        O_None --> O_Poss: flag one of several sources
        O_None --> O_Aff: flag the only source
        O_Poss --> O_Aff: flag the remaining sources
        O_Poss --> O_None: withdraw the flagged sources
        O_Aff --> O_Poss: withdraw one of several flagged sources
        O_Aff --> O_None: withdraw the only flagged source
    }
    state Resolved {
        direction LR
        R_None: No finding<br/>(recorded supplier not flagged)
        R_Aff: Affected<br/>(recorded supplier flagged)
        R_None --> R_Aff: flag the recorded supplier
        R_Aff --> R_None: withdraw that finding
        R_None --> R_None: flag or withdraw any other source<br/>(no effect)
    }
    [*] --> O_None: seed
    O_Poss --> R_None: resolve to an unflagged source
    O_Poss --> R_Aff: resolve to a flagged source
    O_None --> R_None: resolve (API only)
    O_Aff --> R_Aff: resolve (API only)
    R_None --> O_None: withdraw resolution,<br/>no other source flagged
    R_None --> O_Poss: withdraw resolution,<br/>another source flagged
    R_Aff --> O_Aff: withdraw resolution,<br/>all sources flagged
    R_Aff --> O_Poss: withdraw resolution,<br/>another source not flagged
```

## 5. Toy exposure (derived)

A toy has no transitions of its own: it is the worst of its parts, recomputed on every read.

```mermaid
flowchart TD
    A{"Any part<br/>Affected?"} -- yes --> AFF["Toy: Affected"]
    A -- no --> B{"Any part<br/>Possibly affected?"}
    B -- yes --> POS["Toy: Possibly affected"]
    B -- no --> NONE["Toy: No finding in its chain<br/>(never 'safe')"]
```

So one event can move many toys at once: flagging Lianfa Group moves 22 of Kestrel Play's 40 toys. A resolution moves exactly one toy, and only if the resolved part was the worst one.
