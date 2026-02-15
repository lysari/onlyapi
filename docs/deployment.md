# Deployment

onlyApi ships with Docker, Kubernetes, Helm, and CI/CD configurations ready for production.

---

## Docker

### Dockerfile

The project includes a multi-stage Dockerfile that produces a minimal production image:

```dockerfile
# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Stage 2: Build
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Stage 3: Production (distroless)
FROM gcr.io/distroless/base
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3000
CMD ["./dist/main"]
```

**Result**: <20 MB production image with no shell, no package manager, no attack surface.

### Build and Run

```bash
# Build
docker build -t onlyapi .

# Run
docker run -p 3000:3000 \
  -e JWT_SECRET=your-secret-min-32-chars \
  -e NODE_ENV=production \
  onlyapi
```

### Docker Compose

```yaml
# docker-compose.yml
version: "3.9"

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
      DATABASE_DRIVER: sqlite
      DATABASE_PATH: /data/onlyapi.sqlite
    volumes:
      - data:/data

volumes:
  data:
```

### Docker Compose with PostgreSQL and Redis

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: onlyapi
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: onlyapi
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U onlyapi"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
      DATABASE_DRIVER: postgres
      DATABASE_URL: postgres://onlyapi:${DB_PASSWORD}@db:5432/onlyapi
      REDIS_ENABLED: "true"
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      LOG_FORMAT: json
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
```

---

## Kubernetes

### Manifests

The project includes production-ready Kubernetes manifests:

| Resource | File | Purpose |
|----------|------|---------|
| Namespace | `k8s/namespace.yaml` | Isolated namespace |
| ConfigMap | `k8s/configmap.yaml` | Non-sensitive configuration |
| Secret | `k8s/secret.yaml` | JWT secret, database credentials |
| Deployment | `k8s/deployment.yaml` | Pod specification with probes |
| Service | `k8s/service.yaml` | Internal ClusterIP service |
| Ingress | `k8s/ingress.yaml` | External HTTPS access |
| HPA | `k8s/hpa.yaml` | Autoscaling (2–10 replicas) |
| PDB | `k8s/pdb.yaml` | Disruption budget (min 1 available) |
| NetworkPolicy | `k8s/networkpolicy.yaml` | Restrict pod-to-pod traffic |

### Deploy

```bash
# Create namespace and resources
kubectl apply -f k8s/

# Verify
kubectl get pods -n onlyapi
kubectl get svc -n onlyapi
```

### Deployment Configuration

```yaml
# k8s/deployment.yaml (key sections)
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: onlyapi
          image: ghcr.io/lysari/onlyapi:latest
          ports:
            - containerPort: 3000
          env:
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: onlyapi-secret
                  key: jwt-secret
          resources:
            requests:
              memory: "64Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /readiness
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 15
```

### Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Network Policy

Restricts traffic to only ingress on port 3000 and egress to the database and Redis:

```yaml
spec:
  podSelector:
    matchLabels:
      app: onlyapi
  ingress:
    - ports:
        - port: 3000
  egress:
    - ports:
        - port: 5432  # PostgreSQL
        - port: 6379  # Redis
```

---

## Helm Chart

For parameterised deployments, the project includes a Helm chart with 8 templates.

### Install

```bash
helm install onlyapi ./helm/onlyapi \
  --set jwtSecret=your-secret-min-32-chars \
  --set database.driver=postgres \
  --set database.url=postgres://user:pass@db:5432/onlyapi \
  --set redis.enabled=true \
  --set redis.host=redis \
  --set redis.password=secret
```

### Values

```yaml
# helm/onlyapi/values.yaml
replicaCount: 3
image:
  repository: ghcr.io/lysari/onlyapi
  tag: latest
  pullPolicy: IfNotPresent

jwtSecret: ""
jwtExpiresIn: "15m"

database:
  driver: sqlite
  url: ""
  path: "data/onlyapi.sqlite"

redis:
  enabled: false
  host: "127.0.0.1"
  port: 6379
  password: ""

cors:
  origins: "*"

rateLimit:
  windowMs: 60000
  maxRequests: 100

logging:
  level: info
  format: json

resources:
  requests:
    memory: "64Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "500m"

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilization: 70

ingress:
  enabled: true
  hostname: api.example.com
  tls: true
```

### Upgrade

```bash
helm upgrade onlyapi ./helm/onlyapi --set image.tag=v2.0.1
```

---

## CI/CD Pipelines

### CI Pipeline (GitHub Actions)

Runs on every push and pull request:

```yaml
# .github/workflows/ci.yml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint          # Biome lint
      - run: bun run check         # TypeScript type-check
      - run: bun test              # All 351 tests
      - run: bun run build         # Production build
```

### CD Pipeline (GitHub Actions)

Triggered on version tag push (`v*`):

```yaml
# .github/workflows/cd.yml
jobs:
  build:
    # Multi-arch Docker build (amd64 + arm64)
    - docker buildx build --platform linux/amd64,linux/arm64 ...
    - docker push ghcr.io/lysari/onlyapi:${{ github.ref_name }}

  staging:
    # Deploy to staging
    - kubectl set image ... --namespace=onlyapi-staging
    # Smoke test
    - curl https://staging-api.example.com/health

  production:
    # Deploy to production (after staging passes)
    - kubectl set image ... --namespace=onlyapi
    # Create GitHub Release
    - gh release create ${{ github.ref_name }}
```

---

## Production Checklist

Before deploying to production, ensure:

- [ ] `JWT_SECRET` is a cryptographically random string (≥64 chars)
- [ ] `NODE_ENV=production`
- [ ] `LOG_FORMAT=json` for structured log aggregation
- [ ] `CORS_ORIGINS` is restricted to your domains (not `*`)
- [ ] Database credentials are in Kubernetes Secrets or a vault
- [ ] TLS termination is configured (Ingress/load balancer)
- [ ] Health check probes are configured (`/health`, `/readiness`)
- [ ] Resource limits are set (CPU, memory)
- [ ] HPA is enabled for auto-scaling
- [ ] Prometheus scraping is configured (`/metrics`)
- [ ] Alert webhook is configured for critical events
- [ ] Password policy is appropriate for your use case
- [ ] Rate limiting is tuned for expected traffic
