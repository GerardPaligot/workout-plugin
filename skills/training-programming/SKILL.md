---
name: training-programming
description: "Methodology for building a strength-training program: macrocycle, mesocycles, microcycles, overreaching, supercompensation, deload. Use when: the user wants to build a program, asks about weekly volume or sets per muscle, organize their training cycles, plan their progression over several weeks/months, understand periodization, or asks about beginners, program variables or personalization."
---

> **Prerequisite:** if `profile.yaml` is missing at the workspace root, stop and run the `onboarding` skill first. Answer in `profile.language`, express loads and measurements in `profile.units`, and only propose exercises whose equipment is listed in `profile.equipment` (or needs none).

# Training programming: complete methodology

## Step 1 — Define a precise goal with a deadline

The first step (and the most important) is to define a **precise goal** with a **time limit**. Without it, no program can be coherent.

### What is not enough

- "Gain muscle" → too vague.
- "Lose fat" → too vague.
- "Gain strength" → too vague.

### What is needed

**Measurable** goals with a **deadline**. Example values below use cm; express them in `profile.units.length` (e.g. 1 in ≈ 2.5 cm):

- Gain 3 cm (about 1.2 in) of arm circumference in 6 months.
- Gain 4 cm (about 1.6 in) of chest circumference in 6 months.
- Lose 10 cm (about 4 in) of waist circumference in 6 months.
- Increase one's bench press max by 10% in 6 months.

### Prioritize the goals

If several goals coexist (muscle gain, fat loss, strength gain), **rank them by priority**. Each goal is handled in a dedicated mesocycle, not all at the same time.

### Realistic progression estimates (6 months)

| Goal | Realistic estimate |
|---|---|
| Muscle gain (measurements) | +2 to 5% (low end of the range), up to +10% possible |
| Fat loss (waist circumference) | Up to -10 cm (about -4 in) |
| Strength gain (max on exercises) | +10% on maximal loads |

These estimates assume consistency, patience and seriousness.

## Step 2 — Structure of the training cycles

Programming breaks down into 3 nested levels of cycles:

### Macrocycle (total duration of the program)

- Typical duration: **6 months**.
- Neither too long (loss of motivation) nor too short (insufficient results).
- Covers all the goals set.

### Mesocycles (training blocks)

- Typical duration: **2 months** (8 weeks).
- A 6-month macrocycle = **3 mesocycles**.
- Each mesocycle has a **specific goal** (e.g. strength gain → muscle gain → fat loss).
- The exercises stay **the same** for the whole duration of a mesocycle. What changes are the **variables** (reps, recovery, loads, volume).

### Microcycles (phases within a mesocycle)

- Each 8-week mesocycle is divided into **3 microcycles**:
  - Microcycle 1: **3 weeks**
  - Microcycle 2: **3 weeks**
  - Microcycle 3: **2 weeks**

## Step 3 — The 3 microcycles: mechanical → metabolic → overreaching

Each mesocycle follows the same structure of 3 microcycles with distinct characteristics:

### Microcycle 1 — Mechanical (3 weeks)

| Variable | Setting |
|---|---|
| Reps | **Low** (heavy sets) |
| Recovery | **Long** (2-3+ min) |
| Loads | **High** |

Focus on **mechanical tension**: it is the main factor of hypertrophy. Heavy loads, controlled execution, little metabolic fatigue.

### Microcycle 2 — Metabolic (3 weeks)

| Variable | Setting |
|---|---|
| Reps | **High** (light to moderate sets) |
| Recovery | **Short** (45s-1min30) |
| Loads | **Moderate** |

Metabolic stress is less decisive than mechanical tension for hypertrophy, but varying the rep ranges covers all the stimulation possibilities. It is also a way to **discover what works best** for oneself.

### Microcycle 3 — Overreaching (2 weeks)

| Variable | Setting |
|---|---|
| Volume | **Increased** (more sets) |
| Loads | **Increased** |
| Intensification techniques | **Yes** (isometric stretch, rest-pause, clusters…) |

Voluntary overload phase: you push the body beyond its usual comfort zone. The goal is to **provoke the stress needed** to trigger the supercompensation phenomenon.

