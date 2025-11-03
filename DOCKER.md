# Docker Setup Guide

This guide explains how to run the Aletis backend using Docker.

## Prerequisites 

- Docker (version 20.10 or higher)
- Docker Compose (version 2.0 or higher)

## Quick Start

1. **Create a `.env` file** (copy from `.env.example` and update values):
   ```bash
   cp .env.example .env
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

3. **View logs**:
   ```bash
   docker-compose logs -f app
   ```

4. **Stop all services**:
   ```bash
   docker-compose down
   ```

## Services

The docker-compose setup includes:

- **app**: NestJS backend application (port 4000)
- **postgres**: PostgreSQL database (port 5432)
- **redis**: Redis cache (port 6379)

## Environment Variables

Key environment variables (see `.env.example` for full list):

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST` / `REDIS_PORT`: Redis connection details
- `JWT_SECRET`: JWT signing secret
- `GEMINI_API_KEY`: Google Gemini API key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuth credentials
- `BASE_URL`: Base URL for OAuth callbacks
- `FRONTEND_PRODUCTION_URL` / `FRONTEND_DEVELOPMENT_URL`: Frontend URLs

## Database Migrations

Migrations are automatically run when the container starts via the Dockerfile CMD.

To manually run migrations:
```bash
docker-compose exec app yarn prisma:migrate:deploy
```

To open Prisma Studio:
```bash
docker-compose exec app yarn prisma:studio
```

## Building the Image

To build the Docker image manually:
```bash
docker build -t aletis-backend .
```

## Development

For development, you may prefer to run the application locally with:
```bash
yarn dev
```

And use Docker only for dependencies:
```bash
docker-compose up -d postgres redis
```

## Volumes

- `postgres_data`: Persistent storage for PostgreSQL data
- `redis_data`: Persistent storage for Redis data
- `./public/uploads`: File uploads directory (mounted from host)

## Health Checks

- **App**: `http://localhost:4000/health`
- **PostgreSQL**: Automatically checked via `pg_isready`
- **Redis**: Automatically checked via `redis-cli ping`

## Troubleshooting

1. **Port conflicts**: If ports 4000, 5432, or 6379 are in use, update them in `docker-compose.yml` and `.env`

2. **Database connection issues**: Ensure the database service is healthy:
   ```bash
   docker-compose ps
   ```

3. **View service logs**:
   ```bash
   docker-compose logs postgres
   docker-compose logs redis
   docker-compose logs app
   ```

4. **Reset database** (⚠️ **WARNING**: This deletes all data):
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

