# FFmpeg Docker container for video processing
FROM ubuntu:22.04

# Install FFmpeg and dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for API
RUN pip3 install flask

# Create directories
WORKDIR /app
RUN mkdir -p /app/uploads /app/output /app/temp

# Copy processing scripts
COPY process.py .
COPY server.py .

# Expose API port
EXPOSE 8081

# Run the server
CMD ["python3", "server.py"]
