# Audience character models

Five static character meshes for the theater audience:

| File | Size |
|---|---|
| `child.glb` | 439 KB |
| `businessman.glb` | 395 KB |
| `businesswoman.glb` | 421 KB |
| `male-human.glb` | 426 KB |
| `woman-business-outfit.glb` | 424 KB |

All well under the ≤1.5 MB/character budget in
`docs/ENGINEERING_PLAN.md` §1.2 — no compression needed.

**Verified (Phase 0 gate, §1.1):** each file has exactly one static mesh,
**no skeleton, no animation tracks**. They are not rigged for
`Sit_Idle` / `Stand_Up_Clap`.

To use them as-is: static seated or standing poses only (no clap animation).
To get the skeletal clap: run each through the Mixamo pipeline described in
the engineering plan — auto-rig, apply a sitting-idle clip and a
stand-up-and-clap clip, export, rename the tracks to `Sit_Idle` /
`Stand_Up_Clap`, and re-export as GLB (ideally re-compressed with
`gltf-transform` afterward, since Mixamo exports are usually heavier).
