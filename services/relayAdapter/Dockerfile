FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY docs ./docs
RUN pip install --no-cache-dir .
ENV RELAY_PROJECT_ROOT=/app
EXPOSE 8015
CMD ["python","-m","uvicorn","skyline_relay_adapter.api:app","--host","0.0.0.0","--port","8015"]
