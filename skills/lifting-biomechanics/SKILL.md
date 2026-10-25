---
name: lifting-biomechanics
description: "Biomechanical principles applied to strength training: line of force, lever arm, stretch tension and contraction tension. Use when: the user asks about how to perform an exercise, how to optimize a movement, or why an exercise stimulates a given muscle."
---

> **Prerequisite:** if `profile.yaml` is missing at the workspace root, stop and run the `onboarding` skill first. Answer in `profile.language`, express loads and measurements in `profile.units`, and only propose exercises whose equipment is listed in `profile.equipment` (or needs none).

# Biomechanics applied to strength training

## Line of force

The **line of force** is the representation of the force you are resisting during an exercise.

- **Free weights**: the line of force follows gravity (always vertical, pointing down).
- **Machines / cables**: the line of force follows the path of the cable or the machine's mechanism. It is less intuitive to visualize.

## Lever arm

The **lever arm** is the perpendicular distance between the joint involved and the line of force.

- The **longer** the lever arm, the more the muscle responsible for the movement is **loaded**.
- The **shorter** the lever arm, the less work the muscle does → other muscles compensate.

### Reference joint by muscle group

| Muscle group | Reference joint |
|---|---|
| Lats / Teres major | Shoulder |
| Biceps / Triceps | Elbow |
| Hamstrings / Quadriceps | Knee |

### Practical application

1. **Identify** the line of force on each exercise.
2. **Visualize** the lever arm (shoulder ↔ line of force distance for the back, etc.).
3. **Optimize** your execution to keep a large lever arm throughout the rep.
4. With an optimal lever arm, you get better activation of the target muscle and less compensation.

### Example: lat pulldown

- **Good execution** (long lever arm) → excellent lat stimulation, little biceps/forearm compensation.
- **Poor execution** (short lever arm) → weak lat stimulation, heavy biceps/forearm compensation.

Same exercise, same sets, same reps, same rest times — but execution changes everything.

**Lever arm and forearm position**: on a lat pulldown, the **forearm should stay perpendicular to the floor**. If the arm is too flexed (handle very close to the shoulder), the lever arm at the shoulder is **shortened** → the latissimus dorsi works less. Keeping the handle slightly away from the shoulder increases the lever arm and maximizes the stimulus.

