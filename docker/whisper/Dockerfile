# Whisper.cpp Docker container for speech-to-text
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    wget \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Clone and build whisper.cpp
WORKDIR /app
RUN git clone https://github.com/ggerganov/whisper.cpp.git
WORKDIR /app/whisper.cpp

# Build whisper.cpp
RUN make

# Create models directory
RUN mkdir -p /app/models

# Download base.en model by default
ARG WHISPER_MODEL=base.en
RUN bash ./models/download-ggml-model.sh ${WHISPER_MODEL}
RUN mv models/ggml-${WHISPER_MODEL}.bin /app/models/

# Create simple HTTP server for API
WORKDIR /app
COPY server.py .
RUN apt-get update && apt-get install -y python3 python3-pip && \
    pip3 install flask && \
    rm -rf /var/lib/apt/lists/*

# Expose API port
EXPOSE 8080

# Set environment
ENV WHISPER_MODEL=${WHISPER_MODEL}
ENV WHISPER_PATH=/app/whisper.cpp

# Run the server
CMD ["python3", "server.py"]
