# Skyline

Skyline compares lunar landing sites and dates by showing where the Sun and Earth sit relative to each site's terrain horizon. That tells mission planners, educators and the public how much sunlight a site gets (power potential) and when it can see Earth (direct-to-Earth communication windows).

## Stack

| Part | Path | Tech |
| --- | --- | --- |
| Web app | `frontend/` | TanStack Start, React, Tailwind CSS v4, Vite, Biome |
| API | `backend/` | Go |
| Science pipeline | `ds/` | Python 3.12, uv |
| Science services | `services/` | Python, FastAPI |

## AI assistance

This project is built with AI coding assistants. Claude (Anthropic) and Codex (OpenAI) help generate and review code and documentation. Every change is reviewed, and every scientific number comes from the pipeline's own computation or a cited source, never from a model.
