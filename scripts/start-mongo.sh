#!/usr/bin/env bash
# Starts MongoDB 8 on localhost:27017 for CI and waits until it answers a ping.
# A service container sometimes reports "unhealthy" the moment it starts, so CI runs this instead
# and tries a fresh container up to three times.
set -euo pipefail

for attempt in 1 2 3; do
  docker rm -f mongo >/dev/null 2>&1 || true
  docker run -d --name mongo -p 27017:27017 mongo:8 >/dev/null
  for _ in $(seq 60); do
    if docker exec mongo mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; then
      echo "MongoDB is up (attempt $attempt)"
      exit 0
    fi
    sleep 1
  done
  echo "MongoDB didn't answer on attempt $attempt:"
  docker logs --tail 30 mongo || true
done
exit 1
