---
sidebar_position: 10
title: Operations Runbook
description: Day-2 operations, observability, and incident management
---

# Operations Runbook

This runbook provides the minimum procedures required for stable production operations.

## Monitoring Baseline

Track at least the following metrics:

- Successful and failed instruction counts by type
- Minted and burned supply deltas
- Freeze, blacklist, seizure, pause, and unpause events
- Backend API latency and error rates

## Alerting Baseline

Set alerts for:

- Unexpected mint spikes
- Unauthorized role-change attempts
- Repeated transfer-policy denials
- Health endpoint failures

## Change Management

All production changes should include:

- Change request ID
- Risk classification
- Rollback plan
- Post-change verification checklist

## Operational Procedures

### Daily

- Verify service health and RPC reachability.
- Review high-impact admin actions in logs.
- Confirm expected supply movement.

### Weekly

- Review role assignments and least-privilege posture.
- Validate key custody and signer access boundaries.
- Run incident simulation for pause/unpause process.

### Monthly

- Run full compliance action drills (freeze/blacklist/seize pathways).
- Review attestation and reserve evidence process.
- Update runbook based on incidents and retrospectives.

## Incident Handling

For critical incidents:

1. Stabilize: pause if policy requires immediate containment.
2. Investigate: gather transaction, signer, and timeline evidence.
3. Remediate: execute approved corrective actions.
4. Recover: return to normal operations with validation.
5. Review: publish post-incident report and control updates.

## Reference

- [Compliance and Security](./compliance-security)
- [Instructions Reference](./instructions-reference)
