# --- build the React frontend
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig*.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# --- API + static files
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8000 FRONTEND_DIST=/app/dist DATABASE_URL=sqlite:////data/app.db
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend
COPY --from=web /app/dist ./dist
VOLUME ["/data"]
EXPOSE 8000
WORKDIR /app/backend
CMD ["python", "run.py"]