**Other lever-arm examples (source's view)**:
- California press: bar lowered to the neck instead of the chest → very large lever arm at the elbow, vs the close-grip bench (see the `triceps-training` skill).
- Front squat: lever arm between line of force and knee is not especially large unless mobility is great or heels are raised; a back squat with raised heels does the same (see the `quadriceps-training` skill).

## Stretch tension vs contraction tension

Each exercise has a resistance profile that creates peak tension at a different point in the range of motion:

- **High stretch tension**: resistance is greatest when the muscle is lengthened (e.g. lat pulldown for the lats).
- **High contraction tension**: resistance is greatest when the muscle is shortened (e.g. seated row for the lats).
- Other examples (source's view): hip thrust → high contraction tension; one-arm dumbbell row → contraction; stiff-leg deadlift → rather stretch; machine dips for the triceps → neither extreme (uses the length-tension relationship, see below).

For complete development of a muscle, you need to cover both types of tension. This lets you train the muscle through its **full range of motion**.

Source's view: contraction-tension exercises are usually easier to feel, so they suit a weak point until it has caught up enough to use stretch-tension exercises, which are harder to feel but probably more effective for muscle gain (see `shoulder-training`, `biceps-training`).

## Movement path and muscle fiber direction

For optimal stimulation, the path of the movement should be **aligned with the direction of the muscle fibers**.

Example for the lats: the fibers run from the outside to the inside → a **converging** movement (from the outside toward the inside) is superior to a linear one.

To determine whether an exercise is effective, look at the fiber direction of the targeted muscle and check that the movement actually loads the muscle in that direction. If a component of the movement (e.g. internal rotation) does not match the fiber direction, it provides **no additional stimulation** and is useless.

### Importance of morphology

An exercise's effectiveness also depends on **individual morphology**, in particular the orientation of the fibers relative to the line of force.

Example for the chest:
- **45° incline press**: the fibers directly opposing gravity are mostly those of the anterior deltoid, not the clavicular fibers of the pectorals.
- The **flatter** the rib cage and the more **vertical** the sternum, the less the clavicular fibers will be loaded on an incline.
- The **thicker** the rib cage and the more **inclined** the sternum, the more relevant the incline press can be.
- A flat or slightly decline bench press puts **more pectoral fibers** in direct opposition to gravity for most morphologies.

Example for the quadriceps:
- **Long femurs** → the squat and leg press favor hip flexion (glutes/posterior chain) rather than knee flexion (quadriceps).
- **Short femurs** + good hip mobility → the squat and press can target the quadriceps better.
- When in doubt, prefer exercises where knee flexion is maximized (linear hack squat, leg extension, walking lunges with short steps).
- Front vs back squat: emphasis depends on execution, neither is automatically quadriceps or posterior chain (see the `quadriceps-training` skill).

General rule: check that the fibers of the targeted muscle are **perpendicular to the line of force** in the exercise position. Otherwise, other muscles are doing the primary work.

### Horizontal force vs vertical force (free weights)

With free weights, the force applied is always **vertical** (gravity). Trying to produce a **horizontal** force (e.g. squeezing two dumbbells against each other in the squeeze press) has **no** biomechanical effect with free weights, because the resistance is not in that direction.

## Force curve and resistance curve

### A muscle's force curve

The **force curve** represents how much force a muscle fiber can produce as a function of its length (active force only):

- At **both extremes** (muscle fully contracted or fully stretched): **low** force production.
- In the **middle** of the range of motion: **maximal** force production.

### An exercise's resistance curve

The **resistance curve** describes at which point in the movement the resistance is greatest. It depends on the tool used:

| Tool | Resistance curve |
|---|---|
| Dumbbells (raises) | Maximal at the top (muscle contracted), zero at the bottom → high contraction tension |
| Cable (raises) | Maximal in the middle of the movement → better synchronized with the force curve |
| Variable-resistance machine | Designed to be hard at the right moments → potentially the best synchronization |
| Resistance bands (added to a machine) | Increase resistance at the end of the movement → improve the resistance curve |

- Source's view: the resistance curve is specific to each exercise and variant, while the force curve is specific to the muscle (biceps, pecs, hamstrings differ) and also varies between individuals (insertions, amount of tendon, muscle shape).

Why the lateral raise differs by tool (lever arm, see "Lever arm"): with a dumbbell and the arm along the body, the dumbbell sits under the shoulder joint → ~zero lever arm and resistance; with the arm raised, the lever arm is largest → resistance maximal (rising curve). With a cable set at the lowest pulley, resistance is small at the bottom, small at the top and maximal in the middle where the cable is perpendicular to the arm → bell-shaped curve.

Same arm path with different curves gives somewhat different effects on the muscle (source's view): program each variant on purpose; depending on the individual, one variant may suit better. Use the curve to judge whether an exercise fits your strengths and weaknesses and to pair complementary movements.

### Synchronizing the two curves

The goal is to **synchronize** the resistance curve with the muscle's force curve:

- When the two are aligned → the muscle can produce maximum force where the resistance is greatest → **more weight lifted, for longer, better stimulation**.
- When they are out of sync → the movement is very hard at a point where the muscle is weak (contracted) and very easy where it is strong (middle) → suboptimal stimulation.

### Pitfall: starting an exercise in a deeply stretched position

If an exercise starts with the muscle **deeply stretched** and the resistance is already high at that point, the muscle cannot produce enough force → **compensation** by other muscle groups over the first few centimeters.

Examples:
- High-cable pullover leaning far forward → very hard at the start (lat stretched and weak), triceps compensate.
- Supinated-grip lat pulldown with arms fully extended → same problem.

**Solutions**: (1) stay more upright so the muscle is slightly less stretched at the start, (2) start with a slight bend (not arms fully extended), (3) gradually increase the range of motion over the weeks/months.

### The cable: a tool for manipulating the resistance curve

The cable lets you **redirect the line of force** (along the cable instead of gravity) and thereby modify an exercise's resistance curve.

**Execution tip**: position your body so the cable is **perpendicular to the bone segment** (humerus, femur...) at about the **middle of the movement**. This creates an optimal resistance curve synchronized with the force curve.

Examples:
- Cable lateral raises > dumbbell lateral raises (better curve).
- Bent-over cable reverse fly > dumbbell version.
- Cable front raises > dumbbell version.
- Curl with back to the low pulley vs drag curl: the free weight resists along gravity (vertical), the cable redirects the line of force → more range and stretch (see the `biceps-training` skill).

## Constant tension

An exercise has **constant tension** when the muscle is forced to produce force from the start to the end of the movement, with no dead point.

### Conditions for constant tension

- At **no point** in the range of motion should the bone segment (forearm, humerus...) be aligned with the line of force.
- If a segment aligns with the line of force → the lever arm drops to zero → no more tension on the muscle.

### The cable favors constant tension

The cable redirects the line of force along the cable. By choosing your position well, you can make sure the bone segment is **never** aligned with the cable → constant tension guaranteed.

Example: cable curl facing the pulley (dual-pulley / crossover station) → neither the forearm nor the humerus is aligned with the cable, at the start or the end of the movement → constant tension + high stretch tension.

### Converging machines and constant tension

**Converging machines** (where the machine's arms move closer together at the end of the movement) can offer true constant tension, sometimes better than the cable.

- The machine's architecture makes the weight **move away from the axis of rotation** at the end of the movement → harder at the top than at the bottom.
- This reduces the involvement of other muscle groups (e.g. anterior deltoid on a chest press).
- **Warning**: not all brands are equal. The quality of the convergence and of the resistance curve varies by manufacturer.

**Important**: the cable does **not automatically** guarantee constant tension. It depends on body position and on the exercise. The term "constant tension" is often misused.

## Machine path: linear vs circular

A machine's path directly affects which muscles and which joints are loaded.

### Linear path

- The platform or carriage moves in a **straight line** along a predefined axis.
- Easily **adaptable** to different morphologies (adjust foot position, body position).
- Examples: linear hack squat, linear leg press, Smith machine.

### Circular path

- The platform pivots around a **fixed axis of rotation**.
- The path imposes a **hip flexion / knee flexion** ratio that can barely be changed.
- Common problem: too much hip flexion, not enough knee flexion → works the glutes/posterior chain instead of the target muscle (e.g. quadriceps).
- Examples: circular leg press, V-squat, pendulum squat.

### Rule

To target a specific muscle (e.g. quadriceps via knee flexion), prefer **linear-path** machines that let you maximize flexion at the joint involved.

## Humerus/gravity alignment for free weights

For free-weight curl exercises (dumbbells, barbells), the **humerus must stay perpendicular to the floor** (parallel to gravity) throughout the movement.

- If the elbows flare out (humerus on a diagonal) → misalignment with gravity → suboptimal work + risk of elbow pain.
- Special case: the EZ bar encourages flaring the elbows → recurring alignment problem.
- The unilateral dumbbell curl lets you compensate for an elbow valgus by leaning slightly to the side.

## Length-tension relationship and compound exercises

Muscle fibers produce less force at the **extremes** of their range (deeply stretched or deeply contracted) and more force in the **middle**.

Some **compound** exercises exploit this property by shortening the muscle on one side of the joint while lengthening it on the other, thereby keeping the fibers in an **optimal position** for force production throughout the range of motion.

### Examples

| Exercise | Target muscle | Mechanism |
|---|---|---|
| Dips (bench/machine) | Triceps | Shortens at the elbow (extension) while lengthening at the shoulder |
| Supinated-grip pull-ups (chin-ups) | Biceps | Shortens at the elbow (flexion) while lengthening at the shoulder |

These exercises allow excellent **progressive overload** because you can always produce a lot of force → you can use heavy loads → high mechanical tension.

**Warning**: the length-tension relationship alone is not enough to make an exercise good. The drag curl also exploits this mechanism but remains suboptimal (minimal range of motion, instability, trapezius compensation).

## Inertia vs muscular force production

When you perform a movement very quickly (explosive eccentric and concentric), part of the load is moved through **inertia** rather than through force production by the muscle fibers.

### The tempo test

If adding a controlled tempo (e.g. a 3-second eccentric) forces you to **reduce the load significantly**, it means your regular sets relied partly on inertia.

- A controlled tempo **should not** reduce your working load on the eccentric.
- Slowing the **concentric**, on the other hand, does reduce performance → this is **not recommended** for hypertrophy (go as fast as possible on the concentric).
- A slow eccentric (~3 seconds) normally has no negative impact on performance if the load is appropriate.

### Tempo recommendation

- **Eccentric**: ~3 seconds, controlled and smooth.
- **Concentric**: as fast as possible (no deliberate slowing).
- Smoothness of the movement is key: no jerking, no sudden jolts.

## Mandatory vertical path (free weights, hypertrophy)

On all pressing movements performed with **free weights** or **bodyweight** (barbell/dumbbell bench press, incline press, decline press, dips), the path must be **vertical**.

### Why

- With free weights, the line of force is vertical (gravity). A circular or diagonal path creates force components that load non-target muscles (deltoids, triceps).
- The goal in hypertrophy is to **isolate** the target muscle as much as possible → a vertical path minimizes compensation.

### Hypertrophy vs performance

- **Hypertrophy**: vertical path mandatory.
- **Performance** (max strength, powerlifting): free path, choose the most biomechanically advantageous one.

### Check

Film yourself from the **side** and check that the barbell, dumbbells or body follow a vertical path. If it is circular or diagonal → execution problem.

**Note**: this principle does **not apply to machines** (the path is dictated by the machine, not by gravity).

## Intentional isometric contraction ("imagine 200 kg")

A muscle activation technique that consists of **contracting a muscle as hard as possible without moving the load**, by imagining that the weight is enormous (e.g. 200 kg).

### Principle

- In the contracted position (e.g. the bottom position of the lat pulldown), imagine that the load is immense and that you have to resist with all your strength.
- **Push/pull as hard as possible without movement** → the isometric contraction produces maximal muscle activation.
- Works on every exercise: pull the bar of a bench press "without moving it", push the bar of a squat "without moving it", etc.

### Usefulness

- Lets you "wake up" a muscle that is hard to recruit before moving on to the dynamic movement.
- Excellent tool in a muscle activation protocol (see the `training-principles` skill).
- Can be used occasionally at the start of a set or between reps to confirm that the target muscle is being recruited.

## Sources

Titles translated from the French originals.

- Video: "7 tips that helped me build a BIG BACK" (Nassim Sahili)
- Video: "SHOULDER EXERCISES: from BEST to WORST exercise" (Nassim Sahili)
- Video: "TRICEPS EXERCISES: from BEST to WORST" (Nassim Sahili)
- Video: "BICEPS EXERCISES: from BEST to WORST" (Nassim Sahili)
- Video: "CHEST EXERCISES: from BEST to WORST" (Nassim Sahili)
- Video: "QUADRICEPS EXERCISES: from BEST to WORST" (Nassim Sahili)
- Video: "BACK EXERCISES: from BEST to WORST" (Nassim Sahili)
- Video: "Here's what real muscular failure looks like (chest session)" (Nassim Sahili)
- Video: "7 TIPS that helped me build BIG PECS" (Nassim Sahili)
- Video: "6 KEY STEPS to (finally) feel your BACK working" (Nassim Sahili)
- Video: "Pourquoi j'ai arrêté de faire ces 7 exercices (et ce que je fais à la place)" (Nassim Sahili) — "Why I stopped doing these 7 exercises (and what I do instead)" https://www.youtube.com/watch?v=ifMcCg9Gsac
- Video: "À quel niveau de musculation êtes-vous vraiment ? (les 5 stades décryptés)" (Nassim Sahili) — "What training level are you really at? (the 5 stages explained)" https://www.youtube.com/watch?v=05WPpiDdC78
