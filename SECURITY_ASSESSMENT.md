# Security Assessment (2026-03-02)

## Scope and method

This assessment is an **architecture and configuration review** of the repository artifacts (Docker/runtime config + security policy + operations docs). It does **not** depend on standing up the gateway in this environment.

Reviewed files:
- `docker-compose.yml`
- `Dockerfile`
- `egress-rules.sh`
- `SECURITY.md`
- `RUNBOOK.md`
- `README.md`

## Executive summary

The repo demonstrates strong baseline hardening for a local-first agent runtime: non-root execution, read-only root filesystem, capability drop, loopback-only host exposure, explicit rate limiting, and detailed human/agent safety policy.

The most material architecture risks are:
1. **Build-time supply-chain drift** from `@latest` dependency install.
2. **Host-firewall dependency gap** where egress restrictions are not intrinsically enforced by the compose lifecycle.
3. **Missing explicit kernel policy profile declarations** (seccomp/AppArmor) in runtime config.

## Scores (1-10)

- **Security posture: 8.0 / 10**
- **Resilience posture: 7.4 / 10**
- **Red-team resistance: 7.3 / 10**

Rationale:
- High marks for least privilege and local exposure minimization.
- Score held back by deterministic build/provenance gaps and reliance on procedural controls for egress enforcement.

## Strengths observed

1. **Runtime least privilege is correctly emphasized**
   - Non-root container user.
   - `cap_drop: [ALL]` and `no-new-privileges:true`.
   - `read_only: true` root filesystem with constrained tmpfs.
2. **Host exposure is intentionally minimized**
   - Published ports are localhost-bound (`127.0.0.1`).
3. **Operational safety controls are explicit**
   - Auth rate limiting and command deny-list are documented and operationalized.
4. **Prompt-injection / misuse policy maturity**
   - `SECURITY.md` includes robust constraints for browser-origin instructions, secrets handling, and incident pause/escalation behavior.

## Prioritized improvements (highest ROI first)

### P0 — Pin dependencies and base image (do first)

**Finding**
- The Docker build installs `openclaw@latest`; this is non-deterministic and increases supply-chain unpredictability.

**Actions**
- Pin `openclaw` and `playwright` to explicit versions.
- Pin base image by digest (not only tag).
- Add a monthly dependency-review cadence with controlled upgrades.

**Impact**
- Immediate reduction in unreviewed behavior drift and compromise blast radius from upstream package events.

### P1 — Make egress control a hard prerequisite

**Finding**
- Egress filtering exists but is host-managed and can be omitted/misapplied outside runtime lifecycle.

**Actions**
- Add an explicit preflight script that fails startup if egress policy is missing.
- Include verification command(s) in runbook startup checklist and CI lint checks for policy presence.
- Prefer nftables-managed persistent policy if host distro is nft-native.

**Impact**
- Stronger exfiltration resistance and better containment under adversarial execution.

### P1 — Add seccomp/AppArmor profiles in compose

**Finding**
- Runtime hardening does not currently include explicit syscall/MAC profile attachments.

**Actions**
- Attach hardened seccomp profile and an AppArmor profile for the service.
- Validate profile compatibility with browser automation path.

**Impact**
- Shrinks kernel attack surface and increases breakout resistance.

### P2 — Add build provenance and artifact integrity

**Finding**
- No repo-native SBOM/provenance/signing workflow is documented.

**Actions**
- Generate SBOM during image build.
- Sign images and attest provenance.
- Keep generated metadata with release artifacts.

**Impact**
- Faster incident triage and improved supply-chain trust posture.

### P2 — Improve security observability and alerting

**Finding**
- Logging exists; actionable alert thresholds are not clearly automated.

**Actions**
- Alert on repeated auth lockouts, deny-command spikes, and unexpected relink patterns.
- Add a lightweight periodic control check (policy drift detector).

**Impact**
- Reduces attacker dwell time and improves operational resilience.

## Is it worth implementing these recommendations?

**Yes — absolutely worth it, and not diminishing returns.**

Why:
- The top three items are classic high-impact controls that close known attack paths (supply-chain drift, egress exfiltration, kernel attack surface).
- They are implementation-feasible in this repo’s architecture and materially improve real-world security outcomes.
- Expected uplift after P0/P1 adoption: roughly **+0.8 to +1.2 points** across each of the three scores.

## Validation performed

- Static architecture/configuration review of all files listed in scope.
- `bash -n egress-rules.sh` (syntax check) passed.
