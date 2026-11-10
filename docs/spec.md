# Spec

What FairToy must do and why. No technology here: see [design.md](design.md) for how, and [decisions.md](decisions.md) for why we chose what we chose.

## The problem

Retailers will not sell toys made with child labor, anywhere in the chain. When a Finisher learns that one of its providers uses child labor, it must halt orders from that provider until the affected toys are recalled. To do that, the Finisher first needs to answer one question quickly: **which of my toys are exposed, and why?** The answer is buried in flat exports of suppliers, factories, parts and bills of materials.

FairToy is a SaaS platform for **Finishers**. They input their suppliers, parts and toys, flag a supplier for child labor, and see which toys are affected, traceable back to the flagged supplier.

## The chain

```text
Public <-- Retailers <-- Finishers <-- Providers (Suppliers + Basic Materials)
```

Our user works for a Finisher. Risk flows **up** the chain: a provider found using child labor taints the parts it makes, the toys that use those parts, and ultimately what the Retailer can sell.

## Facts from the assignment

1. Retailers will not sell a toy if any part of its chain used child labor.
2. If a Finisher's Supplier or Basic Materials provider is found to use child labor, the Finisher halts all orders from it until the affected toys are recalled.
3. FairToy's job: let Finishers input suppliers, parts and toys, flag a supplier, and see which toys are affected.
4. Minimum bar: see toys and their toy-part-supplier relations; flag a supplier; see affected toys traced from the toy back through its parts to the flagged supplier. Extra functionality is welcome.
5. Authentication (added by TRACT on 10 Nov 2026): a user belongs to one Finisher and must only see and act on that Finisher's data. Users are seeded per Finisher. No sign up, password reset, roles or third-party identity providers. Any session or token approach is fine. What is assessed is that the API enforces data isolation, not the login flow.
6. Out of scope: deployment, real-time updates, notifications.

## Facts from the data

- Six flat CSVs: 8 finishers, 50 suppliers, 232 factories, 400 distinct parts (422 rows), 300 distinct toys (305 rows), 10,463 BOM lines.
- 22 parts list **two possible sources** (different supplier, factory and cost). The BOM does not say which one made a given part.
- 5 toy IDs appear under two Finishers with different price and volume.
- The export combines all eight Finishers in one set of files, so the same part and supplier codes are used by the toys of several Finishers. A Finisher's own parts and suppliers are the ones its toys use.
- One supplier typically reaches about half of a Finisher's toys. For a Finisher with 36 toys, a single supplier makes a median of 18 of them affected (up to 27). Each Finisher reaches 49 of the 50 suppliers.
- 6 factories have no city or address.
- There is no data on Basic Materials, Retailers, purchases or orders.

## Language

| Term | Meaning |
|---|---|
| **Finisher** | A company that builds finished toys. FairToy's customer. |
| **User** | A person who signs in. A user belongs to exactly one Finisher. |
| **Provider** | A company a Finisher buys from: Suppliers today, Basic Materials companies later. Used only for the chain and the extension points; everywhere else we say **Supplier**. |
| **Supplier** | A contract manufacturer that produces parts across one or more factories. |
| **Factory** | A site of a supplier where a part is made. Shown for context; findings are not made against factories. |
| **Part** | A component of a toy. |
| **Part source** | A supplier, at one of its factories, that can make a part. |
| **Child labor finding** | A Finisher's recorded determination that a supplier uses child labor. "Flag" is only UI wording. See [D8](decisions.md#d8-name-it-a-child-labor-finding-not-a-flag). |
| **Implicated supplier** | A supplier the Finisher has a finding against. |
| **Exposure** | How a toy is touched by implicated suppliers: Affected, Possibly affected, or No finding in its chain. |

## Ownership

