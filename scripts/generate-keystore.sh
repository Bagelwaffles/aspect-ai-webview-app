#!/bin/bash

# Generate Android keystore for release signing
# This script creates a keystore file for signing the Android app

KEYSTORE_FILE="android/app/release-key.keystore"
KEY_ALIAS="aspect-marketing-key"
KEYSTORE_PASSWORD="aspectmarketing2024"
KEY_PASSWORD="aspectmarketing2024"

echo "Generating Android keystore..."

# Create keystore directory if it doesn't exist
mkdir -p "$(dirname "$KEYSTORE_FILE")"

# Generate keystore
keytool -genkey -v \
  -keystore "$KEYSTORE_FILE" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "CN=Aspect Marketing Solutions, OU=Mobile, O=Aspect Marketing Solutions, L=City, S=State, C=US"

echo "Keystore generated successfully at: $KEYSTORE_FILE"
echo "Key alias: $KEY_ALIAS"
echo "Store password: $KEYSTORE_PASSWORD"
echo "Key password: $KEY_PASSWORD"
