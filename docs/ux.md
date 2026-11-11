# UX

How FairToy looks and behaves for the person using it. The rules it shows come from [spec.md](spec.md); the data behind each screen comes from [api.md](api.md).

Numbers in the examples come from the sample data for the Finisher **Kestrel Play** (40 toys) and the supplier **Lianfa Group**.

## The user and what they need

A compliance or operations person at a Finisher, with their own sign-in. A report arrives that a supplier uses child labor, and they need to know within minutes which toys are hit and why, so they can act outside the app. They are not an administrator and do not manage data here.

Their jobs, in order of urgency:

1. **"This supplier was just reported. What does it touch?"** Flag it and see the effect.
2. **"Why is this toy marked?"** Follow the trace from the toy to the supplier.
3. **"What is my exposure right now?"** See totals and filter the toys.
4. **"I picked the wrong one."** Undo it.
5. **"I checked my purchase records."** Record which supplier made a possibly affected part, and see the toy settle.

## Principles

1. **Answer first.** Counts of affected, possibly affected and no-finding toys are always on screen.
2. **Never "safe".** "No finding in its chain" is neutral grey, never green and never worded as safe.
3. **Explain every status.** Each marked toy says in a sentence why, and shows the path.
4. **Show the consequence before it happens.** Flagging a supplier first tells the user which toys will change.
5. **Mistakes are cheap.** Every flag has an undo, right after and later.
6. **Context is always visible.** The Finisher you belong to and your user name are always shown. You cannot switch Finisher; pages have their own URLs, so a refresh lands in the same place.
7. **Never color alone.** Every status has a word and a symbol as well as a color.

## Walkthrough

Maria works at Kestrel Play. A report names Lianfa Group.

1. She opens FairToy and signs in as `kestrel-play`. The top bar shows **Kestrel Play**, her Finisher. She sees nothing of any other Finisher.
2. She opens **Suppliers** and searches "Lianfa".
3. She presses **Flag supplier**. A dialog says: *22 toys reach this supplier. 13 would become Affected, 9 Possibly affected.*
4. She confirms. A message says *Lianfa Group flagged.* with an **Undo** link.
5. She opens **Toys**, filtered to Affected. 13 toys are listed.
6. She opens **Marble Digger**. It says: *Affected. The part "wheel" can only come from Lianfa Group, which you flagged.* One more part, "zip fastener", is only possibly affected.
7. She opens **Lantern Crane**. It says: *Possibly affected. "soft filling" can come from Lianfa Group (flagged) or Everstar Fabrication. We cannot tell which was used. Check your purchase records.*
8. Her purchase records say the soft filling came from Everstar Fabrication. Under the part, *Which supplier made it?*, she presses **Everstar Fabrication**. Lantern Crane now has no finding in its chain, and the part moves to *Parts you resolved*, with who recorded it and when. The Toys page shows 13 affected, 8 possibly affected.
9. If it was the wrong supplier, she presses **Undo**, or **Withdraw finding** later on the supplier.

## Screens

### Sign in

```text
FairToy

Username  [ kestrel-play        ]
Password  [ ********            ]
                      [ Sign in ]
```

Shown whenever the user is not signed in. A wrong username or password gives one message that does not say which was wrong. There is no sign up and no password reset; demo users are listed in the README. After signing in, the Finisher and user sit in the top bar with **Sign out**.

### Toys

```text
FairToy   Kestrel Play · kestrel-play  [Sign out]     Toys | Suppliers
--------------------------------------------------------------------
40 toys     13 Affected     9 Possibly affected     18 No finding in chain

[ All 40 ] [ Affected 13 ] [ Possibly affected 9 ] [ No finding 18 ]   [ Search toys... ]

Toy              Code       Exposure              Flagged suppliers in its chain   Parts touched
Marble Digger    TOY-0290   x Affected            Lianfa Group                     2 of 22
Lantern Crane    TOY-0029   ~ Possibly affected   Lianfa Group                     1 of 44
Saffron Kitchen  TOY-0136   - No finding          None                             0 of 48
```

Each exposed toy names the flagged suppliers behind it, so the list already answers "because of whom?". The names lead to the supplier.

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
    Everstar Fabrication (Thailand) — Katowice Plant, Poland
  We cannot tell which supplier made it. Check your purchase records.
  Which supplier made it?  [ Lianfa Group (flagged) ]  [ Everstar Fabrication ]
