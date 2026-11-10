# UX

How FairToy looks and behaves for the person using it. The rules it shows come from [spec.md](spec.md); the data behind each screen comes from [api.md](api.md).

Numbers in the examples come from the sample data for the Finisher **Kestrel Play** (40 toys) and the supplier **Lianfa Group**.

## The user and what they need

A compliance or operations person at a Finisher. A report arrives that a supplier uses child labor, and they need to know within minutes which toys are hit and why, so they can act outside the app. They are not an administrator and do not manage data here.

Their jobs, in order of urgency:

1. **"This supplier was just reported. What does it touch?"** Flag it and see the effect.
2. **"Why is this toy marked?"** Follow the trace from the toy to the supplier.
3. **"What is my exposure right now?"** See totals and filter the toys.
4. **"I picked the wrong one."** Undo it.

## Principles

1. **Answer first.** Counts of affected, possibly affected and no-finding toys are always on screen.
2. **Never "safe".** "No finding in its chain" is neutral grey, never green and never worded as safe.
3. **Explain every status.** Each marked toy says in a sentence why, and shows the path.
4. **Show the consequence before it happens.** Flagging a supplier first tells the user which toys will change.
5. **Mistakes are cheap.** Every flag has an undo, right after and later.
6. **Context is always visible.** Which Finisher you are is always shown, and is part of the URL so a refresh or a shared link lands in the same place.
7. **Never color alone.** Every status has a word and a symbol as well as a color.

## Walkthrough

Maria works at Kestrel Play. A report names Lianfa Group.

1. She opens FairToy and picks **Kestrel Play** (no login).
2. She opens **Suppliers** and searches "Lianfa".
3. She presses **Flag supplier**. A dialog says: *22 toys reach this supplier. 13 would become Affected, 9 Possibly affected.*
4. She confirms. A message says *Lianfa Group flagged. 22 toys changed.* with an **Undo** link.
5. She opens **Toys**, filtered to Affected. 13 toys are listed.
6. She opens **Marble Digger**. It says: *Affected. The part "wheel" can only come from Lianfa Group, which you flagged.* One more part, "zip fastener", is only possibly affected.
7. She opens **Lantern Crane**. It says: *Possibly affected. "soft filling" can come from Lianfa Group (flagged) or Everstar Fabrication. We cannot tell which was used. Check your purchase records.*
8. If it was the wrong supplier, she presses **Undo**, or **Withdraw finding** later on the supplier.

## Screens

### Finisher picker

First visit: a short list of Finishers. After that, the current Finisher sits in the top bar and can be changed from there.

### Toys

```text
FairToy   Kestrel Play  [change]                     Toys | Suppliers
--------------------------------------------------------------------
40 toys     13 Affected     9 Possibly affected     18 No finding in chain

[ All 40 ] [ Affected 13 ] [ Possibly affected 9 ] [ No finding 18 ]   [ Search toys... ]

Toy              Code       Exposure              Parts touched
Marble Digger    TOY-0290   x Affected            2 of 22
Lantern Crane    TOY-0029   ~ Possibly affected   1 of 44
Saffron Kitchen  TOY-0136   - No finding          0 of 48
```

Sorted by exposure (affected first), then name. With no findings recorded, a banner reads *No findings recorded yet. Flag a supplier to see which toys it reaches.*

### Toy trace

Opens from a toy row, as a side panel or page with its own URL.

```text
< Toys     Marble Digger  TOY-0290                        x Affected
Why: the part "wheel" can only come from Lianfa Group, which you flagged.

Parts touched by a finding (2)
  wheel  PRT-0223                                          x Affected
    Lianfa Group (Turkey) — Cavite Plant, Philippines     [Finding]

  zip fastener  PRT-0044                                   ~ Possibly affected
    Lianfa Group (Turkey) — Rayong Plant, Thailand        [Finding]
    Pacific Precision (Vietnam) — Katowice Plant, Poland
  We cannot tell which supplier made it. Check your purchase records.

Other parts (20)  [show]
```

A possibly affected toy shows the alternative:

```text
  soft filling  PRT-0117                                   ~ Possibly affected
    Lianfa Group (Turkey) — Cavite Plant, Philippines     [Finding]
    Everstar Fabrication (Poland) — Katowice Plant, Poland
  We cannot tell which supplier made it. Check your purchase records.
```

Parts touched by a finding come first and are open. Parts with no finding are collapsed, since a toy has dozens of parts (a median of 35 in the sample data).

### Suppliers

```text
Suppliers reached by your toys (49)                         [ Search suppliers... ]

Supplier          Country   Toys reached   Finding
Lianfa Group      Turkey    22             [Finding] 10 Nov 2026    [Withdraw]
Sanhe Precision   Poland    27             None                     [Flag supplier]
```

A row opens a detail view listing the toys the supplier reaches, with each toy's exposure now.

### Flag confirmation

```text
Flag Lianfa Group for child labor?

22 toys reach this supplier:
  13 would become Affected
   9 would become Possibly affected
Only Kestrel Play sees this finding.

                                 [ Cancel ]  [ Flag supplier ]
```

If some of those toys are already exposed through other findings, the dialog counts only the toys that change.

## Wording

| Where | Text |
|---|---|
| Exposure labels | Affected, Possibly affected, No finding in its chain |
| Possibly affected help | We cannot tell which supplier made it. Check your purchase records. |
| No finding help | You have recorded no finding that touches this toy. This does not mean it is safe. |
| Primary action | Flag supplier |
| Undo action | Withdraw finding |
| Domain word in UI | "Finding" for the record, "flag" for the verb |

## States

- **Loading:** a quiet skeleton, not a spinner over a blank page.
- **Empty search or filter:** says what was searched and offers to clear it.
- **Error:** says what failed and offers retry. A failed flag leaves the screen as it was.
- **After a change:** the page refreshes from the server. Success is shown only once the server confirms.

## Routes

| URL | Screen |
|---|---|
| `/` | Finisher picker |
| `/finishers/:finisherId/toys` | Toys (the chosen filter is kept in the page URL) |
| `/finishers/:finisherId/toys/:toyId` | Toy trace |
| `/finishers/:finisherId/suppliers` | Suppliers |
| `/finishers/:finisherId/suppliers/:supplierId` | Supplier detail |

## Must have and nice to have

**Must have** (the assignment's minimum plus decisions already made): Toys list with exposure, toy trace, Suppliers list, flag, withdraw, filter by exposure.

**Nice to have** (cheap, but cut first if time runs out): the consequence preview in the flag dialog, the undo message after flagging, the supplier detail view, search.

Desktop first; it should stay usable on a narrow window, but a phone layout is not designed.
