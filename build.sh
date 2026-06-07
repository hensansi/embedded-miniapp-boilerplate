#!/bin/sh
set -e
node --version
npm --version
npm install --legacy-peer-deps
npm run build