```

Choosing one records a resolution (with Undo, as after flagging). The part then reads:

```text
Parts you resolved (1)
  soft filling  PRT-0117                                   - No finding
    Lianfa Group (Turkey) — Cavite Plant, Philippines     [Finding]  not used
    Everstar Fabrication (Thailand) — Katowice Plant, Poland  [Used]
    Made by Everstar Fabrication · recorded 11 Nov 2026 by kestrel-play      Withdraw
```

Had she chosen Lianfa Group, the part and the toy would be Affected, and the why line says the part *came from* Lianfa Group. A resolved part stays in view, in *Parts touched by a finding* or in *Parts you resolved*, so it can be checked or withdrawn. In the Toys list the toy shows "1 part resolved".

Parts touched by a finding come first and are open. Parts with no finding are collapsed into a compact table, since a toy has dozens of parts (a median of 35 in the sample data). With no finding at all, the table is open.

Above the chain, one sentence sums it up (*22 parts from 20 suppliers. 18 parts have a single known supplier, 4 can come from more than one.*), and a switch offers a second reading of the same chain, **By supplier**:

```text
Flagged (1)
  Lianfa Group (Turkey) [Finding]    wheel PRT-0223 [only source]              [Withdraw finding]
                                     zip fastener PRT-0044 or Pacific Precision

Only source of a part (15)           A finding against one of these would make this toy Affected.
  Aequs Fabrication (China)          axle assembly PRT-0246 [only source]      [Flag supplier]
  ...

One of several sources (4)           A finding against one of these would make this toy Possibly affected.
  Pacific Precision (Vietnam)        zip fastener PRT-0044 or Lianfa Group     [Flag supplier]
```

This answers "who is behind this toy, and whom can it not do without?" before anything is flagged, and a supplier can be flagged from here. The chosen view is kept in the URL.

### Suppliers

```text
Your suppliers
[ All 49 ] [ With a finding 1 ]                          [ Search suppliers... ]

Supplier          Country   Parts it can make   Toys reached   Finding
Lianfa Group      Turkey    8                   22             [Finding] 10 Nov 2026    [Withdraw]
                                                               by kestrel-play
Sanhe Precision   Poland    9                   27             None                     [Flag supplier]
```

### Supplier detail

A row opens the supplier. The page is for someone deciding whether to flag it, or checking what a finding did, so it leads with the consequence and then shows the evidence:

```text
< Suppliers    Lianfa Group  SUP-028                               [Flag supplier]
Headquarters: Turkey · Finding: None

If you flag this supplier, of the 22 toys it reaches:
  13 would become Affected: it is the only source of a part they use
   9 would become Possibly affected: another supplier can make the part too

Parts it can make for you (8)
Part                    Made at                      Other possible suppliers   Used in
wheel PRT-0223          Cavite Plant, Philippines    None: only source          3 toys
soft filling PRT-0117   Cavite Plant, Philippines    Everstar Fabrication       7 toys

Toys it reaches (22)
Toy                       Through these parts                  Exposure now   If flagged
Marble Digger TOY-0290    wheel [only source]                  - No finding   x Affected
                          zip fastener or Pacific Precision
Lantern Crane TOY-0029    soft filling or Everstar Fabrication - No finding   ~ Possibly affected
```

Once the supplier is flagged, the panel reads *You flagged this supplier* with the current counts, and the "If flagged" column is dropped.

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
| Resolution prompt | Which supplier made it? |
| Resolved part | Made by *supplier* · recorded *date* by *user* |
| Domain word in UI | "Finding" for the record, "flag" for the verb |

## States

- **Loading:** a quiet skeleton, not a spinner over a blank page.
- **Empty search or filter:** says what was searched and offers to clear it.
- **Error:** says what failed and offers retry. A failed flag leaves the screen as it was.
- **Signed out or expired:** the user is sent to the sign-in page and returns to the same page afterwards.
- **After a change:** the page refreshes from the server. Success is shown only once the server confirms.

## Routes

| URL | Screen |
|---|---|
| `/login` | Sign in |
| `/toys` | Toys (the chosen filter is kept in the page URL) |
| `/toys/:toyId` | Toy trace |
| `/suppliers` | Suppliers |
| `/suppliers/:supplierId` | Supplier detail |

No URL names a Finisher; it always comes from the sign-in.

## Must have and nice to have

**Must have** (the assignment's minimum plus decisions already made): sign in and sign out, Toys list with exposure, toy trace, Suppliers list, flag, withdraw, filter by exposure.

**Nice to have** (cheap, but cut first if time runs out): the consequence preview in the flag dialog, the undo message after flagging, the supplier detail view, search.

Desktop first; it should stay usable on a narrow window, but a phone layout is not designed.
