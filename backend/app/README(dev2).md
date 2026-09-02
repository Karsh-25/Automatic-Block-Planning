# AI-Powered Automatic Railway Block Planning System
## Backend — Developer 2

This module is responsible for generating feasible and optimized railway maintenance block plans while minimizing disruption to train operations.

The system is an AI-assisted decision-support platform for railway planners/controllers. It does not replace the final decision-making authority of the railway planner.

---

## Developer 2 Responsibilities

Developer 2 handles:

- Candidate maintenance window generation
- Constraint engine
- Train conflict detection
- Existing block conflict detection
- Resource conflict detection
- Operational and configurable safety constraints
- Maintenance block optimization
- Optimal block plan generation
- Plan simulation and validation
- Explainable recommendations
- Backend APIs for optimization and planning

---

## Overall Pipeline

```text
Block Requests
      +
Train Timetable
      +
Existing Blocks
      +
Asset Risk Scores
      |
      v
Candidate Window Generation
      |
      v
Constraint Engine
      |
      v
Feasible Maintenance Windows
      |
      v
Optimization Engine
      |
      v
Optimal Block Plan
      |
      v
Simulation / Validation
      |
      v
Explainable Recommendation
      |
      v
FastAPI
      |
      v
Frontend Dashboard