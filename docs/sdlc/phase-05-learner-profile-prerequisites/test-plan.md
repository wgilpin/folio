# Test plan — Phase 05 Cross-Workspace Learner Profile & Interactive Prerequisite Chips

## Coverage

| Criterion | Epic | Kind | Test |
|---|---|---|---|
| DC-1 | `epic-01-learner-profile-and-prereq-seed-api` | automated | `src/server/__tests__/profile-prerequisites-api.test.ts` — `GET /api/profile and PUT /api/profile/topics persist topic familiarity across workspace switches` |
| DC-2 | `epic-01-learner-profile-and-prereq-seed-api` | automated | `src/server/__tests__/profile-prerequisites-api.test.ts` — `POST /api/doc/seed and POST /api/blocks/:id/branch store prerequisites on DocumentNode and pass LearnerProfile to generators` |
| DC-3 | `epic-01-learner-profile-and-prereq-seed-api` | automated | `src/server/__tests__/profile-prerequisites-api.test.ts` — `POST /api/prerequisites/seed spawns a linked child sub-document from blk_00 and marks the prerequisite topic as learning` |
| DC-4 | `epic-02-prerequisite-chips-ui` | automated | `src/client/__tests__/PrerequisiteChips.test.tsx` — `renders Prerequisite Chips in blk_00 and toggles topic known status via PUT /api/profile/topics` |
| DC-5 | `epic-02-prerequisite-chips-ui` | automated | `src/client/__tests__/PrerequisiteChips.test.tsx` — `seeds a prerequisite sub-document from blk_00 via POST /api/prerequisites/seed and navigates to the new child document` |

## Gaps

None. Every done criterion is covered by an automated test.
