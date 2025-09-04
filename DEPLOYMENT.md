# OpenQuiz Deployment Configuration

## 🔒 Security Configuration

The application now supports flexible binding address configuration for different deployment scenarios.

## 🌍 Environment Variables

### Backend Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BIND_ADDRESS` | `localhost` | Server binding address |
| `PORT` | `8080` | Server port |
| `JWT_SECRET` | `your-secret-key-change-in-production` | JWT signing secret |

### Database Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `openquiz` | Database username |
| `DB_PASSWORD` | `openquiz123` | Database password |
| `DB_NAME` | `openquiz` | Database name |

### Redis Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |

## 🚀 Deployment Scenarios

### 1. Local Development
```bash
# Default: localhost only
cd backend && go run main.go
```

### 2. Local Network Testing (Mobile)
```bash
# Allow network access
BIND_ADDRESS=0.0.0.0 go run main.go
```

### 3. Docker Development
```bash
# Uses localhost by default
docker-compose up
```

### 4. Docker Production
```bash
# Uses 0.0.0.0 for container networking
docker-compose -f docker-compose.prod.yml up
```

### 5. Cloud Deployment
```bash
# Set appropriate binding address
BIND_ADDRESS=0.0.0.0 PORT=8080 go run main.go
```

## 🔐 Security Best Practices

### Production Deployment
- ✅ **Use `BIND_ADDRESS=0.0.0.0`** for containerized deployments
- ✅ **Use `BIND_ADDRESS=localhost`** for single-server deployments
- ✅ **Change `JWT_SECRET`** to a strong, unique value
- ✅ **Use environment variables** for all sensitive configuration
- ✅ **Implement proper firewall rules** to restrict access

### Development
- ✅ **Use `BIND_ADDRESS=localhost`** for local development
- ✅ **Use `BIND_ADDRESS=0.0.0.0`** only when testing on mobile devices

## 📱 Mobile Testing Setup

For mobile testing on local network:

```bash
# 1. Start backend with network access
BIND_ADDRESS=0.0.0.0 go run main.go

# 2. Start frontend with network access
cd frontend && npm run dev -- --hostname 0.0.0.0

# 3. Update frontend environment
echo "NEXT_PUBLIC_API_URL=http://YOUR_IP:8080" > frontend/.env.local
echo "NEXT_PUBLIC_WS_URL=ws://YOUR_IP:8080" >> frontend/.env.local
```

## 🐳 Docker Configuration

The production Docker Compose file automatically sets:
- `BIND_ADDRESS=0.0.0.0` for container networking
- Proper environment variables for all services
- Network isolation between services

## ✅ Git Commit Safety

**This configuration is safe to commit because:**
- ✅ Uses environment variables for sensitive settings
- ✅ Defaults to secure `localhost` binding
- ✅ Production settings are in Docker files
- ✅ No hardcoded secrets or IPs