**Important**: this phase lasts only 2 weeks. Longer, it would risk tipping into **overtraining** instead of functional overreaching.

## Step 4 — Deload and supercompensation

### Deload (3 to 7 days)

Immediately after the overreaching microcycle:

- **Reduce** training intensity and volume significantly.
- Duration: between 3 and 7 days.
- This is not complete rest — you train, but in a lighter way.

### Supercompensation

Supercompensation is the phenomenon by which the body, after a training stimulus followed by a recovery phase, returns to a **higher performance level** than the initial one.

- **Stimulus** (overreaching) → temporary **drop** in performance → **recovery** (deload) → **new, higher performance level**.
- If no new stimulus is applied after supercompensation, the performance level gradually **falls back** to the baseline.
- It is **after the deload** that measurements increase, waist circumference decreases, and strength progresses.

## Step 5 — Training format according to the goal

The training format (distribution of muscle groups per session) must be **consistent with the goal** of the mesocycle.

### Muscle gain

- Goal: maximize volume per targeted muscle group.
- Recommended format (5 sessions/week): **sessions by muscle group** (e.g. chest/back, shoulders/arms, legs) organized in a **cycle** so each muscle is trained several times per week.
- Example to develop arms + chest + thighs: 3 different sessions rotating over 5 days → each group trained several times per week.
- Exercise selection must reflect the targeted measurements (don't hammer the deltoids if the goal is arm circumference).

### Fat loss

- Goal: maximize caloric expenditure while preserving muscle.
- Recommended format: **upper/lower** → more muscle groups per session → more energy expenditure.
- Organize in **supersets** (chaining 2 or more exercises) to increase work density.
- Progression within the mesocycle: gradually reduce the **rest times** → same amount of work in less time = **increased work density**.
- Energy deficit comes mainly from diet, not from extra cardio; keep strength training as the main activity to preserve muscle (see skill `training-principles`, "Nutrition: fat loss").

### Strength gain

- Goal: increase maximal loads on the chosen exercises (e.g. squat, deadlift, bench press).
- **Low** rep ranges throughout the mesocycle.
- Progression: increase of the **working loads**.
- No need for long sets here.

### Recommended order of the mesocycles

If all 3 goals are targeted over a 6-month macrocycle, a coherent order is:

1. **Strength gain** (2 months) — lay the foundations, increase loads.
2. **Muscle gain** (2 months) — exploit the acquired strength for hypertrophy.
3. **Fat loss** (2 months) — refine the physique, finish in the best shape.

This order is not mandatory but lets you finish the macrocycle in your best form.

## Beginners (source's view)

Source's view (expert opinion): a beginner does not need to think about exercises, sets or reps; regular training is the only requirement.

- Work the whole body every session with basic exercises: 6 exercises per session, 10 minutes per exercise → sessions of about 1 hour.
- Alternate two different full-body sessions, 3 times per week, for at least 3 months (source: muscle gained, ready for the next level).
- No sets/reps/rest prescription: choose a load that challenges slightly, keep the same load, do as many reps as possible during the 10 minutes, rest when needed.
- Stage before learning the program variables (sets, reps, tempo, rest): a beginner need not ask about exercises, sets or reps; at the next level you learn the variables (see "Program variables and personalization").
- See `training-principles`, "Execution stability: quality criterion of a set" and "Order of progression: frequency → volume → intensity".

## Cross-cutting rules

### Every mesocycle ends with overreaching

Whatever the goal (muscle, strength, fat), the last microcycle is **always** an overreaching phase followed by a deload. It is the supercompensation mechanism that drives progress.

### Exercises don't change within a mesocycle

The exercises are fixed for the 8 weeks of the mesocycle. What changes between microcycles are the **variables**: reps, recovery, loads, volume, intensification techniques.

### Mixing goals reduces effectiveness

Trying to gain muscle, lose fat and gain strength **at the same time** in the same mesocycle → incoherent exercise selection, unsuitable rep ranges, suboptimal results. Separating the goals by mesocycle is more effective.

### Vary the rep ranges

Muscle gain is possible with sets of 5 reps as well as sets of 20 reps. Since you don't know a priori what works best for you, the microcycles let you **explore different ranges** within a single mesocycle.

### Program variables and personalization (source's view)

- Know the variables of a program and how to use them: exercise, sets, reps, tempo, rest, execution (execution is a variable too); see the `lifting-biomechanics` skill (tempo) and `training-principles`, "Execution stability: quality criterion of a set".
- Source's view: an evolving, personalized program adapts volume and exercise choice to strengths, weaknesses and preferences, stays coherent with the goal, and is organized in specific cycles that provoke specific changes (so planned mesocycle changes are not variety-driven).
- Following a program without knowing why, and changing it every 2-3 months just for variety, is a sign of not yet being experienced and may explain slow progress (see also `training-principles`, "Patience and commitment to your program").

### Weekly sets per muscle: progression (source's view)

- See "Beginners (source's view)": that stage uses no sets prescription.
- Source's view: the number of sets per muscle per week (and the rest time) can and should follow progressive overload like load and reps; the source reports its fastest progress from these two variables. Within a cycle, rest time can also vary (see "Vary the rep ranges" for rep ranges; consistent with "Exercises don't change within a mesocycle").
- Protocol (source's view, ≥ 3 months, modifying the current program or starting a new one):
  1. Start at the minimum: 6-8 sets per muscle per week depending on experience.
  2. Do all these sets at maximum intensity. When achieved, add 1-2 sets the next week.
  3. If not achieved, hold the same number of sets until maximum intensity is reached ("hyper important").
  4. If sessions tire more than usual, don't increase; hold the current volume.
- A cycle can start at low volume and end at 2-3x (e.g. 6-8 → 18-24 sets per muscle per week; the source said "per exercise" in the audio, likely a slip).
- Source's view over a longer horizon: to maximize muscle over ~6 months, high volume; over ~6 years, true periodization (phases of high volume, low volume, strength cycles). Muscle gain is a long process; no single method explains a lifetime of progress.
- Tension (flagged, not resolved): this source ramps volume weekly (+1-2 sets) over ≥ 3 months, gated by fatigue, whereas "Every mesocycle ends with overreaching" raises volume in a 2-week overreaching block followed by a deload. Two different progression models, same author, both expert opinion.
- See `training-principles`, "Weekly volume per muscle" for the categories (< 12 / 12-20 / > 20), diminishing returns and recovery limits.

## Summary of the typical structure

```
MACROCYCLE (6 months)
├── MESOCYCLE 1 — Strength gain (2 months)
│   ├── Microcycle 1 — Mechanical (3 wk)
│   ├── Microcycle 2 — Metabolic (3 wk)
│   ├── Microcycle 3 — Overreaching (2 wk)
│   └── Deload (3-7 days)
├── MESOCYCLE 2 — Muscle gain (2 months)
│   ├── Microcycle 1 — Mechanical (3 wk)
│   ├── Microcycle 2 — Metabolic (3 wk)
│   ├── Microcycle 3 — Overreaching (2 wk)
│   └── Deload (3-7 days)
└── MESOCYCLE 3 — Fat loss (2 months)
    ├── Microcycle 1 — Mechanical (3 wk)
    ├── Microcycle 2 — Metabolic (3 wk)
    ├── Microcycle 3 — Overreaching (2 wk)
    └── Deload (3-7 days)
```

## Sources

- Video: "Comment créer son programme de musculation (débutants)" (Nassim Sahili) — "How to create your strength-training program (beginners)"
- Video: "Les 5 niveaux de la PERTE DE GRAS expliqués (débutants à pro)" (Nassim Sahili) — "The 5 levels of fat loss explained (beginner to pro)" https://www.youtube.com/watch?v=Pi7j7C0aW1c
- Video: "À quel niveau de musculation êtes-vous vraiment ? (les 5 stades décryptés)" (Nassim Sahili) — "What training level are you really at? (the 5 stages explained)" https://www.youtube.com/watch?v=05WPpiDdC78
- Video: "Pourquoi tout le monde se met à faire 2 séries en MUSCULATION?" (Nassim Sahili) — "Why is everyone switching to 2 sets in strength training?" https://www.youtube.com/watch?v=1OsDiVvQT7k
