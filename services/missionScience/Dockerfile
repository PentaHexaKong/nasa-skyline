FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .
EXPOSE 8014
CMD ["python", "-m", "uvicorn", "skyline_mission_science.api:app", "--host", "0.0.0.0", "--port", "8014"]
