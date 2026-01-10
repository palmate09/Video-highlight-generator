# Video Highlight Generator

A production-ready full-stack web application for uploading large videos, searching clips with AI-powered semantic search, and generating highlight reels.

![Video Highlight Generator](https://via.placeholder.com/800x400?text=Video+Highlight+Generator)

## ✨ Features

- **📤 Chunked Video Upload**: Upload large video files with resumable uploads using tus protocol
- **🔍 AI-Powered Search**: Search through video content using semantic search and keyword matching
- **🎬 Automatic Clip Detection**: Scene-based clip extraction with transcript analysis
- **🗣️ Speech-to-Text**: Automatic transcription using whisper.cpp or OpenAI Whisper
- **🎯 Highlight Generation**: Create custom highlight reels from selected clips
- **🌙 Dark/Light Theme**: Beautiful UI with theme toggle
- **🔐 Secure Authentication**: JWT-based auth with refresh token rotation

## 🛠️ Technology Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Zustand (state management)
- Video.js (video player)
- tus-js-client (resumable uploads)

### Backend
- Node.js + Express + TypeScript
- Prisma (ORM)
- MySQL 8.0 (database)
- BullMQ + Redis (job queue)
- FFmpeg (video processing)

### AI/ML
- whisper.cpp (local transcription)
- transformers.js (local embeddings)
- OpenAI API (optional cloud alternative)

## 📋 Prerequisites

- Docker & Docker Compose
- Node.js 18+
- npm or yarn

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd video-highlight-generator

# Copy environment file
cp .env.example .env

# Edit .env with your settings
nano .env
```

### 2. Start with Docker

```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps
```

### 3. Start Development Servers

```bash
# Terminal 1: Backend
cd packages/backend
npm install
npm run dev

# Terminal 2: Frontend
cd packages/frontend
npm install
npm run dev
```

### 4. Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- API Documentation: http://localhost:3001/api/docs

## 📁 Project Structure

```
video-highlight-generator/
├── docker-compose.yml          # Docker services configuration
├── .env.example                # Environment variables template
├── packages/
│   ├── frontend/               # React + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── pages/          # Page components
│   │   │   ├── store/          # Zustand stores
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── services/       # API client
│   │   │   ├── types/          # TypeScript types
│   │   │   └── utils/          # Utility functions
│   │   └── package.json
│   │
│   ├── backend/                # Express + TypeScript
│   │   ├── src/
│   │   │   ├── config/         # Configuration
│   │   │   ├── controllers/    # Route controllers
│   │   │   ├── middleware/     # Express middleware
│   │   │   ├── services/       # Business logic
│   │   │   ├── workers/        # Background job workers
│   │   │   ├── routes/         # API routes
│   │   │   └── types/          # TypeScript types
│   │   ├── prisma/             # Database schema
│   │   └── package.json
│   │
│   └── shared/                 # Shared types & utilities
│       └── src/
│           └── types/
│
├── docker/                     # Docker configurations
│   ├── whisper/                # Whisper.cpp container
│   └── ffmpeg/                 # FFmpeg container
│
└── uploads/                    # Video storage (gitignored)
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | Required |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | Required |
| `TRANSCRIPTION_PROVIDER` | `whisper` or `openai` | `whisper` |
| `EMBEDDING_PROVIDER` | `transformers` or `openai` | `transformers` |
| `OPENAI_API_KEY` | OpenAI API key (if using cloud) | Optional |

### Using OpenAI Instead of Local Models

To use OpenAI for transcription and embeddings:

```env
TRANSCRIPTION_PROVIDER=openai
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-your-api-key
```

## 📖 API Documentation

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login and get tokens |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/logout` | POST | Invalidate refresh token |

### Videos

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/videos` | GET | List user's videos |
| `/api/videos/:id` | GET | Get video details |
| `/api/videos/:id` | DELETE | Delete video |
| `/api/videos/:id/clips` | GET | Get video clips |

### Upload

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload/init` | POST | Initialize upload session |
| `/api/upload/:id` | PATCH | Upload chunk (tus) |
| `/api/upload/:id` | HEAD | Get upload progress |
| `/api/upload/:id` | DELETE | Cancel upload |

### Search

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | POST | Search clips |

### Highlights

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/highlights` | GET | List highlights |
| `/api/highlights` | POST | Create highlight |
| `/api/highlights/:id` | GET | Get highlight status |
| `/api/highlights/:id/download` | GET | Download highlight video |

## 🧪 Testing

```bash
# Backend tests
cd packages/backend
npm run test           # Unit tests
npm run test:integration  # Integration tests

# Frontend tests
cd packages/frontend
npm run test           # Component tests
```

## 🚢 Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml up -d
```

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
