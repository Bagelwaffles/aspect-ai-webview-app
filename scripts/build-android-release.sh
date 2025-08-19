#!/bin/bash

# Build Android release AAB (Android App Bundle)
# This script builds the release version of the Android TWA

set -e

echo "Building Android release AAB..."

# Navigate to android directory
cd android

# Clean previous builds
echo "Cleaning previous builds..."
./gradlew clean

# Build release AAB
echo "Building release AAB..."
./gradlew bundleRelease

# Check if build was successful
if [ -f "app/build/outputs/bundle/release/app-release.aab" ]; then
    echo "✅ Release AAB built successfully!"
    echo "📦 Location: android/app/build/outputs/bundle/release/app-release.aab"
    
    # Get file size
    SIZE=$(du -h "app/build/outputs/bundle/release/app-release.aab" | cut -f1)
    echo "📊 File size: $SIZE"
    
    # Copy to root for easy access
    cp "app/build/outputs/bundle/release/app-release.aab" "../aspect-marketing-solutions.aab"
    echo "📋 Copied to: aspect-marketing-solutions.aab"
else
    echo "❌ Build failed - AAB file not found"
    exit 1
fi

echo "🎉 Android release build complete!"
