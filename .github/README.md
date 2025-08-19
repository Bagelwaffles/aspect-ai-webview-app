# GitHub Actions CI/CD for Aspect Marketing Solutions

This directory contains GitHub Actions workflows for automated building, testing, and deployment of the Aspect Marketing Solutions Android TWA.

## Workflows

### 1. Android CI/CD (`android-build.yml`)
**Triggers**: Push to main/develop, Pull requests, Manual dispatch
**Purpose**: Build and test Android app

**Steps**:
- Checkout code
- Set up JDK 17
- Cache Gradle dependencies
- Generate keystore (if not using secrets)
- Build debug APK and release AAB
- Upload artifacts

### 2. PWA Validation (`pwa-validation.yml`)
**Triggers**: Push to main/develop, Pull requests, Manual dispatch
**Purpose**: Validate PWA functionality

**Steps**:
- Build Next.js app
- Run Lighthouse PWA audit
- Validate manifest.json and service worker
- Upload validation reports

### 3. Release Build (`release.yml`)
**Triggers**: Git tags (v*), Manual dispatch
**Purpose**: Create production releases

**Steps**:
- Build signed release AAB
- Generate release notes
- Create GitHub release
- Upload release artifacts

## Setup Instructions

### 1. Repository Secrets
Add these secrets to your GitHub repository:

\`\`\`
KEYSTORE_BASE64          # Base64 encoded keystore file (optional)
KEYSTORE_PASSWORD        # Keystore password (optional, defaults to aspectmarketing2024)
KEY_PASSWORD            # Key password (optional, defaults to aspectmarketing2024)
\`\`\`

### 2. Keystore Setup (Optional)
If you want to use a persistent keystore across builds:

\`\`\`bash
# Generate keystore
keytool -genkey -v -keystore release-key.keystore -alias aspect-marketing-key -keyalg RSA -keysize 2048 -validity 10000

# Encode to base64
base64 -i release-key.keystore | pbcopy

# Add to GitHub secrets as KEYSTORE_BASE64
\`\`\`

### 3. Branch Protection
Recommended branch protection rules for `main`:
- Require status checks to pass
- Require branches to be up to date
- Require review from code owners
- Restrict pushes to matching branches

## Workflow Outputs

### Build Artifacts
- **debug-apk**: Debug APK for testing
- **release-aab**: Signed release AAB for Play Store
- **build-reports**: Gradle build reports
- **pwa-validation-report**: Lighthouse PWA audit results

### Release Artifacts
- **aspect-marketing-solutions-{version}.aab**: Production-ready AAB
- **RELEASE_NOTES.md**: Generated release notes
- **GitHub Release**: Automatic release creation for tags

## Usage Examples

### Manual Build
\`\`\`bash
# Trigger manual build
gh workflow run android-build.yml

# Trigger release build
gh workflow run release.yml -f version=1.0.1
\`\`\`

### Create Release
\`\`\`bash
# Create and push tag (triggers release workflow)
git tag v1.0.0
git push origin v1.0.0
\`\`\`

### Download Artifacts
\`\`\`bash
# Download latest build artifacts
gh run download --name release-aab

# Download specific run artifacts
gh run download 123456789 --name release-aab
\`\`\`

## Monitoring

### Build Status
- Check workflow status in GitHub Actions tab
- Monitor build times and success rates
- Review build logs for issues

### Notifications
- Configure GitHub notifications for workflow failures
- Set up Slack/Discord webhooks for build status
- Monitor email notifications for critical failures

## Troubleshooting

### Common Issues
1. **Keystore not found**: Ensure keystore secrets are properly configured
2. **Build timeout**: Increase timeout or optimize build steps
3. **Gradle cache issues**: Clear cache and retry build
4. **Permission denied**: Check gradlew executable permissions

### Debug Steps
1. Check workflow logs in GitHub Actions
2. Verify all required secrets are set
3. Test build locally with same JDK version
4. Review Gradle build configuration

## Security Considerations

### Secrets Management
- Never commit keystores or passwords to repository
- Use GitHub secrets for sensitive data
- Rotate keystore passwords regularly
- Limit access to repository secrets

### Build Security
- Pin action versions to specific commits
- Review third-party actions before use
- Monitor for security vulnerabilities
- Use minimal required permissions

## Performance Optimization

### Build Speed
- Use Gradle build cache
- Cache dependencies between runs
- Parallel build execution
- Incremental builds when possible

### Resource Usage
- Monitor build resource consumption
- Optimize Gradle memory settings
- Use appropriate runner sizes
- Clean up temporary files
