# 🚆 TrackSquad — AI-Powered Automatic Block Planning

> **Intelligent Block Planning for Smarter Railways**

TrackSquad is an AI-assisted railway maintenance block planning system developed as a **Smart India Hackathon (SIH)** project. It helps railway planners identify suitable maintenance windows by combining **asset risk prediction, railway timetable constraints, existing maintenance blocks, resource availability, and optimization algorithms**.

The system transforms a traditionally manual planning process into a structured, data-driven and explainable workflow.

---

## 📌 Problem Statement

Railway maintenance requires temporary **blocks** on track sections so that maintenance teams can safely inspect or repair assets such as:

- Track infrastructure
- OHE systems
- Signals
- Bridges
- Points and crossings
- Other railway assets

Selecting an appropriate maintenance window is challenging because a proposed block must avoid conflicts with:

- 🚆 Train movements
- 🔧 Existing maintenance blocks
- 👷 Maintenance team/resource availability
- ⏱️ Maintenance duration
- 📅 Preferred maintenance windows
- ⚠️ Asset criticality and predicted risk

Traditional planning is largely manual and can make it difficult to consistently prioritize high-risk assets while efficiently utilizing available maintenance windows.

---

## 💡 Our Solution

TrackSquad provides an **AI-assisted decision-support system** that:

1. Processes railway datasets
2. Predicts asset risk using Machine Learning
3. Generates possible maintenance windows
4. Checks railway operational constraints
5. Optimizes feasible block allocations
6. Simulates and validates the generated plan
7. Provides explainable recommendations to planners

---

# 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript |
| UI | Tailwind CSS, Framer Motion, Lucide React |
| Charts | Recharts |
| Backend | Python, FastAPI |
| Database | PostgreSQL / Supabase |
| ORM | SQLAlchemy |
| Authentication | JWT, bcrypt |
| Machine Learning | Scikit-learn |
| ML Model | Random Forest |
| Optimization | Google OR-Tools CP-SAT |
| Data Processing | Pandas, NumPy |
| Model Serialization | Joblib |
| Testing | Pytest |
| Version Control | Git, GitHub |

---

# 📂 Project Structure

```text
Automatic-Block-Planning/
│
├── backend/
│   ├── app/
│   │   ├── constraints/
│   │   │   ├── candidate_generator.py
│   │   │   ├── constraint_engine.py
│   │   │   └── tests/
│   │   │
│   │   ├── ml/
│   │   │   ├── inference.py
│   │   │   ├── train_asset_risk_model.py
│   │   │   ├── asset_risk_ml_pipeline_2026.ipynb
│   │   │   ├── models/
│   │   │   └── reports/
│   │   │
│   │   ├── optimization/
│   │   │   ├── block_optimizer.py
│   │   │   └── tests/
│   │   │
│   │   ├── simulation/
│   │   │   ├── simulator.py
│   │   │   └── tests/
│   │   │
│   │   ├── auth.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── main.py
│   │
│   └── dataset/
│       ├── raw/
│       ├── processed/
│       ├── mapping/
│       ├── documentation/
│       └── scripts/
│
├── frontend/
│   ├── src/
│   │   ├── screens/
│   │   │   ├── Upload/
│   │   │   ├── BlockRequest/
│   │   │   ├── AiAnalysis/
│   │   │   ├── OptimizedPlan/
│   │   │   ├── Simulation/
│   │   │   └── FinalPlan/
│   │   │
│   │   ├── components/
│   │   ├── auth/
│   │   ├── config/
│   │   ├── assets/
│   │   └── styles/
│   │
│   ├── package.json
│   └── index.html
│
└── README.md
```

---

# 🚀 Getting Started

## Prerequisites

Make sure you have the following installed:

- Python 3.10+
- Node.js 18+
- npm
- PostgreSQL / Supabase
- Git

---

## 1. Clone the Repository

```bash
git clone https://github.com/Karsh-25/Automatic-Block-Planning.git
cd Automatic-Block-Planning
```

---

# ⚙️ Backend Setup

Navigate to the backend:

```bash
cd backend
```

Create a virtual environment.

### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

### macOS / Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Create/configure your environment file:

```text
backend/.env
```

Then start the FastAPI server:

```bash
uvicorn app.main:app --reload
```

Backend:

```text
http://127.0.0.1:8000
```

Swagger API Documentation:

```text
http://127.0.0.1:8000/docs
```

---

# 💻 Frontend Setup

Open a new terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the Vite URL displayed in your terminal.

---

# 📸 Project Snapshots

> Place your screenshots inside a `screenshots/` folder in the repository.

## 🏠 Landing Page

![TrackSquad Landing Page](screenshots/landing-page.png)

---

## 📤 Data Upload

![Data Upload](screenshots/data-upload.png)

---

## 📋 Block Request

![Block Request](screenshots/block-request.png)

---

## 🤖 AI Analysis

![AI Analysis](screenshots/ai-analysis.png)

---

## 🧠 Optimized Plan

![Optimized Plan](screenshots/optimized-plan.png)

---

## 💡 Explainable Recommendation

![Explainable Recommendation](screenshots/recommendation.png)

---

## 🧪 Simulation & Validation

![Simulation](screenshots/simulation.png)

---

## 📊 Final Plan

![Final Plan](screenshots/final-plan.png)

---

# ⚠️ Prototype Limitations

TrackSquad is an **AI-assisted decision-support prototype** and should not be considered an autonomous railway control or signalling system.

Current limitations include:

- Optimization depends on implemented constraints.
- Simulation does not model complete real-world train delay propagation.
- Optimization weights are configurable prototype parameters.
- Final maintenance decisions require human review and operational approval.
- Integration with real railway signalling and dispatch systems is outside the scope of this prototype.

---

# 🔮 Future Scope

- Real-time railway timetable integration
- Live train position integration
- IoT-based asset health monitoring
- Advanced predictive maintenance models
- Dynamic re-planning when train schedules change
- Multi-section network-wide optimization
- Advanced train delay propagation simulation
- GIS-based railway network visualization
- Integration with railway operational systems
- Historical maintenance-plan performance analytics
- Reinforcement Learning for adaptive scheduling

---

# 👥 Team

Developed as a **Smart India Hackathon (SIH)** project.

### TrackSquad Team

- Team Member: `Pushkar Mishra`
- Team Member: `Palak Srivastava`
- Team Member: `Nandani`
- Team Member: `Kaif Ansari`
- Team Member: `Youvraj Singh`
- Team Member: `Shanu Priya`

---

# 🏆 Smart India Hackathon

This project was developed as part of **Smart India Hackathon (SIH)** to apply **Artificial Intelligence, Machine Learning, Constraint Programming and Optimization** techniques to railway maintenance block planning.

---

# 📄 License

This project is developed for educational, research and hackathon purposes.

```text
MIT License
```

---

## ⭐ Support

If you find this project useful or interesting, consider giving the repository a ⭐.