A user signs in and belongs to one Finisher. They see and act on that Finisher's data only, and the API enforces this on every request ([D16](decisions.md#d16-authentication-seeded-users-and-a-signed-token)). **All of a Finisher's data belongs to it alone**: its toys, its parts, its suppliers and its findings. Nothing is shared between Finishers, and no Finisher can see that another uses the same supplier. See [D1](decisions.md#d1-one-finishers-viewpoint) and [D2](decisions.md#d2-all-of-a-finishers-data-belongs-to-it).

## Exposure

For one Finisher's toy, looking at every part and every possible source of each part:

| Outcome | Meaning |
|---|---|
| **Affected** | Certain: for at least one part, *every* possible source is an implicated supplier. |
| **Possibly affected** | Needs validation: for at least one part, only *some* sources are implicated, so we cannot tell if the implicated one was used. |
| **No finding in its chain** | No part has any implicated source. This is **never "safe"**: it only means this Finisher has recorded no finding that touches the toy. |

Affected wins over possibly affected when both apply.

**What "affected" claims.** Affected means a toy's design uses a part that the implicated supplier could make. It does not mean units already shipped are tainted.

Exposure is always computed from the current findings, never stored.

**Trace path**

```text
Finisher -> Toy -> Part -> Supplier (implicated?)
```

## Assumptions and limits

- **Findings are at supplier level.** A finding is against a whole supplier. A finding about one factory is not modeled; the brief speaks of suppliers.
- **"No finding in its chain" depends on the input.** The system cannot tell whether a part's source list is complete, so its confidence is only as good as what the Finisher entered. It goes without saying, but it is worth stating. A part with no known supplier counts as having no finding; the sample data has none (every part has at least one).
- **Withdrawing hides two meanings.** "I clicked the wrong supplier" and "the supplier was cleared" are different and will later need different handling. Deleting without history is fine now. This is the point where the lifecycle will attach.
- **Data is seeded, not entered.** A seed step loads the six CSVs and creates the users, as the assignment asks. Entering or uploading data through the app is not part of this slice. See [D6](decisions.md#d6-data-is-seeded-not-entered).
- **Unneeded data is dropped.** Only what is needed to trace and to recognize things on screen is kept. See [D9](decisions.md#d9-drop-data-the-trace-does-not-need).

## Scope: where we stop

A user signs in, and everything they see and do is limited to their Finisher. The app then does the three things the assignment asks for as a minimum:

1. **See their toys and the relation between toys, parts, and suppliers.**
2. **Flag a supplier as using child labor** (record a child labor finding), picking it from the Finisher's own suppliers.
3. **See which toys are affected**, traceable from the toy back through the parts to the flagged supplier. Each toy is *affected*, *possibly affected*, or has *no finding in its chain*, and the toy list can be filtered by that outcome.

One addition of ours: **withdraw a finding**, so a mistaken click can be undone. A finding records who made it and when ([D4](decisions.md#d4-a-finding-can-be-recorded-and-withdrawn-with-no-history)).

Out of scope:

- Entering data through the app (upload, forms). The data is seeded.
- Sign up, password reset, roles and third-party identity providers. Users are seeded.
- Shipped units, batches, dates and orders. We have no data for them, so we cannot say which units already sold are tainted.
- Order halting or resuming, recall tracking, remediation, and a finding lifecycle.
- Sharing findings between Finishers.

## Extension points (not built now)

- **Data entry.** Finishers entering or uploading their own suppliers, parts and toys. The assignment lists it in the company description but not in the task, so we start from seeded data.
- **Purchase records.** Resolving a possibly-affected toy means checking which supplier actually delivered. We have no purchase data, so this could live in a separate system that feeds the app later.
- **Basic Materials.** They sell raw materials to suppliers, one level below them. The data has no companies and no supplier-to-material or part-to-material link, so there is no traceability. See [D7](decisions.md#d7-basic-materials-and-purchase-records-are-out-of-scope).
- **Finding lifecycle.** Real programs go further than recording a finding: protect the child, recall, run a corrective action plan, verify, then clear, keeping an audit trail. We do not build this. Withdrawing is where it will attach: "recorded by mistake" and "cleared after remediation" become different outcomes. Background reading on how remediation works in practice:
  - [ETI: Advice to companies ending child labour](https://www.ethicaltrade.org/insights/blog/advice-to-companies-ending-child-labour)
  - [US Department of Labor: Step 6, Remediate violations](https://www.dol.gov/agencies/ilab/SourceRight/steps-to-a-due-diligence-system/step-6-remediate-violations)
  - [Ethical Toy Program: Remediation program for suppliers](https://www.ethicaltoyprogram.org/en/remediationprogram-suppliers/)

## Acceptance checklist

The problem is solved when:

1. After signing in, a user sees only their Finisher's own toys, parts and suppliers.
2. Each toy shows its parts, and for each part its possible suppliers and where each makes it.
3. Recording a finding against supplier X changes exactly the toys that reach X: *affected* where every source of some part is implicated, *possibly affected* where only some are. Each shows its path to X.
4. A toy with no implicated source shows "No finding in its chain", never "safe".
5. Withdrawing the finding restores the previous statuses.
6. A finding recorded by one Finisher does not change any other Finisher's view.
   - Without a valid sign-in, the API refuses every data request.
   - A signed-in user cannot read another Finisher's toys, parts or suppliers, or read or change its findings, by any request. The Finisher always comes from the sign-in, never from what the request says.
7. The suppliers list shows the Finisher's own suppliers and whether each has a finding. A finding can be recorded or withdrawn from it.
8. The toy list can be filtered to *affected*, *possibly affected* or *no finding in its chain*.
