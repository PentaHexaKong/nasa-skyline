FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MPLCONFIGDIR=/tmp/matplotlib
WORKDIR /app/scientificengine
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && mkdir -p /cache /science/data/processed/surfaceRf/demo/horizonCache \
    && chown -R 10001:10001 /cache /science
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*
RUN python -c "import numpy, scipy, spiceypy, rasterio, pyproj, pymoo"
COPY bootstrap.py server.py ./
USER 10001:10001
EXPOSE 8003
CMD ["python", "server.py", "--host", "0.0.0.0"]
