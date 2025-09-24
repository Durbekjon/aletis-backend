#!/bin/sh
set -e

# Wait for database if DATABASE_URL is provided
if [ -n "$DATABASE_URL" ]; then
  MASKED_DB_URL=$(echo "$DATABASE_URL" | sed -E 's#(postgresql://[^:]+):[^@]+@#\1:****@#')
  echo "Waiting for database at $MASKED_DB_URL ..."
  ATTEMPTS=0
  until npx prisma db execute --url "$DATABASE_URL" --stdin << EOF
-- test connection
EOF
  do
    ATTEMPTS=$((ATTEMPTS+1))
    if [ $ATTEMPTS -ge 30 ]; then
      echo "Database did not become ready in time" >&2
      exit 1
    fi
    sleep 2
  done
fi

# Run migrations (safe for production)
if [ -f ./prisma/schema.prisma ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy --schema ./prisma/schema.prisma || {
    echo "First migrate attempt failed, retrying in 3s...";
    sleep 3;
    npx prisma migrate deploy --schema ./prisma/schema.prisma;
  }
  # Prisma client is generated during image build
fi

exec "$@"

