#!/bin/bash

container="e3dc-knx-bridge"

echo "Stopping and removing old container..."
docker stop "$container" 2>/dev/null || true
docker rm "$container" 2>/dev/null || true

echo "Cloning repository..."
git clone https://github.com/alexwitzke/e3dc-knx-bridge.git

cd e3dc-knx-bridge || { echo "Failed to cd into e3dc-knx-bridge"; exit 1; }

echo "Building container..."
docker build -t "$container:latest" .

echo "Starting container..."
docker run -d \
    --name "$container" \
    -v /mnt/user/appdata/e3dc-knx-bridge:/app/config \
    --network host \
    --restart=unless-stopped \
    --log-driver json-file \
    --log-opt max-size=5m \
    --log-opt max-file=3 \
    "$container:latest"

if [ $? -eq 0 ]; then
    echo "Container '$container' successfully started."
else
    echo "Failed to start container!"
    exit 1
fi

echo "Cleaning up clone directory..."
cd ..
rm -rf e3dc-knx-bridge

echo "Done."