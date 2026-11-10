# Take-home Assignment

Please find attached all the files you'll need to complete the assignment.
Please complete your assignment in 5 days, followed shortly by the interview to discuss your take-home assignment.
If you are unable to complete it and unable book the interview within 5 days due to planning issues, please reach out by replying to this email in advance.

## Overview

In this assignment we ask you to build a working slice of a real product. We're interested in how you model a messy domain, what you choose to build, and what you choose to leave out.
Expect to spend one to three hours, please don't spend more. We're not looking for a finished product; we're looking for deliberate choices and understanding of the problem.

## The Industry

The (constructed) toy industry has four types of companies: Retailers sell toys to the public; Finishers build packaged, finished toys for retailers; Suppliers are contract manufacturers that produce toy parts across multiple factories; and Basic Materials companies extract and sell raw materials to suppliers.

Retailers won't sell toys produced using child labor. If a Finisher's supplier is found to use child labor, the Finisher halts all orders from that supplier until the affected toys are recalled.

## The Company

Our company, FairToy, is building a SaaS platform for Finishers to input their suppliers, parts, and toys, flag a supplier for child labor, and see which toys are affected.

## Your Task

> Updated by the TRACT Recruitment Team by email on 10 Nov 2026: authentication was added and removed from the out-of-scope list.

Build a working application that lets a Finisher understand and act on child labor exposure across their product line. At minimum, a Finisher should be able to:
- See their toys and the relation between toys, parts, and suppliers
- Flag a supplier as using child labor
- See which toys are affected, traceable from the toy back through the parts to the flagged supplier
- See their toys and the relation between toys, parts and suppliers.

### Authentication

A user belongs to one Finisher and must only see and act on that Finisher's data. Keep it simple: seed one or more users per Finisher from finishers.csv. No sign up, password reset, roles, or third party identity providers are required. Any session or token approach is fine. We will assess that the API enforces data isolation, not the sophistication of the login flow.

Beyond the minimum, you may build additional functionality that might be useful to a Finisher.

**Out of Scope (not assessed)**: deployment and infrastructure, real-time updates/websockets/streaming, alerting/email/notifications.

## Technology

APIs in Python, frontend in React.
Everything else, framework, storage, libraries, project structure — is your choice.

We prefer spec-driven development at TRACT.
You're welcome to use AI tooling, but please don't ship anything you can't defend — you'll be asked to justify your code and architecture choices, including anything a tool wrote or proposed.

## What to Submit

Push your code to a repository and share the link.
Include a short README covering how to run it — nothing else is required in writing. A live URL is welcome but not expected.
If you run out of time before you run out of ideas, stop and note down what you would have done next.

## The Data

The attached toy_data.zip contains six CSV files, shaped like something exported from a customer's systems: messy, flat, and potentially redundant.

- finishers.csv: FairToy's customers
- suppliers.csv: Contract manufacturers
- factories.csv: Supplier sites
- parts.csv: Parts, and where each one is manufactured
- toys.csv: Finished toys
- bill_of_materials.csv: Which parts go into which toys, and in what quantity

You're free to transform, normalize, or restructure this data however you see fit, and to decide some of it isn't relevant.

## What Happens Next

During the follow-up interview slot you have booked, we'll open the code together and ask about how you modeled the data, what you left out and why, where you disagreed with a tool, and what breaks first as this grows.
